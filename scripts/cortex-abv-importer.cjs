#!/usr/bin/env node

const fs = require('node:fs/promises')
const path = require('node:path')

const REQUIRED_BRIDGE_FIELDS = ['manifestHash', 'sourceSummary', 'format']
const REQUIRED_SUMMARY_FIELDS = [
  'sources',
  'counterpartyPacks',
  'knowledgePackLifecycleEvents'
]

const SUPPORTED_IMPORT_FORMAT = 'coqpi-cortex-to-cortexabv-ingest-v0'
const SESSION_SCOPE = 'coqpi_interview_en_fr'
const CORTEX_BRIDGE_FORMAT = 'coqpi-cortex-bridge-v0'
const SNAPSHOT_FORMAT = 'coqpi-context-pack-snapshot'

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value || {}, key)

const isAllowedIntakeManifestSummary = (value) =>
  value &&
  typeof value === 'object' &&
  REQUIRED_SUMMARY_FIELDS.every(
    (field) => Number.isInteger(value[field]) && value[field] >= 0
  )

const ensureRequiredTopFields = (payload, manifestSource) => {
  for (const field of REQUIRED_BRIDGE_FIELDS) {
    if (!hasOwn(payload, field)) {
      throw new Error(`missing required ${field} in ${manifestSource}`)
    }
  }

  if (typeof payload.format !== 'string' || !payload.format) {
    throw new Error(`missing required format in ${manifestSource}`)
  }

  if (typeof payload.manifestHash !== 'string' || payload.manifestHash.length === 0) {
    throw new Error(`missing required manifestHash in ${manifestSource}`)
  }

  if (payload.format !== CORTEX_BRIDGE_FORMAT && payload.format !== SNAPSHOT_FORMAT) {
    throw new Error(`unsupported payload format: ${payload.format}`)
  }

  if (!isAllowedIntakeManifestSummary(payload.sourceSummary)) {
    throw new Error(`missing required sourceSummary in ${manifestSource}`)
  }

  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (typeof payload.sourceSummary?.[field] !== 'number') {
      throw new Error(`invalid sourceSummary.${field} in ${manifestSource}`)
    }
  }
}

const reasonLabels = {
  wrong_version: 'wrong version',
  not_selected: 'not selected',
  not_retrieval_ready: 'not retrieval-ready',
  wrong_owner: 'wrong owner',
  not_private: 'not private',
  missing_interview_scope: 'missing EN/FR interview scope',
  missing: 'pack missing from manifest'
}

const collectReasonText = (reasons) =>
  reasons.map((reason) => reasonLabels[reason] ?? reason).join(', ')

const evaluatePackEligibility = (pack) => {
  const reasons = []
  const runtimePack = pack || {}

  if (runtimePack.version !== 1) {
    reasons.push('wrong_version')
  }

  if (runtimePack.selected !== true) {
    reasons.push('not_selected')
  }

  if (runtimePack.status !== 'retrieval_ready') {
    reasons.push('not_retrieval_ready')
  }

  if (runtimePack.ownerId !== 'owner') {
    reasons.push('wrong_owner')
  }

  if (runtimePack.classification !== 'private') {
    reasons.push('not_private')
  }

  if (
    !Array.isArray(runtimePack.retrievalScopes) ||
    !runtimePack.retrievalScopes.includes(SESSION_SCOPE)
  ) {
    reasons.push('missing_interview_scope')
  }

  return {
    eligible: reasons.length === 0,
    reasons
  }
}

const normalizePackForImport = (pack) => ({
  id: pack.id,
  sourceId: pack.sourceId,
  kind: pack.kind,
  partnerName: pack.partnerName,
  title: pack.title,
  summary: pack.summary,
  context: pack.context,
  links: Array.isArray(pack.links) ? pack.links : [],
  selected: !!pack.selected,
  status: pack.status,
  sourceSummary: {
    provenanceSourceId: pack.provenance?.sourceId,
    provenanceLocatorSha256: pack.provenance?.locatorSha256,
    contentHash: pack.contentHash,
    ownerId: pack.ownerId,
    classification: pack.classification,
    retrievalScopes: Array.isArray(pack.retrievalScopes)
      ? pack.retrievalScopes
      : []
  }
})

const buildDecisionRecordsFromBridge = (bridgeExport) => {
  const seen = new Set()
  const allow = []
  const deny = []

  const addDeny = ({ id, sourceId, label, reasonCode }) => {
    if (!id || seen.has(`d:${id}`)) {
      return
    }

    deny.push({
      decision: 'deny',
      id,
      sourceId,
      reasonCode,
      reason: `blocked: ${reasonLabels[reasonCode] || reasonCode}`,
      label
    })
    seen.add(`d:${id}`)
  }

  const addAllow = (pack) => {
    const key = `a:${pack.id}`
    if (!pack.id || seen.has(key)) {
      return
    }

    allow.push(normalizePackForImport(pack))
    seen.add(key)
  }

  for (const pack of bridgeExport.selectedCounterpartyPacks || []) {
    const { eligible, reasons } = evaluatePackEligibility(pack)
    if (!eligible) {
      addDeny({
        id: pack.id,
        sourceId: pack.sourceId,
        label: pack.title || pack.partnerName || pack.id,
        reasonCode: reasons[0] || 'missing'
      })
      continue
    }

    addAllow(pack)
  }

  for (const dropped of bridgeExport.droppedCounterpartyPacks || []) {
    addDeny(dropped)
  }

  return { allow, deny }
}

const buildDecisionRecordsFromManifest = (snapshot) => {
  const byId = new Map()
  const allow = []
  const deny = []
  const seenAllow = new Set()
  const seenDeny = new Set()
  const packs = Array.isArray(snapshot.manifest?.counterpartyPacks)
    ? snapshot.manifest.counterpartyPacks
    : []

  for (const pack of packs) {
    if (!pack || typeof pack.id !== 'string') {
      continue
    }

    byId.set(pack.id, pack)
    const { eligible, reasons } = evaluatePackEligibility(pack)

    if (eligible) {
      if (!seenAllow.has(pack.id)) {
        allow.push(normalizePackForImport(pack))
        seenAllow.add(pack.id)
      }
      continue
    }

    if (!seenDeny.has(pack.id)) {
      const reasonCode = reasons[0] || 'missing'
      deny.push({
        decision: 'deny',
        id: pack.id,
        sourceId: pack.sourceId,
        label: pack.title || pack.partnerName || pack.id,
        reasonCode,
        reason: `blocked: ${collectReasonText(reasons)}`
      })
      seenDeny.add(pack.id)
    }
  }

  return { allow, deny }
}

const buildCortexABVImportPlan = ({ snapshot, bridgeExport, validation }) => {
  if (!snapshot && !bridgeExport) {
    throw new Error('cortex-abv import requires snapshot or bridge export payload')
  }

  if (validation && validation.valid === false) {
    throw new Error('cortex-abv import plan requires valid validation artifact')
  }

  const source = bridgeExport || snapshot
  ensureRequiredTopFields(source, bridgeExport ? 'bridge export' : 'handoff snapshot')

  const payload = bridgeExport
    ? buildDecisionRecordsFromBridge(bridgeExport)
    : buildDecisionRecordsFromManifest(snapshot)

  const plan = {
    version: 1,
    format: SUPPORTED_IMPORT_FORMAT,
    generatedAt: new Date().toISOString(),
    manifestHash: source.manifestHash,
    sourceSummary: source.sourceSummary,
    decisions: {
      allow: payload.allow,
      deny: payload.deny
    }
  }

  if (validation) {
    plan.validation = {
      valid: Boolean(validation.valid),
      errors: validation.errors,
      warnings: validation.warnings
    }
  }

  return plan
}

const parseArgs = (argv = []) => {
  const args = { input: null, bridgeExport: null, validation: null, output: null }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      args[token.replace(/^--/, '')] = next
      index += 1
    } else if (token === '--help') {
      args.help = true
    }
  }

  return args
}

const usage = () => `Usage:
  node scripts/cortex-abv-importer.cjs \
    --snapshot <coqpi-context-pack.snapshot.json> \
    --validation <handoff.validation.json> \
    [--output <file>]

  node scripts/cortex-abv-importer.cjs \
    --bridge-export <coqpi-cortex-bridge-v0.json> \
    [--validation <handoff.validation.json>] \
    [--output <file>]

  Build allow/deny plan without raw content export.
  Snapshot format: coqpi-context-pack-snapshot
  Bridge format: coqpi-cortex-bridge-v0`

const loadJson = async (inputPath) => {
  const raw = await fs.readFile(path.resolve(inputPath), 'utf8')
  return JSON.parse(raw)
}

const run = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv)

  if (args.help || (!args['snapshot'] && !args['bridge-export'])) {
    console.log(usage())
    process.exit(args.help ? 0 : 1)
  }

  const snapshot = args.snapshot
    ? await loadJson(args.snapshot)
    : null
  const bridgeExport = args['bridge-export']
    ? await loadJson(args['bridge-export'])
    : null

  const validation = args.validation
    ? await loadJson(args.validation)
    : null

  const plan = buildCortexABVImportPlan({
    snapshot,
    bridgeExport,
    validation
  })

  const output = JSON.stringify(plan, null, 2)
  if (args.output) {
    await fs.writeFile(path.resolve(args.output), `${output}\n`, 'utf8')
    console.log(path.resolve(args.output))
    return
  }

  process.stdout.write(`${output}\n`)
}

module.exports = {
  buildCortexABVImportPlan,
  evaluatePackEligibility,
  buildDecisionRecordsFromBridge,
  buildDecisionRecordsFromManifest,
  parseArgs,
  reasonLabels,
  run
}

if (require.main === module) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}

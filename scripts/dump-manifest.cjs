#!/usr/bin/env node

const nodeCrypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const parseArgs = (argv) => {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      continue
    }

    const key = token
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      index += 1
    } else if (
      key === '--sign' ||
      key === '--dump-manifest' ||
      key === '--validate' ||
      key === '--help'
    ) {
      args[key] = true
    }
  }

  return args
}

const stableJson = (value) => JSON.stringify(value, undefined, 2)

const readJsonFile = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

const readHistoryEvents = async (historyPath) => {
  try {
    const raw = await fs.readFile(historyPath, 'utf8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

const computeHash = (value) =>
  nodeCrypto.createHash('sha256').update(value).digest('hex')

const isHexDigest = (value) => /^[a-f0-9]{64}$/i.test(value || '')

const isManifestSource = (source) => {
  if (!source || typeof source !== 'object') {
    return false
  }

  if (
    typeof source.id !== 'string' ||
    typeof source.kind !== 'string' ||
    typeof source.location !== 'string' ||
    typeof source.label !== 'string' ||
    typeof source.createdAt !== 'string' ||
    typeof source.ownerId !== 'string' ||
    (source.contentHash !== null && typeof source.contentHash !== 'string')
  ) {
    return false
  }

  if (!Array.isArray(source.retrievalScopes)) {
    return false
  }

  if (
    !source.provenance ||
    typeof source.provenance.sourceId !== 'string' ||
    !isHexDigest(source.provenance.locatorSha256)
  ) {
    return false
  }

  if (
    !source.retention ||
    typeof source.retention.maxAgeDays !== 'number' ||
    typeof source.retention.expiresAt !== 'string' ||
    source.retention.mode !== 'manual_deletion_required'
  ) {
    return false
  }

  return true
}

const validateManifest = async (options) => {
  const manifestDir = resolveCoreDirectory(options)
  const manifestPath = path.join(manifestDir, 'manifest.json')
  const historyPath = path.join(manifestDir, 'coqpi-context-pack.history.jsonl')

  const manifest = await readJsonFile(manifestPath)
  const history = await readHistoryEvents(historyPath)

  const errors = []
  const warnings = []

  if (!manifest || typeof manifest !== 'object' || manifest.version !== 1) {
    errors.push('manifest.version must be 1')
  }
  if (!Array.isArray(manifest.sources)) {
    errors.push('manifest.sources must be an array')
  } else {
    for (const source of manifest.sources) {
      if (!isManifestSource(source)) {
        errors.push(`invalid source entry for id=${source?.id || 'unknown'}`)
      }
    }
  }

  let previousEventHash = null
  for (const [index, event] of history.entries()) {
    if (!event || typeof event !== 'object') {
      errors.push(`invalid history line ${index + 1}`)
      continue
    }

    if (!isHexDigest(event.eventHash)) {
      errors.push(`history line ${index + 1}: eventHash missing or invalid`)
    }
    if (index > 0 && event.previousEventHash !== previousEventHash) {
      errors.push(
        `history line ${index + 1}: previousEventHash must match prior eventHash`
      )
    }
    if (!event.timestamp || typeof event.timestamp !== 'string') {
      warnings.push(`history line ${index + 1}: missing timestamp`)
    }

    previousEventHash = event.eventHash || previousEventHash
  }

  return {
    valid: errors.length === 0,
    manifestPath,
    manifestDir,
    manifestHash: computeHash(stableJson(manifest)),
    manifest,
    history,
    errors,
    warnings
  }
}

const signSnapshot = (snapshot, key) =>
  nodeCrypto.createHmac('sha256', key).update(stableJson(snapshot)).digest('hex')

const resolveCoreDirectory = (args) => {
  if (args['--manifest-dir']) {
    return path.resolve(process.cwd(), args['--manifest-dir'])
  }

  if (process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR) {
    return path.resolve(process.cwd(), process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR)
  }

  return path.resolve(process.cwd(), 'data', 'context-sources')
}

const usage = () => `Usage:
  node scripts/dump-manifest.cjs --dump-manifest [--manifest-dir DIR] [--output FILE] [--sign [KEY]]
  node scripts/dump-manifest.cjs --validate [--manifest-dir DIR]

Options:
  --dump-manifest          Emit a compact handoff snapshot.
  --validate               Validate manifest + history consistency for handoff safety.
  --manifest-dir <path>    Personal knowledge-core directory (default: COQPI_PERSONAL_KNOWLEDGE_CORE_DIR or ./data/context-sources)
  --output <file>          Save snapshot JSON to a file instead of stdout.
  --sign                   Sign snapshot payload with HMAC-SHA256.
  --key <key>              Signing key for --sign (or COQPI_CONTEXT_PACK_SIGNING_KEY env var).
  --help                   Show this help.`

const dumpManifestSnapshot = async (options) => {
  const manifestDir = resolveCoreDirectory(options)
  const manifestPath = path.join(manifestDir, 'manifest.json')
  const historyPath = path.join(manifestDir, 'coqpi-context-pack.history.jsonl')

  const manifest = await readJsonFile(manifestPath)
  const history = await readHistoryEvents(historyPath)
  const manifestHash = computeHash(stableJson(manifest))
  const snapshot = {
    version: 1,
    format: 'coqpi-context-pack-snapshot',
    generatedAt: new Date().toISOString(),
    manifestDir,
    manifestHash,
    manifest,
    history
  }

  if (options.signEnabled) {
    const key = options.signingKey || process.env.COQPI_CONTEXT_PACK_SIGNING_KEY
    if (!key) {
      throw new Error(
        '--sign requires a key via --key or COQPI_CONTEXT_PACK_SIGNING_KEY'
      )
    }

    snapshot.signature = {
      algorithm: 'HMAC-SHA256',
      keyId: options.keyId || 'default',
      digest: signSnapshot(snapshot, key),
      signedAt: new Date().toISOString()
    }
  }

  return snapshot
}

const run = async () => {
  const args = parseArgs(process.argv.slice(2))

  if (
    args['--help'] ||
    (!args['--dump-manifest'] && !args['--validate'])
  ) {
    console.log(usage())
    process.exit(args['--help'] ? 0 : 1)
  }

  try {
    if (args['--validate']) {
      const result = await validateManifest(args)
      if (args['--output']) {
        const outputPath = path.resolve(process.cwd(), args['--output'])
        await fs.writeFile(outputPath, `${stableJson(result)}\n`, 'utf8')
        console.log(outputPath)
      } else {
        if (result.valid) {
          console.log('manifest and history validation: OK')
        } else {
          console.error(
            'manifest and history validation: FAIL',
            `errors=${result.errors.length}`
          )
          for (const error of result.errors) {
            console.error(` - ${error}`)
          }
        }

        if (result.warnings.length > 0) {
          for (const warning of result.warnings) {
            console.warn(` ! ${warning}`)
          }
        }
      }
      process.exitCode = result.valid ? 0 : 1
      return
    }

    const snapshot = await dumpManifestSnapshot({
      manifestDir: args['--manifest-dir'],
      signEnabled: Boolean(args['--sign']),
      signingKey:
        args['--key'] ||
        process.env.COQPI_CONTEXT_PACK_SIGNING_KEY,
      keyId: args['--key-id']
    })

    const output = stableJson(snapshot)
    if (args['--output']) {
      const outPath = path.resolve(process.cwd(), args['--output'])
      await fs.writeFile(outPath, `${output}\n`, 'utf8')
      console.log(outPath)
      return
    }

    process.stdout.write(`${output}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  }
}

module.exports = {
  dumpManifestSnapshot,
  validateManifest,
  parseArgs,
  resolveCoreDirectory,
  signSnapshot,
  stableJson,
  run
}

if (require.main === module) {
  run()
}

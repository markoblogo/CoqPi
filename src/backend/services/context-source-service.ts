import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  ContextSource,
  ContextSourceDraft,
  ContextSourceKind,
  ContextSourceManifest,
  ContextSourceManifestResult,
  CounterpartyContextPack,
  CounterpartyContextPackDraft,
  ContextPackRetrievalKind,
  RetrievalProvider,
  CounterpartyFinderPayloadPreviewCandidate,
  CounterpartyFinderPayloadPreviewResult,
  CounterpartyPayloadIngestSummary
} from '../../shared/app-types'
import { contextPackKindValues } from '../../shared/app-types'
import {
  normalizeFinderCounterpartyDraft,
  parseFinderCounterpartyPayloadTextPermissive,
  type ParsedFinderCounterpartyPayload
} from '../../shared/finder-ingest-contract'
import { getAppInfo } from './app-state'

type IngressEvent =
  | { version: 1; type: 'ingress_added'; source: ContextSource }
  | { version: 1; type: 'selection_changed'; id: string; selected: boolean }
  | { version: 1; type: 'source_removed'; id: string }
  | {
      version: 1
      type: 'content_captured'
      id: string
      contentHash: string
      capturedText: string | null
      retrievalReady: boolean
    }
  | {
      version: 1
      type: 'counterparty_pack_imported'
      pack: CounterpartyContextPack
    }
  | {
      version: 1
      type: 'counterparty_pack_selection_changed'
      id: string
      selected: boolean
    }
  | { version: 1; type: 'counterparty_pack_removed'; id: string }

type ManifestHistoryEvent = {
  version: 1
  timestamp: string
  action: string
  reason: string
  sourceVersion: 1
  manifestHash: string
  eventHash: string
  previousEventHash: string | null
  sourceCount: number
  counterpartyPackCount?: number
  repositoryHead: string
}

const sourceKinds: ContextSourceKind[] = ['link', 'file', 'folder', 'path']
const finderRetrievalScopes = ['coqpi_interview_en_fr']
const allowedPackKinds = contextPackKindValues
const RETENTION_DAYS = 30
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024
const MAX_CAPTURE_TEXT_CHARS = 12000
const readableExtensions = new Set(['.md', '.txt', '.csv', '.json'])

type CounterpartyContextPackEventedManifest = ContextSourceManifest & {
  counterpartyPacks: CounterpartyContextPack[]
}

const emptyManifest = (): CounterpartyContextPackEventedManifest => ({
  version: 1,
  sources: [],
  counterpartyPacks: []
})

const isPackKind = (value: unknown): value is (typeof allowedPackKinds)[number] =>
  typeof value === 'string' &&
  (allowedPackKinds as readonly string[]).includes(value)

const locateSourceHash = (sourceId: string) =>
  createHash('sha256').update(sourceId).digest('hex')

const canonicalPackText = (pack: CounterpartyContextPackDraft) =>
  JSON.stringify(
    {
      partnerName: sanitizeText(pack.partnerName),
      kind: pack.kind,
      title: sanitizeText(pack.title),
      summary: sanitizeText(pack.summary),
      context: sanitizeText(pack.context),
      links: Array.isArray(pack.links)
        ? [...pack.links.map(sanitizeText).filter(Boolean)].sort()
        : []
    },
    undefined,
    2
  )

const getCoreDirectory = () => getAppInfo().personalKnowledgeCoreDirectory
const getLedgerPath = () =>
  path.join(getCoreDirectory(), 'coqpi-ingress.events.jsonl')
const getManifestJsonPath = () => path.join(getCoreDirectory(), 'manifest.json')
const getManifestMarkdownPath = () =>
  path.join(getCoreDirectory(), 'coqpi-context-pack.manifest.md')
const getManifestHistoryPath = () =>
  path.join(getCoreDirectory(), 'coqpi-context-pack.history.jsonl')
const getLegacyManifestPath = () =>
  path.join(process.cwd(), 'data', 'context-sources', 'manifest.json')

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const sanitizePackIds = (packIds?: string[]) =>
  [...new Set((packIds ?? []).map(sanitizeText).filter(Boolean))]

const sanitizeContextPackRetrievalKinds = (
  kinds?: unknown
): ContextPackRetrievalKind[] | undefined => {
  if (!Array.isArray(kinds)) {
    return undefined
  }

  const normalized = kinds
    .map((kind) => sanitizeText(kind))
    .filter(
      (kind): kind is ContextPackRetrievalKind =>
        (contextPackKindValues as readonly string[]).includes(kind)
    )

  return normalized.length > 0 ? [...new Set(normalized)] : undefined
}

const locatorSha256 = (kind: ContextSourceKind, location: string) =>
  createHash('sha256')
    .update(JSON.stringify({ kind, location }))
    .digest('hex')

const retentionFor = (createdAt: string) => ({
  mode: 'manual_deletion_required' as const,
  maxAgeDays: RETENTION_DAYS,
  expiresAt: new Date(
    Date.parse(createdAt) + RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
})

const toDefaultLabel = (location: string, kind: ContextSourceKind) => {
  if (kind === 'link') {
    try {
      return new URL(location).hostname || location
    } catch {
      return location
    }
  }

  return path.basename(location) || location
}

const sanitizeSource = (value: unknown): ContextSource | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<ContextSource>
  const kind = candidate.kind as ContextSourceKind | undefined
  const location = sanitizeText(candidate.location)
  const id = sanitizeText(candidate.id)
  const createdAt = sanitizeText(candidate.createdAt)

  if (!kind || !sourceKinds.includes(kind) || !location || !id || !createdAt) {
    return null
  }

  return {
    id,
    kind,
    location,
    label: sanitizeText(candidate.label) || toDefaultLabel(location, kind),
    selected: candidate.selected === true,
    status: 'pending_classification',
    createdAt,
    ownerId: 'owner',
    provenance: {
      sourceId: `coqpi:ingress:${id}`,
      locatorSha256: locatorSha256(kind, location)
    },
    contentHash: null,
    classification: 'pending',
    retention: retentionFor(createdAt),
    retrievalScopes: ['coqpi_pending_classification'],
    promotion: 'explicit_audit_required'
  }
}

const sanitizeCounterpartyPack = (
  value: unknown
): Omit<CounterpartyContextPack, 'id' | 'createdAt'> | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<CounterpartyContextPack>
  const kind = candidate.kind as CounterpartyContextPack['kind'] | undefined
  const sourceId = sanitizeText(candidate.sourceId)
  const partnerName = sanitizeText(candidate.partnerName)
  const title = sanitizeText(candidate.title)
  const summary = sanitizeText(candidate.summary)

  if (!isPackKind(kind) || !sourceId || !partnerName || !title || !summary) {
    return null
  }

  return {
    sourceId,
    kind,
    partnerName,
    title,
    summary,
    context: sanitizeText(candidate.context),
    links: Array.isArray(candidate.links)
      ? candidate.links.map(sanitizeText).filter(Boolean)
      : [],
    selected: candidate.selected === true,
    status: 'retrieval_ready',
    ownerId: 'owner',
    provenance: {
      sourceId: `coqpi:finder:${sourceId}`,
      locatorSha256: locateSourceHash(sourceId)
    },
    contentHash: createHash('sha256').update(canonicalPackText(candidate as CounterpartyContextPackDraft)).digest('hex'),
    classification: 'private',
    retention: retentionFor(new Date().toISOString()),
    retrievalScopes: finderRetrievalScopes,
    promotion: 'explicit_audit_required'
  }
}

const appendEvent = async (event: IngressEvent) => {
  const ledgerPath = getLedgerPath()
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true })
  await fs.appendFile(ledgerPath, `${JSON.stringify(event)}\n`, 'utf8')
}

const parseEvents = (raw: string): IngressEvent[] =>
  raw
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const candidate = JSON.parse(line) as IngressEvent
        return candidate?.version === 1 ? [candidate] : []
      } catch {
        return []
      }
    })

const deriveManifest = (
  events: IngressEvent[]
): CounterpartyContextPackEventedManifest => {
  const sources = new Map<string, ContextSource>()
  const counterpartyPacks = new Map<string, CounterpartyContextPack>()

  for (const event of events) {
    if (event.type === 'ingress_added') {
      const source = sanitizeSource(event.source)
      if (source) {
        sources.set(source.id, source)
      }
    } else if (event.type === 'selection_changed') {
      const source = sources.get(event.id)
      if (source) {
        sources.set(event.id, { ...source, selected: event.selected })
      }
    } else if (event.type === 'source_removed') {
      sources.delete(event.id)
    } else if (event.type === 'content_captured') {
      const source = sources.get(event.id)
      if (source) {
        sources.set(event.id, {
          ...source,
          contentHash: event.contentHash,
          classification: 'private',
          status: event.retrievalReady ? 'retrieval_ready' : 'hash_captured',
          retrievalScopes: event.retrievalReady
            ? ['coqpi_interview_en_fr']
            : []
        })
      }
    } else if (event.type === 'counterparty_pack_imported') {
      const normalized = sanitizeCounterpartyPack(event.pack)
      if (normalized) {
        const createdAt = sanitizeText(event.pack.createdAt) || new Date().toISOString()
        const id = sanitizeText(event.pack.id) || randomUUID()
        const retrievalScopes =
          event.pack.retrievalScopes?.filter((scope) =>
            finderRetrievalScopes.includes(scope)
          ) || []

        counterpartyPacks.set(event.pack.id || id, {
          ...normalized,
          id,
          createdAt,
          selected: event.pack.selected !== false,
          status: event.pack.status || 'retrieval_ready',
          retrievalScopes:
            retrievalScopes.length > 0 ? retrievalScopes : finderRetrievalScopes,
          context: sanitizeText(event.pack.context)
        })
      }
    } else if (event.type === 'counterparty_pack_selection_changed') {
      const pack = counterpartyPacks.get(event.id)
      if (pack) {
        counterpartyPacks.set(event.id, { ...pack, selected: event.selected })
      }
    } else if (event.type === 'counterparty_pack_removed') {
      counterpartyPacks.delete(event.id)
    }
  }

  return {
    version: 1,
    sources: [...sources.values()],
    counterpartyPacks: [...counterpartyPacks.values()]
  }
}

const stableManifestJson = (manifest: CounterpartyContextPackEventedManifest) =>
  JSON.stringify(manifest, undefined, 2)

const getRepositoryHead = () => {
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      cwd: process.cwd()
    }).trim()

    return head || 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const formatDateShort = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'short'
  })

const appendManifestHistory = async (
  manifest: CounterpartyContextPackEventedManifest,
  reason: string
) => {
  const historyPath = getManifestHistoryPath()
  const now = new Date().toISOString()
  const manifestHash = createHash('sha256')
    .update(stableManifestJson(manifest))
    .digest('hex')

  let previousEventHash: string | null = null
  try {
    const rawHistory = await fs.readFile(historyPath, 'utf8')
    const lines = rawHistory.split('\n').filter(Boolean)
    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]!) as ManifestHistoryEvent
      previousEventHash = last.eventHash
    }
  } catch {
    previousEventHash = null
  }

  const eventHash = createHash('sha256')
    .update(
      JSON.stringify({
        timestamp: now,
        reason,
        manifestHash,
        sourceCount: manifest.sources.length,
        counterpartyPackCount: manifest.counterpartyPacks.length,
        previousEventHash
      })
    )
    .digest('hex')

  const historyEvent: ManifestHistoryEvent = {
    version: 1,
    timestamp: now,
    sourceVersion: 1,
    action: reason,
    reason,
    sourceCount: manifest.sources.length,
    counterpartyPackCount: manifest.counterpartyPacks.length,
    manifestHash,
    eventHash,
    previousEventHash,
    repositoryHead: getRepositoryHead()
  }

  await fs.appendFile(historyPath, `${JSON.stringify(historyEvent)}\n`, 'utf8')
}

const writeManifestArtifacts = async (
  manifest: CounterpartyContextPackEventedManifest,
  reason: string
) => {
  const manifestPath = getManifestJsonPath()
  const markdownPath = getManifestMarkdownPath()
  const now = new Date().toISOString()

  const activeScopes = Array.from(
    new Set([
      ...manifest.sources.flatMap((source) => source.retrievalScopes),
      ...manifest.counterpartyPacks.flatMap((pack) => pack.retrievalScopes)
    ])
  ).sort()

  const activeStatuses = Array.from(
    new Set(manifest.sources.map((source) => source.status))
  ).sort()
  const packKinds = new Set(manifest.counterpartyPacks.map((pack) => pack.kind))

  const packStatusLines = manifest.counterpartyPacks.flatMap((pack) => [
    `### ${pack.title}`,
    `- id: ${pack.id}`,
    `- partner: ${pack.partnerName}`,
    `- type: ${pack.kind}`,
    `- source_id: ${pack.sourceId}`,
    `- selected: ${pack.selected}`,
    `- status: ${pack.status}`,
    `- scopes: ${pack.retrievalScopes.join(', ') || 'none'}`,
    `- owner: ${pack.ownerId}`,
    `- created: ${formatDateShort(pack.createdAt)}`,
    `- classification: ${pack.classification}`,
    `- content_hash: ${pack.contentHash}`,
    `- retention: ${pack.retention.maxAgeDays}d (manual_deletion_required)`
  ])

  const markdown = [
    '# CoqPi Context Pack',
    `Generated: ${now}`,
    `Reason: ${reason}`,
    `Sources: ${manifest.sources.length}`,
    `Counterparty packs: ${manifest.counterpartyPacks.length}`,
    `Pack kinds: ${Array.from(packKinds).sort().join(', ') || 'none'}`,
    `Statuses: ${activeStatuses.join(', ') || 'none'}`,
    `Scopes: ${activeScopes.join(', ') || 'none'}`,
    `Repository: ${getRepositoryHead()}`,
    '',
    '## Sources',
    ...manifest.sources.flatMap((source) => [
      `### ${source.label}`,
      `- id: ${source.id}`,
      `- kind: ${source.kind}`,
      `- location: ${source.location}`,
      `- selected: ${source.selected}`,
      `- status: ${source.status}`,
      `- owner: ${source.ownerId}`,
      `- created: ${formatDateShort(source.createdAt)}`,
      `- classification: ${source.classification}`,
      `- content_hash: ${source.contentHash ?? 'pending'}`,
      `- retention: ${source.retention.maxAgeDays}d (manual_deletion_required)`
    ]),
    '',
    '## Counterparty context packs',
    ...packStatusLines,
    ''
  ].join('\n')

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${stableManifestJson(manifest)}\n`, 'utf8')
  await fs.writeFile(markdownPath, `${markdown}\n`, 'utf8')
  await appendManifestHistory(manifest, reason)
}

const migrateLegacyManifestIfNeeded = async () => {
  try {
    await fs.access(getLedgerPath())
    return
  } catch {
    // The previous manifest is read only to preserve the owner's existing selections.
  }

  try {
    const raw = await fs.readFile(getLegacyManifestPath(), 'utf8')
    const legacy = JSON.parse(raw) as { sources?: unknown[] }
    const sources = Array.isArray(legacy.sources)
      ? legacy.sources
          .map(sanitizeSource)
          .filter((source): source is ContextSource => source !== null)
      : []

    for (const source of sources) {
      await appendEvent({ version: 1, type: 'ingress_added', source })
    }

    if (sources.length > 0) {
      await writeManifestArtifacts(
        { version: 1, sources, counterpartyPacks: [] },
        'migrated legacy manifest into ledger'
      )
    }
  } catch {
    // A missing or invalid legacy manifest is not an error for a new core.
  }
}

const readManifest = async () => {
  await migrateLegacyManifestIfNeeded()
  try {
    return deriveManifest(parseEvents(await fs.readFile(getLedgerPath(), 'utf8')))
  } catch {
    return emptyManifest()
  }
}

const validateDraft = (draft: ContextSourceDraft) => {
  const kind = draft.kind
  const location = sanitizeText(draft.location)

  if (!sourceKinds.includes(kind) || !location) {
    throw new Error('A source type and location are required.')
  }

  if (kind === 'link') {
    let parsed: URL
    try {
      parsed = new URL(location)
    } catch {
      throw new Error('Enter a valid http or https link.')
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https links can be recorded.')
    }
  }

  return {
    kind,
    location,
    label: sanitizeText(draft.label) || toDefaultLabel(location, kind)
  }
}

const validateCounterpartyDraft = (draft: CounterpartyContextPackDraft) => {
  const normalized = normalizeFinderCounterpartyDraft(draft as unknown as Record<string, unknown>)

  if (!isPackKind(normalized.kind)) {
    throw new Error(
      'A counterparty pack requires kind, sourceId, partnerName, title and summary.'
    )
  }

  return {
    sourceId: normalized.sourceId,
    kind: normalized.kind,
    partnerName: normalized.partnerName,
    title: normalized.title,
    summary: normalized.summary,
    context: normalized.context,
    links: normalized.links ?? [],
    selected: normalized.selected !== false
  }
}

export const createContextPackFromFinder = (
  payloadText: string
): ParsedFinderCounterpartyPayload => {
  return parseFinderCounterpartyPayloadTextPermissive(payloadText)
}

const parseFinderCounterpartyPayloadDrafts = (drafts: unknown[]) => {
  if (!Array.isArray(drafts)) {
    throw new Error('Finder payload must be an array for batch counterparty ingest.')
  }

  let requestedCount = 0
  const safeDrafts: CounterpartyContextPackDraft[] = []
  const errors: CounterpartyPayloadIngestSummary['errors'] = []

  const asArray = drafts

  requestedCount = asArray.length

  for (let index = 0; index < asArray.length; index += 1) {
    try {
      safeDrafts.push(
        validateCounterpartyDraft(
          asArray[index] as CounterpartyContextPackDraft
        )
      )
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Malformed finder candidate payload.'

      errors.push({
        index,
        reason: `Invalid finder counterparty payload item at index ${index}: ${reason}`
      })
    }
  }

  return {
    requestedCount,
    drafts: safeDrafts,
    errors
  }
}

const ingestCounterpartyFinderDraftsWithSummary = async (
  payload: { requestedCount: number; drafts: CounterpartyContextPackDraft[]; errors: CounterpartyPayloadIngestSummary['errors'] }
) => {
  const beforeManifest = await readManifest()
  const beforeCount = beforeManifest.counterpartyPacks?.length ?? 0
  const manifestScoped = await addCounterpartyContextPacks(
    payload.drafts,
    { requireAtLeastOne: false }
  )
  const afterCount = manifestScoped.manifest.counterpartyPacks?.length ?? 0
  const ingestedCount = Math.max(afterCount - beforeCount, 0)

  const summary: CounterpartyPayloadIngestSummary = {
    requestedCount: payload.requestedCount,
    ingestedCount,
    skippedCount: Math.max(payload.requestedCount - ingestedCount, 0),
    errors: payload.errors
  }

  return {
    manifest: manifestScoped.manifest,
    counterpartyPayloadIngestSummary: summary
  }
}

const persistAfterMutation = async (
  manifest: CounterpartyContextPackEventedManifest,
  reason: string
): Promise<ContextSourceManifestResult> => {
  await writeManifestArtifacts(manifest, reason)
  return { manifest }
}

export const getContextSourceManifest = async (): Promise<ContextSourceManifestResult> => ({
  manifest: await readManifest()
})

export const getCounterpartyContextPacks = async (): Promise<ContextSourceManifestResult> => ({
  manifest: await readManifest()
})

export const addContextSource = async (
  draft: ContextSourceDraft
): Promise<ContextSourceManifestResult> => {
  const sanitized = validateDraft(draft)
  const manifest = await readManifest()

  if (
    manifest.sources.some(
      (source) => source.kind === sanitized.kind && source.location === sanitized.location
    )
  ) {
    throw new Error('This source is already recorded.')
  }

  const id = randomUUID()
  const createdAt = new Date().toISOString()

  await appendEvent({
    version: 1,
    type: 'ingress_added',
    source: {
      id,
      ...sanitized,
      selected: true,
      status: 'pending_classification',
      createdAt,
      ownerId: 'owner',
      provenance: {
        sourceId: `coqpi:ingress:${id}`,
        locatorSha256: locatorSha256(sanitized.kind, sanitized.location)
      },
      contentHash: null,
      classification: 'pending',
      retention: retentionFor(createdAt),
      retrievalScopes: ['coqpi_pending_classification'],
      promotion: 'explicit_audit_required'
    }
  })

  const nextManifest = await readManifest()
  return persistAfterMutation(nextManifest, 'add context source')
}

export const addCounterpartyContextPacks = async (
  packs: CounterpartyContextPackDraft[],
  options: { requireAtLeastOne?: boolean } = {}
): Promise<ContextSourceManifestResult> => {
  const { requireAtLeastOne = true } = options
  const list = Array.isArray(packs) ? packs : []
  if (list.length === 0 && requireAtLeastOne) {
    throw new Error('At least one counterparty pack is required.')
  }

  if (list.length === 0) {
    return { manifest: await readManifest() }
  }

  const manifest = await readManifest()
  const nextPacks: CounterpartyContextPack[] = [...
    (manifest.counterpartyPacks || [])
  ]
  const seenKeys = new Set(
    nextPacks.map((pack) => `${pack.sourceId}::${pack.kind}`)
  )

  for (const rawPack of list) {
    const sanitized = validateCounterpartyDraft(rawPack)
    const compositeKey = `${sanitized.sourceId}::${sanitized.kind}`

    if (seenKeys.has(compositeKey)) {
      continue
    }

    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const pack: CounterpartyContextPack = {
      id,
      sourceId: sanitized.sourceId,
      kind: sanitized.kind,
      partnerName: sanitized.partnerName,
      title: sanitized.title,
      summary: sanitized.summary,
      context: sanitized.context ?? '',
      links: sanitized.links,
      selected: sanitized.selected,
      status: 'retrieval_ready',
      createdAt,
      ownerId: 'owner',
      provenance: {
        sourceId: `coqpi:finder:${id}`,
        locatorSha256: locateSourceHash(`finder:${sanitized.sourceId}:${createdAt}`)
      },
      contentHash: createHash('sha256')
        .update(canonicalPackText(sanitized))
        .digest('hex'),
      classification: 'private',
      retention: retentionFor(createdAt),
      retrievalScopes: finderRetrievalScopes,
      promotion: 'explicit_audit_required'
    }

    await appendEvent({
      version: 1,
      type: 'counterparty_pack_imported',
      pack
    })

    nextPacks.push(pack)
    seenKeys.add(compositeKey)
  }

  const nextManifest = await readManifest()
  return persistAfterMutation(
    nextManifest,
    'ingest counterparty context packs'
  )
}

export const ingestCounterpartyFinderPayload = async (
  payloadText: string
): Promise<ContextSourceManifestResult> => {
  const parsed = createContextPackFromFinder(payloadText)
  return ingestCounterpartyFinderDraftsWithSummary(parsed)
}

export const ingestCounterpartyFinderPayloadDrafts = async (
  payloadDrafts: unknown[]
): Promise<ContextSourceManifestResult> => {
  const parsed = parseFinderCounterpartyPayloadDrafts(payloadDrafts)

  return ingestCounterpartyFinderDraftsWithSummary(parsed)
}

export const previewCounterpartyFinderPayload = async (
  payloadText: string
): Promise<CounterpartyFinderPayloadPreviewResult> => {
  const parsed = createContextPackFromFinder(payloadText)

  const manifest = await readManifest()
  const existingKeys = new Set(
    (manifest.counterpartyPacks ?? []).map(
      (pack) => `${pack.sourceId}::${pack.kind}`
    )
  )

  const duplicateCandidates = new Set<string>()

  const candidates: CounterpartyFinderPayloadPreviewCandidate[] = parsed.drafts.map(
    (draft) => {
      const key = `${draft.sourceId}::${draft.kind}`
      const duplicate = existingKeys.has(key) || duplicateCandidates.has(key)
      duplicateCandidates.add(key)

      return {
        draft: {
          sourceId: draft.sourceId,
          kind: draft.kind,
          partnerName: draft.partnerName,
          title: draft.title,
          summary: draft.summary,
          context: draft.context,
          links: draft.links,
          selected: draft.selected !== false
        },
        index: draft.index ?? 0,
        duplicate
      }
    }
  )

  const duplicateCount = candidates.reduce(
    (total, candidate) => total + (candidate.duplicate ? 1 : 0),
    0
  )

  return {
    requestedCount: parsed.requestedCount,
    validCount: candidates.length,
    duplicateCount,
    candidates,
    errors: parsed.errors
  }
}

export const setContextSourceSelected = async (
  id: string,
  selected: boolean
): Promise<ContextSourceManifestResult> => {
  const manifest = await readManifest()
  if (!manifest.sources.some((source) => source.id === id)) {
    throw new Error('The recorded source no longer exists.')
  }

  await appendEvent({ version: 1, type: 'selection_changed', id, selected })
  const nextManifest = await readManifest()
  return persistAfterMutation(
    nextManifest,
    `set context source selected=${selected}`
  )
}

export const removeContextSource = async (
  id: string
): Promise<ContextSourceManifestResult> => {
  const manifest = await readManifest()
  if (!manifest.sources.some((source) => source.id === id)) {
    throw new Error('The recorded source no longer exists.')
  }

  await appendEvent({ version: 1, type: 'source_removed', id })
  const nextManifest = await readManifest()
  return persistAfterMutation(nextManifest, `remove context source`)
}

export const setCounterpartyContextPackSelected = async (
  id: string,
  selected: boolean
): Promise<ContextSourceManifestResult> => {
  const manifest = await readManifest()
  if (!manifest.counterpartyPacks.some((pack) => pack.id === id)) {
    throw new Error('The counterparty pack no longer exists.')
  }

  await appendEvent({
    version: 1,
    type: 'counterparty_pack_selection_changed',
    id,
    selected
  })
  const nextManifest = await readManifest()
  return persistAfterMutation(
    nextManifest,
    `set counterparty pack selected=${selected}`
  )
}

export const removeCounterpartyContextPack = async (
  id: string
): Promise<ContextSourceManifestResult> => {
  const manifest = await readManifest()
  if (!manifest.counterpartyPacks.some((pack) => pack.id === id)) {
    throw new Error('The counterparty pack no longer exists.')
  }

  await appendEvent({
    version: 1,
    type: 'counterparty_pack_removed',
    id
  })

  const nextManifest = await readManifest()
  return persistAfterMutation(nextManifest, 'remove counterparty context pack')
}

const captureReadableText = (source: ContextSource, bytes: Buffer) => {
  if (!readableExtensions.has(path.extname(source.location).toLowerCase())) {
    return null
  }

  const text = bytes.toString('utf8').replace(/\0/g, '').trim()
  return text ? text.slice(0, MAX_CAPTURE_TEXT_CHARS) : null
}

export const captureAndClassifyContextSource = async (
  id: string
): Promise<ContextSourceManifestResult> => {
  const manifest = await readManifest()
  const source = manifest.sources.find((item) => item.id === id)

  if (!source) {
    throw new Error('The recorded source no longer exists.')
  }

  if (source.kind !== 'file') {
    throw new Error('Only an explicitly selected file can be captured in this phase.')
  }

  const stats = await fs.stat(source.location)
  if (!stats.isFile()) {
    throw new Error('The recorded location is no longer a file.')
  }

  if (stats.size > MAX_CAPTURE_BYTES) {
    throw new Error('Files larger than 10 MB require a separate capture adapter.')
  }

  const bytes = await fs.readFile(source.location)
  const capturedText = captureReadableText(source, bytes)
  await appendEvent({
    version: 1,
    type: 'content_captured',
    id,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    capturedText,
    retrievalReady: Boolean(capturedText)
  })

  const nextManifest = await readManifest()
  return persistAfterMutation(nextManifest, 'capture and classify context source')
}

export const getPersonalInterviewRetrieval = async (
  query: string,
  answerLanguage: 'en' | 'fr',
  retrievalKinds?: ContextPackRetrievalKind[],
  selectedPackIds?: string[],
  retrievalProvider: RetrievalProvider = 'legacy'
) => {
  if (retrievalProvider === 'future_vector') {
    // future_vector provider is intentionally not enabled yet.
    // Keep the contract stable by routing to legacy retrieval for now.
  }

  if (!['en', 'fr'].includes(answerLanguage) || !query.trim()) {
    return ''
  }

  await migrateLegacyManifestIfNeeded()
  let events: IngressEvent[] = []
  try {
    events = parseEvents(await fs.readFile(getLedgerPath(), 'utf8'))
  } catch {
    return ''
  }

  const manifest = deriveManifest(events)
  const selectedPackIdSet = new Set(sanitizePackIds(selectedPackIds))
  const normalizedKinds = sanitizeContextPackRetrievalKinds(retrievalKinds)
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
  const capturedTextById = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'content_captured' && event.retrievalReady && event.capturedText) {
      capturedTextById.set(event.id, event.capturedText)
    }
  }

  const counterpartyMatches = manifest.counterpartyPacks
    .filter(
      (pack) =>
        (selectedPackIdSet.size > 0
          ? selectedPackIdSet.has(pack.id)
          : pack.selected) &&
        pack.status === 'retrieval_ready' &&
        pack.retrievalScopes.includes('coqpi_interview_en_fr') &&
        (!Array.isArray(normalizedKinds) || normalizedKinds.length === 0
          ? true
          : normalizedKinds.includes(pack.kind))
    )
    .map((pack) => {
      const packText = `${pack.partnerName}: ${pack.title}. ${pack.summary}. ${pack.context}`
      const score = terms.reduce(
        (total, term) => total + (packText.toLowerCase().includes(term) ? 1 : 0),
        0
      )

      return {
        source: pack,
        text: packText,
        score
      }
    })

  const sourceMatches = manifest.sources
    .filter(
      (source) =>
        source.selected &&
        source.status === 'retrieval_ready' &&
        source.retrievalScopes.includes('coqpi_interview_en_fr') &&
        capturedTextById.has(source.id)
    )
    .map((source) => {
      const text = capturedTextById.get(source.id) ?? ''
      const score = terms.reduce(
        (total, term) => total + (text.toLowerCase().includes(term) ? 1 : 0),
        0
      )

      return { source, text, score }
    })
    .filter((match) => match.score > 0)

  const matches = [...sourceMatches, ...counterpartyMatches]
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)

  if (matches.length === 0) {
    return ''
  }

  return matches
    .map(
      ({ source, text }) =>
        `[${source.provenance.sourceId}] ${text.slice(0, 900)}`
    )
    .join('\n\n')
    .slice(0, 2200)
}

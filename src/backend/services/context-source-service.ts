import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  ContextSource,
  ContextSourceDraft,
  ContextSourceKind,
  ContextSourceManifest,
  ContextSourceManifestResult
} from '../../shared/app-types'
import { getAppInfo } from './app-state'

type IngressEvent =
  | { version: 1; type: 'ingress_added'; source: ContextSource }
  | { version: 1; type: 'selection_changed'; id: string; selected: boolean }
  | { version: 1; type: 'source_removed'; id: string }

const sourceKinds: ContextSourceKind[] = ['link', 'file', 'folder', 'path']
const RETENTION_DAYS = 30

const emptyManifest = (): ContextSourceManifest => ({ version: 1, sources: [] })

const getLedgerPath = () =>
  path.join(
    getAppInfo().personalKnowledgeCoreDirectory,
    'coqpi-ingress.events.jsonl'
  )

const getLegacyManifestPath = () =>
  path.join(process.cwd(), 'data', 'context-sources', 'manifest.json')

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

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

const deriveManifest = (events: IngressEvent[]): ContextSourceManifest => {
  const sources = new Map<string, ContextSource>()

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
    }
  }

  return { version: 1, sources: [...sources.values()] }
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

export const getContextSourceManifest = async (): Promise<ContextSourceManifestResult> => ({
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

  return { manifest: await readManifest() }
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
  return { manifest: await readManifest() }
}

export const removeContextSource = async (
  id: string
): Promise<ContextSourceManifestResult> => {
  const manifest = await readManifest()
  if (!manifest.sources.some((source) => source.id === id)) {
    throw new Error('The recorded source no longer exists.')
  }

  await appendEvent({ version: 1, type: 'source_removed', id })
  return { manifest: await readManifest() }
}

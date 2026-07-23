import type {
  ContextSourceKind,
  ContextSource,
  CounterpartyContextPack
} from './app-types'
import {
  evaluateCounterpartyPackQuality,
  type CounterpartyPackQualityLevel
} from './context-pack-quality'

export type KnowledgeIngestionSourceIssue = {
  id:
    | 'not_selected'
    | 'pending_classification'
    | 'hash_only'
    | 'missing_interview_scope'
    | 'expired_retention'
    | 'unsupported_ingress'
  label: string
  fix: string
}

export type KnowledgeIngestionSourceReadiness = {
  level: 'ready' | 'pending' | 'blocked'
  label: string
  retrievalReady: boolean
  daysUntilExpiry: number | null
  issues: KnowledgeIngestionSourceIssue[]
}

export type KnowledgeIngestionSummary = {
  sourceCount: number
  selectedSourceCount: number
  sourceReadyCount: number
  sourcePendingCount: number
  sourceBlockedCount: number
  packCount: number
  packStrongCount: number
  packUsableCount: number
  packWeakCount: number
  packBlockedCount: number
  retrievalReadyPackCount: number
  soonestExpiryLabel: string
  vectorReady: boolean
  label: string
}

export type KnowledgeExtractionPreview = {
  title: string
  sourceType: ContextSourceKind
  sourceTypeLabel: string
  classificationLabel: string
  retrievalReadinessLabel: string
  retrievalReady: boolean
  extractionMode: 'metadata_only' | 'hash_only' | 'retrieval_context'
  provenanceLabel: string
  missingFields: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const interviewScope = 'coqpi_interview_en_fr'
const readableFileSourceKinds = new Set<ContextSourceKind>([
  'file',
  'owner_profile_file',
  'counterparty_material_file'
])
const pointerOnlySourceKinds = new Set<ContextSourceKind>([
  'link',
  'folder',
  'path',
  'public_profile_link',
  'company_link',
  'local_folder_manifest'
])

const sourceKindLabels: Record<ContextSourceKind, string> = {
  link: 'Legacy link',
  file: 'Legacy file',
  folder: 'Legacy folder',
  path: 'Legacy path',
  owner_profile_file: 'Owner profile/CV file',
  counterparty_material_file: 'Counterparty material file',
  public_profile_link: 'Public profile link',
  company_link: 'Company/respondent link',
  local_folder_manifest: 'Local folder pointer'
}

const daysUntil = (expiresAt: string, nowMs: number) => {
  const expiresMs = Date.parse(expiresAt)

  if (!Number.isFinite(expiresMs)) {
    return null
  }

  return Math.ceil((expiresMs - nowMs) / DAY_MS)
}

export const evaluateContextSourceReadiness = (
  source: ContextSource,
  now = new Date()
): KnowledgeIngestionSourceReadiness => {
  const issues: KnowledgeIngestionSourceIssue[] = []
  const daysUntilExpiry = daysUntil(source.retention.expiresAt, now.getTime())

  if (!source.selected) {
    issues.push({
      id: 'not_selected',
      label: 'not selected',
      fix: 'Select the source before classifying it for interview retrieval.'
    })
  }

  if (source.status === 'pending_classification') {
    issues.push({
      id: 'pending_classification',
      label: 'pending classification',
      fix: readableFileSourceKinds.has(source.kind)
        ? 'Capture and classify this explicitly selected readable file source.'
        : 'This source is pointer-only in this phase; add a readable owner/profile or counterparty file for retrieval.'
    })
  } else if (source.status === 'hash_captured') {
    issues.push({
      id: 'hash_only',
      label: 'hash captured only',
      fix: 'Use a readable .md, .txt, .csv, or .json source for retrieval-ready context.'
    })
  }

  if (
    source.status === 'retrieval_ready' &&
    !source.retrievalScopes.includes(interviewScope)
  ) {
    issues.push({
      id: 'missing_interview_scope',
      label: 'missing EN/FR interview scope',
      fix: 'Keep the source private and scoped to coqpi_interview_en_fr.'
    })
  }

  if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
    issues.push({
      id: 'expired_retention',
      label: 'retention expired',
      fix: 'Review, refresh, or remove this source before relying on it.'
    })
  }

  if (
    !readableFileSourceKinds.has(source.kind) &&
    source.status !== 'pending_classification'
  ) {
    issues.push({
      id: 'unsupported_ingress',
      label: 'unsupported ingress',
      fix: 'Only explicitly selected readable owner/profile or counterparty files can become retrieval-ready in this phase.'
    })
  }

  if (
    pointerOnlySourceKinds.has(source.kind) &&
    source.status === 'pending_classification'
  ) {
    issues.push({
      id: 'unsupported_ingress',
      label: 'pointer-only source',
      fix: 'Keep this as provenance only; do not fetch, scan, or expose raw content from this source.'
    })
  }

  const retrievalReady =
    source.selected &&
    source.status === 'retrieval_ready' &&
    source.classification === 'private' &&
    source.retrievalScopes.includes(interviewScope) &&
    daysUntilExpiry !== null &&
    daysUntilExpiry >= 0

  const level =
    retrievalReady ? 'ready' : source.status === 'pending_classification' ? 'pending' : 'blocked'

  return {
    level,
    label: retrievalReady
      ? `ready · expires in ${daysUntilExpiry}d`
      : `${level} · ${issues.length} fix${issues.length === 1 ? '' : 'es'}`,
    retrievalReady,
    daysUntilExpiry,
    issues
  }
}

const countPacksByLevel = (
  packs: CounterpartyContextPack[],
  level: CounterpartyPackQualityLevel
) =>
  packs.reduce(
    (total, pack) =>
      total + (evaluateCounterpartyPackQuality(pack).level === level ? 1 : 0),
    0
  )

const soonestExpiry = (
  sources: ContextSource[],
  packs: CounterpartyContextPack[],
  now: Date
) => {
  const values = [
    ...sources.map((source) => daysUntil(source.retention.expiresAt, now.getTime())),
    ...packs.map((pack) => daysUntil(pack.retention.expiresAt, now.getTime()))
  ].filter((value): value is number => value !== null)

  if (values.length === 0) {
    return 'no retention dates'
  }

  const min = Math.min(...values)

  return min < 0 ? 'expired item present' : `soonest expiry in ${min}d`
}

export const buildKnowledgeIngestionSummary = (
  sources: ContextSource[],
  packs: CounterpartyContextPack[],
  now = new Date()
): KnowledgeIngestionSummary => {
  const sourceReadiness = sources.map((source) =>
    evaluateContextSourceReadiness(source, now)
  )
  const sourceReadyCount = sourceReadiness.filter((item) => item.level === 'ready')
    .length
  const sourcePendingCount = sourceReadiness.filter(
    (item) => item.level === 'pending'
  ).length
  const sourceBlockedCount = sourceReadiness.filter(
    (item) => item.level === 'blocked'
  ).length
  const packStrongCount = countPacksByLevel(packs, 'strong')
  const packUsableCount = countPacksByLevel(packs, 'usable')
  const packWeakCount = countPacksByLevel(packs, 'weak')
  const packBlockedCount = countPacksByLevel(packs, 'blocked')
  const retrievalReadyPackCount = packStrongCount + packUsableCount
  const vectorReady =
    retrievalReadyPackCount > 0 &&
    sourcePendingCount === 0 &&
    sourceBlockedCount === 0 &&
    packBlockedCount === 0

  return {
    sourceCount: sources.length,
    selectedSourceCount: sources.filter((source) => source.selected).length,
    sourceReadyCount,
    sourcePendingCount,
    sourceBlockedCount,
    packCount: packs.length,
    packStrongCount,
    packUsableCount,
    packWeakCount,
    packBlockedCount,
    retrievalReadyPackCount,
    soonestExpiryLabel: soonestExpiry(sources, packs, now),
    vectorReady,
    label: `${sourceReadyCount}/${sources.length} sources ready · ${retrievalReadyPackCount}/${packs.length} packs usable`
  }
}

export const buildKnowledgeExtractionPreview = (
  source: ContextSource,
  now = new Date()
): KnowledgeExtractionPreview => {
  const readiness = evaluateContextSourceReadiness(source, now)
  const missingFields: string[] = []

  if (!source.selected) {
    missingFields.push('explicit selection')
  }

  if (!source.contentHash) {
    missingFields.push('content hash')
  }

  if (source.classification !== 'private') {
    missingFields.push('private classification')
  }

  if (!source.retrievalScopes.includes(interviewScope)) {
    missingFields.push('EN/FR interview scope')
  }

  if (pointerOnlySourceKinds.has(source.kind)) {
    missingFields.push('readable local file adapter')
  }

  if (readiness.daysUntilExpiry !== null && readiness.daysUntilExpiry < 0) {
    missingFields.push('fresh retention window')
  }

  const extractionMode: KnowledgeExtractionPreview['extractionMode'] =
    readiness.retrievalReady
      ? 'retrieval_context'
      : source.contentHash
        ? 'hash_only'
        : 'metadata_only'

  return {
    title: source.label || source.id,
    sourceType: source.kind,
    sourceTypeLabel: sourceKindLabels[source.kind],
    classificationLabel:
      source.classification === 'private' ? 'private' : 'pending classification',
    retrievalReadinessLabel: readiness.label,
    retrievalReady: readiness.retrievalReady,
    extractionMode,
    provenanceLabel: `${source.provenance.sourceId} · locator ${source.provenance.locatorSha256.slice(0, 12)}`,
    missingFields: Array.from(new Set(missingFields))
  }
}

export const formatContextSourceReadinessFixes = (
  readiness: KnowledgeIngestionSourceReadiness,
  maxIssues = 3
) =>
  readiness.issues.length === 0
    ? 'No obvious fixes.'
    : readiness.issues
        .slice(0, maxIssues)
        .map((issue) => issue.fix)
        .join(' ')

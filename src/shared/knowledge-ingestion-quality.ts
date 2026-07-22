import type {
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

const DAY_MS = 24 * 60 * 60 * 1000
const interviewScope = 'coqpi_interview_en_fr'

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
      fix: 'Capture and classify an explicitly selected supported text file.'
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

  if (source.kind !== 'file' && source.status !== 'pending_classification') {
    issues.push({
      id: 'unsupported_ingress',
      label: 'unsupported ingress',
      fix: 'Only explicitly selected readable files can become retrieval-ready in this phase.'
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

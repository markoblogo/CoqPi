import type {
  ContextPackRetrievalKind,
  ContextSource,
  CounterpartyContextPack,
  RetrievalProvider
} from './app-types'
import { contextPackKindValues } from './app-types'
import { isSessionEligibleCounterpartyPack } from './session-pack-selection'

export type VectorReadyCandidateType = 'counterparty_pack' | 'context_source'

export interface VectorReadyRetrievalCandidate {
  type: VectorReadyCandidateType
  id: string
  sourceId: string
  kind: string
  fingerprint: string
  reason: 'strict_selected_pack' | 'selected_eligible_source'
}

export interface VectorReadyRetrievalDrop {
  id: string
  reason:
    | 'duplicate_selected_pack_id'
    | 'missing_selected_pack'
    | 'ineligible_selected_pack'
    | 'blocked_by_kind_filter'
    | 'blocked_by_strict_selected_pack_set'
}

export interface VectorReadyRetrievalCandidateSet {
  provider: RetrievalProvider
  strictSelectedPackIds: string[]
  candidates: VectorReadyRetrievalCandidate[]
  drops: VectorReadyRetrievalDrop[]
}

const sanitizePackIds = (packIds?: string[]) =>
  (packIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)

const sanitizeKinds = (kinds?: ContextPackRetrievalKind[]) => {
  const allowed = new Set<string>(contextPackKindValues)
  const normalized = (kinds ?? [])
    .map((kind) => String(kind ?? '').trim())
    .filter((kind): kind is ContextPackRetrievalKind => allowed.has(kind))

  return normalized.length > 0 ? new Set(normalized) : undefined
}

const hasInterviewScope = (scopes: string[]) =>
  scopes.includes('coqpi_interview_en_fr')

export const buildVectorReadyRetrievalCandidateSet = ({
  sources,
  counterpartyPacks,
  selectedPackIds,
  retrievalKinds
}: {
  sources: ContextSource[]
  counterpartyPacks: CounterpartyContextPack[]
  selectedPackIds?: string[]
  retrievalKinds?: ContextPackRetrievalKind[]
}): VectorReadyRetrievalCandidateSet => {
  const requestedPackIds = sanitizePackIds(selectedPackIds)
  const strictSelectedPackIds: string[] = []
  const seenRequestedPackIds = new Set<string>()
  const drops: VectorReadyRetrievalDrop[] = []
  const packById = new Map(counterpartyPacks.map((pack) => [pack.id, pack]))
  const allowedKinds = sanitizeKinds(retrievalKinds)

  for (const id of requestedPackIds) {
    if (seenRequestedPackIds.has(id)) {
      drops.push({ id, reason: 'duplicate_selected_pack_id' })
      continue
    }

    seenRequestedPackIds.add(id)
    strictSelectedPackIds.push(id)
  }

  const selectedPacks =
    strictSelectedPackIds.length > 0
      ? strictSelectedPackIds
          .map((id) => {
            const pack = packById.get(id)
            if (!pack) {
              drops.push({ id, reason: 'missing_selected_pack' })
              return null
            }

            return pack
          })
          .filter((pack): pack is CounterpartyContextPack => Boolean(pack))
      : counterpartyPacks.filter((pack) => pack.selected)

  const packCandidates = selectedPacks
    .filter((pack) => {
      if (!isSessionEligibleCounterpartyPack(pack)) {
        drops.push({ id: pack.id, reason: 'ineligible_selected_pack' })
        return false
      }

      if (allowedKinds && !allowedKinds.has(pack.kind)) {
        drops.push({ id: pack.id, reason: 'blocked_by_kind_filter' })
        return false
      }

      return true
    })
    .map(
      (pack): VectorReadyRetrievalCandidate => ({
        type: 'counterparty_pack',
        id: pack.id,
        sourceId: pack.provenance.sourceId,
        kind: pack.kind,
        fingerprint: pack.contentHash,
        reason: 'strict_selected_pack'
      })
    )

  const sourceCandidates =
    strictSelectedPackIds.length > 0
      ? []
      : sources
          .filter(
            (source) =>
              source.selected &&
              source.status === 'retrieval_ready' &&
              source.classification === 'private' &&
              hasInterviewScope(source.retrievalScopes) &&
              Boolean(source.contentHash)
          )
          .map(
            (source): VectorReadyRetrievalCandidate => ({
              type: 'context_source',
              id: source.id,
              sourceId: source.provenance.sourceId,
              kind: source.kind,
              fingerprint: source.contentHash ?? source.provenance.locatorSha256,
              reason: 'selected_eligible_source'
            })
          )

  if (strictSelectedPackIds.length > 0 && sources.some((source) => source.selected)) {
    drops.push({
      id: 'context_sources',
      reason: 'blocked_by_strict_selected_pack_set'
    })
  }

  return {
    provider: 'future_vector',
    strictSelectedPackIds,
    candidates: [...packCandidates, ...sourceCandidates],
    drops
  }
}

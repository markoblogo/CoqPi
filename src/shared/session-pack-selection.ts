import type {
  CounterpartyContextPack,
  CounterpartyContextPackDraft,
  SessionContext
} from './app-types'

const buildCounterpartySourceKey = (
  sourceId: string,
  kind: CounterpartyContextPack['kind']
) => `${sourceId}::${kind}`

const isSessionEligiblePack = (pack: CounterpartyContextPack) =>
  pack.version === 1 &&
  pack.selected === true &&
  pack.status === 'retrieval_ready' &&
  pack.ownerId === 'owner' &&
  pack.classification === 'private' &&
  pack.retrievalScopes.includes('coqpi_interview_en_fr')

export const getSessionSelectedCounterpartyPackIds = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[]
) => {
  const eligibleIds = new Set(
    availablePacks.filter(isSessionEligiblePack).map((pack) => pack.id)
  )
  const unique: string[] = []
  const seen = new Set<string>()

  for (const id of context.selectedCounterpartyPackIds) {
    if (!id || seen.has(id) || !eligibleIds.has(id)) {
      continue
    }

    seen.add(id)
    unique.push(id)
  }

  return unique
}

export const getSessionSelectedCounterpartyPackIdsWithImported = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[],
  importedCandidates: CounterpartyContextPackDraft[] = []
) => {
  const selectedSet = new Set(
    getSessionSelectedCounterpartyPackIds(context, availablePacks)
  )

  if (importedCandidates.length === 0) {
    return [...selectedSet]
  }

  const importKeys = new Set(
    importedCandidates.map((candidate) =>
      buildCounterpartySourceKey(candidate.sourceId, candidate.kind)
    )
  )
  const packIdBySourceKey = new Map(
    availablePacks.filter(isSessionEligiblePack).map((pack) => [
      buildCounterpartySourceKey(pack.sourceId, pack.kind),
      pack.id
    ])
  )

  for (const key of importKeys) {
    const packId = packIdBySourceKey.get(key)
    if (packId) {
      selectedSet.add(packId)
    }
  }

  return [...selectedSet]
}

export const getSessionContextWithCounterpartyPacks = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[],
  importedCandidates: CounterpartyContextPackDraft[] = []
): SessionContext => ({
  ...context,
  selectedCounterpartyPackIds: getSessionSelectedCounterpartyPackIdsWithImported(
    context,
    availablePacks,
    importedCandidates
  )
})

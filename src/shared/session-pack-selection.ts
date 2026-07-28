import type {
  FinderCandidateDecisionState,
  FinderCandidateResult,
  FinderOutreachDraft,
  CounterpartyContextPack,
  CounterpartyContextPackDraft,
  SessionContext
} from './app-types'

export type CounterpartyPackSessionIneligibilityReason =
  | 'wrong_version'
  | 'not_selected'
  | 'not_retrieval_ready'
  | 'wrong_owner'
  | 'not_private'
  | 'missing_interview_scope'

export type CounterpartyPackSessionEligibility = {
  eligible: boolean
  reasons: CounterpartyPackSessionIneligibilityReason[]
}

export const sessionCounterpartyPackRetrievalScope = 'coqpi_interview_en_fr'

export const counterpartyPackSessionIneligibilityReasonLabels: Record<
  CounterpartyPackSessionIneligibilityReason,
  string
> = {
  wrong_version: 'wrong version',
  not_selected: 'not selected',
  not_retrieval_ready: 'not retrieval-ready',
  wrong_owner: 'wrong owner',
  not_private: 'not private',
  missing_interview_scope: 'missing EN/FR interview scope'
}

export const buildCounterpartySourceKey = (
  sourceId: string,
  kind: CounterpartyContextPack['kind']
) => `${sourceId}::${kind}`

export const getCounterpartyPackSessionEligibility = (
  pack: CounterpartyContextPack
): CounterpartyPackSessionEligibility => {
  const reasons: CounterpartyPackSessionIneligibilityReason[] = []
  const runtimePack = pack as CounterpartyContextPack & {
    version?: unknown
  }

  if (runtimePack.version !== 1) {
    reasons.push('wrong_version')
  }

  if (pack.selected !== true) {
    reasons.push('not_selected')
  }

  if (pack.status !== 'retrieval_ready') {
    reasons.push('not_retrieval_ready')
  }

  if (pack.ownerId !== 'owner') {
    reasons.push('wrong_owner')
  }

  if (pack.classification !== 'private') {
    reasons.push('not_private')
  }

  if (!pack.retrievalScopes.includes(sessionCounterpartyPackRetrievalScope)) {
    reasons.push('missing_interview_scope')
  }

  return {
    eligible: reasons.length === 0,
    reasons
  }
}

export const isSessionEligibleCounterpartyPack = (
  pack: CounterpartyContextPack
) => getCounterpartyPackSessionEligibility(pack).eligible

export const formatCounterpartyPackSessionEligibility = (
  eligibility: CounterpartyPackSessionEligibility
) =>
  eligibility.eligible
    ? 'ready for session'
    : `blocked: ${eligibility.reasons
        .map((reason) => counterpartyPackSessionIneligibilityReasonLabels[reason])
        .join(', ')}`

export const getSessionSelectedCounterpartyPackIds = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[]
) => {
  const eligibleIds = new Set(
    availablePacks.filter(isSessionEligibleCounterpartyPack).map((pack) => pack.id)
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
    availablePacks.filter(isSessionEligibleCounterpartyPack).map((pack) => [
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

export const getSessionContextWithImportedCounterpartyPacks = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[],
  importedCandidates: CounterpartyContextPackDraft[] = []
) =>
  getSessionContextWithCounterpartyPacks(
    context,
    availablePacks,
    importedCandidates
  )

export type FinderQueueSessionEffect = {
  selectedPackIdsAdded: string[]
  selectedPackIdsRemoved: string[]
  clearedSelectedDraftId: string | null
  changed: boolean
}

export const reconcileSessionContextWithFinderQueueDecision = ({
  context,
  availablePacks,
  availableOutreachDrafts = [],
  affectedResults,
  nextDecisionState
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
  availableOutreachDrafts?: FinderOutreachDraft[]
  affectedResults: readonly FinderCandidateResult[]
  nextDecisionState: FinderCandidateDecisionState
}): {
  context: SessionContext
  effect: FinderQueueSessionEffect
} => {
  const selectedPackIds = new Set(
    getSessionSelectedCounterpartyPackIds(context, availablePacks)
  )
  const selectedPackIdsBefore = new Set(selectedPackIds)
  const selectedDraftId = context.selectedFinderOutreachDraftId.trim()
  const affectedCandidateIds = new Set(affectedResults.map((result) => result.id))
  const affectedSourceKeys = new Set(
    affectedResults.map((result) =>
      buildCounterpartySourceKey(result.sourceId, result.kind)
    )
  )
  const eligiblePackBySourceKey = new Map(
    availablePacks.filter(isSessionEligibleCounterpartyPack).map((pack) => [
      buildCounterpartySourceKey(pack.sourceId, pack.kind),
      pack.id
    ])
  )
  const selectedDraft = selectedDraftId
    ? availableOutreachDrafts.find((draft) => draft.id === selectedDraftId) ?? null
    : null

  if (nextDecisionState === 'import_now') {
    for (const key of affectedSourceKeys) {
      const packId = eligiblePackBySourceKey.get(key)
      if (packId) {
        selectedPackIds.add(packId)
      }
    }
  }

  if (nextDecisionState === 'rejected') {
    for (const key of affectedSourceKeys) {
      const packId = eligiblePackBySourceKey.get(key)
      if (packId) {
        selectedPackIds.delete(packId)
      }
    }
  }

  const nextSelectedDraftId =
    nextDecisionState === 'rejected' &&
    selectedDraft &&
    affectedCandidateIds.has(selectedDraft.candidateResultId)
      ? ''
      : selectedDraftId

  const selectedPackIdsAdded = [...selectedPackIds].filter(
    (id) => !selectedPackIdsBefore.has(id)
  )
  const selectedPackIdsRemoved = [...selectedPackIdsBefore].filter(
    (id) => !selectedPackIds.has(id)
  )
  const clearedSelectedDraftId =
    selectedDraftId && nextSelectedDraftId !== selectedDraftId
      ? selectedDraftId
      : null

  return {
    context: {
      ...context,
      selectedCounterpartyPackIds: [...selectedPackIds],
      selectedFinderOutreachDraftId: nextSelectedDraftId
    },
    effect: {
      selectedPackIdsAdded,
      selectedPackIdsRemoved,
      clearedSelectedDraftId,
      changed:
        selectedPackIdsAdded.length > 0 ||
        selectedPackIdsRemoved.length > 0 ||
        clearedSelectedDraftId !== null
    }
  }
}

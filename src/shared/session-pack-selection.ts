import type {
  FinderCandidateDecisionState,
  FinderCandidateResult,
  FinderOutreachDraft,
  FinderOutreachDraftStatus,
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
  selectedPackIdsPreserved: string[]
  clearedSelectedDraftId: string | null
  selectedDraftIdChanged: boolean
  changed: boolean
}

export const describeFinderQueueSessionEffect = ({
  effect,
  includedDraftLabel,
  droppedDraftLabel
}: {
  effect: FinderQueueSessionEffect
  includedDraftLabel?: string | null
  droppedDraftLabel?: string | null
}) => {
  const parts: string[] = []

  if (effect.selectedPackIdsAdded.length > 0) {
    parts.push(
      `${effect.selectedPackIdsAdded.length} pack${
        effect.selectedPackIdsAdded.length === 1 ? '' : 's'
      } attached`
    )
  }

  if (effect.selectedPackIdsRemoved.length > 0) {
    parts.push(
      `${effect.selectedPackIdsRemoved.length} pack${
        effect.selectedPackIdsRemoved.length === 1 ? '' : 's'
      } removed`
    )
  }

  if (effect.selectedPackIdsPreserved.length > 0) {
    parts.push(
      `${effect.selectedPackIdsPreserved.length} pack${
        effect.selectedPackIdsPreserved.length === 1 ? '' : 's'
      } kept for active follow-up`
    )
  }

  if (effect.clearedSelectedDraftId) {
    parts.push('selected draft cleared')
  } else if (includedDraftLabel) {
    parts.push(`draft ${includedDraftLabel}`)
  } else if (droppedDraftLabel) {
    parts.push(`draft dropped: ${droppedDraftLabel}`)
  }

  return parts.length > 0 ? parts.join(' · ') : 'no session handoff change'
}

const getEligiblePackIdBySourceKey = (
  availablePacks: CounterpartyContextPack[]
) =>
  new Map(
    availablePacks.filter(isSessionEligibleCounterpartyPack).map((pack) => [
      buildCounterpartySourceKey(pack.sourceId, pack.kind),
      pack.id
    ])
  )

const getSessionSelectedPackIdSet = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[]
) => new Set(getSessionSelectedCounterpartyPackIds(context, availablePacks))

const buildFinderQueueSessionEffect = ({
  selectedPackIds,
  selectedPackIdsBefore,
  selectedPackIdsPreserved = new Set<string>(),
  selectedDraftId,
  nextSelectedDraftId
}: {
  selectedPackIds: Set<string>
  selectedPackIdsBefore: Set<string>
  selectedPackIdsPreserved?: Set<string>
  selectedDraftId: string
  nextSelectedDraftId: string
}): FinderQueueSessionEffect => {
  const selectedPackIdsAdded = [...selectedPackIds].filter(
    (id) => !selectedPackIdsBefore.has(id)
  )
  const selectedPackIdsRemoved = [...selectedPackIdsBefore].filter(
    (id) => !selectedPackIds.has(id)
  )
  const selectedPackIdsPreservedList = [...selectedPackIdsPreserved].filter(
    (id) => selectedPackIds.has(id) && selectedPackIdsBefore.has(id)
  )
  const clearedSelectedDraftId =
    selectedDraftId && nextSelectedDraftId !== selectedDraftId
      ? selectedDraftId
      : null
  const selectedDraftIdChanged = nextSelectedDraftId !== selectedDraftId

  return {
    selectedPackIdsAdded,
    selectedPackIdsRemoved,
    selectedPackIdsPreserved: selectedPackIdsPreservedList,
    clearedSelectedDraftId,
    selectedDraftIdChanged,
    changed:
      selectedPackIdsAdded.length > 0 ||
      selectedPackIdsRemoved.length > 0 ||
      selectedDraftIdChanged
  }
}

const draftStatusAttachesPack = (status: FinderOutreachDraftStatus) =>
  status === 'ready_for_contact' ||
  status === 'contacted' ||
  status === 'waiting' ||
  status === 'follow_up'

const draftStatusKeepsPackDuringHold = (status: FinderOutreachDraftStatus) =>
  status === 'contacted' || status === 'waiting' || status === 'follow_up'

export const reconcileSessionContextWithFinderOutreachDraftSelection = ({
  context,
  availablePacks,
  draft
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
  draft: FinderOutreachDraft
}): {
  context: SessionContext
  effect: FinderQueueSessionEffect
} => {
  const selectedPackIds = getSessionSelectedPackIdSet(context, availablePacks)
  const selectedPackIdsBefore = new Set(selectedPackIds)
  const selectedDraftId = context.selectedFinderOutreachDraftId.trim()
  const nextSelectedDraftId = draft.status === 'closed' ? '' : draft.id
  const eligiblePackBySourceKey = getEligiblePackIdBySourceKey(availablePacks)

  if (draftStatusAttachesPack(draft.status) || draft.status === 'draft') {
    const packId = eligiblePackBySourceKey.get(
      buildCounterpartySourceKey(draft.sourceId, draft.kind)
    )
    if (packId) {
      selectedPackIds.add(packId)
    }
  }

  const effect = buildFinderQueueSessionEffect({
    selectedPackIds,
    selectedPackIdsBefore,
    selectedDraftId,
    nextSelectedDraftId
  })

  return {
    context: {
      ...context,
      selectedCounterpartyPackIds: [...selectedPackIds],
      selectedFinderOutreachDraftId: nextSelectedDraftId
    },
    effect
  }
}

export const reconcileSessionContextWithFinderOutreachDraftStatus = ({
  context,
  availablePacks,
  affectedDrafts,
  nextStatus
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
  affectedDrafts: readonly FinderOutreachDraft[]
  nextStatus: FinderOutreachDraftStatus
}): {
  context: SessionContext
  effect: FinderQueueSessionEffect
} => {
  const selectedPackIds = getSessionSelectedPackIdSet(context, availablePacks)
  const selectedPackIdsBefore = new Set(selectedPackIds)
  const selectedDraftId = context.selectedFinderOutreachDraftId.trim()
  const eligiblePackBySourceKey = getEligiblePackIdBySourceKey(availablePacks)
  const selectedDraft = selectedDraftId
    ? affectedDrafts.find((draft) => draft.id === selectedDraftId) ?? null
    : null
  const nextSelectedDraftId =
    nextStatus === 'closed' && selectedDraft ? '' : selectedDraftId

  if (selectedDraft && draftStatusAttachesPack(nextStatus)) {
    const packId = eligiblePackBySourceKey.get(
      buildCounterpartySourceKey(selectedDraft.sourceId, selectedDraft.kind)
    )
    if (packId) {
      selectedPackIds.add(packId)
    }
  }

  const effect = buildFinderQueueSessionEffect({
    selectedPackIds,
    selectedPackIdsBefore,
    selectedDraftId,
    nextSelectedDraftId
  })

  return {
    context: {
      ...context,
      selectedCounterpartyPackIds: [...selectedPackIds],
      selectedFinderOutreachDraftId: nextSelectedDraftId
    },
    effect
  }
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
  const selectedPackIds = getSessionSelectedPackIdSet(context, availablePacks)
  const selectedPackIdsBefore = new Set(selectedPackIds)
  const selectedDraftId = context.selectedFinderOutreachDraftId.trim()
  const affectedCandidateIds = new Set(affectedResults.map((result) => result.id))
  const affectedSourceKeys = new Set(
    affectedResults.map((result) =>
      buildCounterpartySourceKey(result.sourceId, result.kind)
    )
  )
  const eligiblePackBySourceKey = getEligiblePackIdBySourceKey(availablePacks)
  const selectedPackIdsPreserved = new Set<string>()
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

  if (nextDecisionState === 'hold_later' || nextDecisionState === 'rejected') {
    for (const key of affectedSourceKeys) {
      const packId = eligiblePackBySourceKey.get(key)
      if (packId) {
        if (
          nextDecisionState === 'hold_later' &&
          selectedDraft &&
          draftStatusKeepsPackDuringHold(selectedDraft.status) &&
          affectedCandidateIds.has(selectedDraft.candidateResultId) &&
          buildCounterpartySourceKey(selectedDraft.sourceId, selectedDraft.kind) === key
        ) {
          selectedPackIds.add(packId)
          selectedPackIdsPreserved.add(packId)
          continue
        }

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

  const effect = buildFinderQueueSessionEffect({
    selectedPackIds,
    selectedPackIdsBefore,
    selectedPackIdsPreserved,
    selectedDraftId,
    nextSelectedDraftId
  })

  return {
    context: {
      ...context,
      selectedCounterpartyPackIds: [...selectedPackIds],
      selectedFinderOutreachDraftId: nextSelectedDraftId
    },
    effect
  }
}

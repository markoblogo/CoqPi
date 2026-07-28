import type {
  CounterpartyContextPack,
  FinderCandidateResult,
  FinderOutreachDraft,
  SessionContext
} from './app-types'
import {
  buildFinderRelationshipMemory,
  finderOutreachDraftSessionIneligibilityReasonLabels,
  finderOutreachDraftSessionDecisionKindLabels,
  finderOutreachDraftSessionDecisionReasonLabels,
  getFinderOutreachDraftSessionDecision,
  resolveFinderSessionOutreachDraft,
} from './finder-relationship-memory'
import {
  counterpartyPackSessionIneligibilityReasonLabels,
  getCounterpartyPackSessionEligibility
} from './session-pack-selection'

export type SessionPayloadPackItem = {
  id: string
  label: string
  sourceId: string
  status: 'included' | 'dropped'
  reason: string
}

export type SessionPayloadDraftItem = {
  id: string
  label: string
  status: 'included' | 'dropped'
  reason: string
  relationshipStatusLabel?: string
  lastContactLabel?: string
  followUpContextLabel?: string
  decisionKind?: 'ready' | 'usable' | 'weak' | 'ineligible'
  decisionReason?: string
  handoffState?: 'ready' | 'follow_up' | 'review' | 'blocked'
  handoffLabel?: string
  handoffHint?: string
}

export type SessionPayloadInspector = {
  summaryLabel: string
  includedPacks: SessionPayloadPackItem[]
  droppedPacks: SessionPayloadPackItem[]
  includedOutreachDraft: SessionPayloadDraftItem | null
  droppedOutreachDraft: SessionPayloadDraftItem | null
  profileLabel: string
  warningCount: number
}

export type SessionPayloadPackSummary = {
  state: 'included' | 'dropped' | 'none'
  includedCount: number
  droppedCount: number
  label: string
  detailLabel: string
}

const mergeDroppedPacks = (
  droppedPacks: SessionPayloadPackItem[],
  auditedDroppedPacks: SessionPayloadPackItem[] = [],
  includedPacks: SessionPayloadPackItem[] = []
) => {
  const includedIds = new Set(includedPacks.map((pack) => pack.id))
  const merged = new Map<string, SessionPayloadPackItem>()

  for (const pack of droppedPacks) {
    merged.set(pack.id, pack)
  }

  for (const pack of auditedDroppedPacks) {
    if (!pack.id || includedIds.has(pack.id) || merged.has(pack.id)) {
      continue
    }

    merged.set(pack.id, pack)
  }

  return [...merged.values()]
}

export const buildSessionPayloadPackSummary = (
  inspector: SessionPayloadInspector
): SessionPayloadPackSummary => {
  if (inspector.includedPacks.length > 0) {
    const detailLabel = inspector.includedPacks
      .slice(0, 3)
      .map((pack) => pack.label)
      .join(', ')

    return {
      state: 'included',
      includedCount: inspector.includedPacks.length,
      droppedCount: inspector.droppedPacks.length,
      label: `Packs: ${detailLabel}`,
      detailLabel
    }
  }

  if (inspector.droppedPacks.length > 0) {
    const detailLabel = inspector.droppedPacks
      .slice(0, 3)
      .map((pack) => pack.label)
      .join(', ')

    return {
      state: 'dropped',
      includedCount: 0,
      droppedCount: inspector.droppedPacks.length,
      label: `Dropped: ${detailLabel}`,
      detailLabel
    }
  }

  return {
    state: 'none',
    includedCount: 0,
    droppedCount: 0,
    label: 'No packs selected',
    detailLabel: 'No pack selected'
  }
}

const formatPackLabel = (pack: CounterpartyContextPack) =>
  `${pack.partnerName} · ${pack.title}`

const formatDraftLabel = (draft: FinderOutreachDraft) =>
  `${draft.targetName} · ${draft.opportunity}`

const formatDraftDecisionReason = (
  decision: ReturnType<typeof getFinderOutreachDraftSessionDecision> | null
) => {
  if (!decision) {
    return 'stale selection'
  }

  return decision.kind === 'ineligible'
    ? `ineligible: ${
        finderOutreachDraftSessionIneligibilityReasonLabels[
          decision.ineligibilityReason ?? 'closed'
        ]
      }`
    : decision.reason
      ? finderOutreachDraftSessionDecisionReasonLabels[decision.reason]
      : finderOutreachDraftSessionDecisionKindLabels[decision.kind]
}

const formatDropReason = (
  reasons: ReturnType<typeof getCounterpartyPackSessionEligibility>['reasons']
) =>
  reasons.length === 0
    ? 'eligible'
    : reasons
        .map((reason) => counterpartyPackSessionIneligibilityReasonLabels[reason])
        .join(', ')

export const buildSessionPayloadInspector = ({
  context,
  availablePacks,
  availableFinderResults = [],
  availableOutreachDrafts = [],
  auditedDroppedPacks = [],
  includeProfileContext,
  profileChars
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
  availableFinderResults?: FinderCandidateResult[]
  availableOutreachDrafts?: FinderOutreachDraft[]
  auditedDroppedPacks?: SessionPayloadPackItem[]
  includeProfileContext: boolean
  profileChars: number
}): SessionPayloadInspector => {
  const packById = new Map(availablePacks.map((pack) => [pack.id, pack]))
  const includedPacks: SessionPayloadPackItem[] = []
  const droppedPacks: SessionPayloadPackItem[] = []
  const seenPackIds = new Set<string>()

  for (const id of context.selectedCounterpartyPackIds) {
    const normalizedId = String(id ?? '').trim()

    if (!normalizedId || seenPackIds.has(normalizedId)) {
      continue
    }

    seenPackIds.add(normalizedId)
    const pack = packById.get(normalizedId)

    if (!pack) {
      droppedPacks.push({
        id: normalizedId,
        label: normalizedId,
        sourceId: 'missing',
        status: 'dropped',
        reason: 'pack missing from local manifest'
      })
      continue
    }

    const eligibility = getCounterpartyPackSessionEligibility(pack)
    const item = {
      id: pack.id,
      label: formatPackLabel(pack),
      sourceId: pack.sourceId,
      status: eligibility.eligible ? 'included' : 'dropped',
      reason: eligibility.eligible
        ? 'eligible selected pack'
        : formatDropReason(eligibility.reasons)
    } satisfies SessionPayloadPackItem

    if (eligibility.eligible) {
      includedPacks.push(item)
    } else {
      droppedPacks.push(item)
    }
  }

  const selectedDraftId = context.selectedFinderOutreachDraftId.trim()
  const resolvedDraft = resolveFinderSessionOutreachDraft({
    selectedDraftId,
    selectedPackIds: includedPacks.map((pack) => pack.id),
    availablePacks,
    availableFinderResults,
    availableOutreachDrafts
  })
  const selectedDraft = resolvedDraft.draft
  const selectedDraftDecision = resolvedDraft.decision
  const selectedDraftHandoff = resolvedDraft.handoff
  const includedOutreachDraft: SessionPayloadDraftItem | null = selectedDraft
    ? selectedDraftDecision?.kind !== 'ineligible' &&
      selectedDraftHandoff?.included !== false
      ? (() => {
        const relationshipMemory =
          resolvedDraft.relationshipMemory ??
          buildFinderRelationshipMemory(selectedDraft)

        return {
          id: selectedDraft.id,
          label: formatDraftLabel(selectedDraft),
          status: 'included',
          reason:
            resolvedDraft.selectionMode === 'linked_selected_pack'
              ? 'linked local outreach draft from selected pack'
              : 'selected local outreach draft',
          relationshipStatusLabel: relationshipMemory.statusLabel,
          lastContactLabel: relationshipMemory.lastContactLabel,
          followUpContextLabel: relationshipMemory.followUpContextLabel,
          decisionKind: selectedDraftDecision?.kind ?? 'weak',
          decisionReason: formatDraftDecisionReason(selectedDraftDecision),
          handoffState: selectedDraftHandoff?.state,
          handoffLabel: selectedDraftHandoff?.label,
          handoffHint: selectedDraftHandoff?.hint
        }
      })()
      : null
    : null
  const droppedOutreachDraft: SessionPayloadDraftItem | null =
    selectedDraftId &&
    (!selectedDraft ||
      selectedDraftDecision?.kind === 'ineligible' ||
      selectedDraftHandoff?.included === false)
      ? {
          id: selectedDraftId,
          label: selectedDraft ? formatDraftLabel(selectedDraft) : selectedDraftId,
          status: 'dropped',
          reason: selectedDraft
            ? selectedDraftHandoff?.included === false
              ? selectedDraftHandoff.label
              : formatDraftDecisionReason(selectedDraftDecision)
            : 'draft missing from local Finder source truth',
          relationshipStatusLabel: selectedDraft
            ? buildFinderRelationshipMemory(selectedDraft).statusLabel
            : undefined,
          lastContactLabel: selectedDraft
            ? buildFinderRelationshipMemory(selectedDraft).lastContactLabel
            : 'Draft missing from local Finder source truth.',
          followUpContextLabel: selectedDraft
            ? buildFinderRelationshipMemory(selectedDraft).followUpContextLabel
            : 'No follow-up context available.',
          decisionKind: selectedDraftDecision?.kind ?? 'ineligible',
          decisionReason: selectedDraft
            ? formatDraftDecisionReason(selectedDraftDecision)
            : undefined,
          handoffState: selectedDraftHandoff?.state ?? 'blocked',
          handoffLabel: selectedDraftHandoff?.label,
          handoffHint: selectedDraftHandoff?.hint
        }
      : null
  const mergedDroppedPacks = mergeDroppedPacks(
    droppedPacks,
    auditedDroppedPacks,
    includedPacks
  )
  const warningCount =
    mergedDroppedPacks.length + (droppedOutreachDraft ? 1 : 0)
  const profileLabel = includeProfileContext
    ? profileChars > 0
      ? `profile ${profileChars} chars`
      : 'profile enabled but empty'
    : 'profile off'

  return {
    summaryLabel: `included packs ${includedPacks.length} · dropped ${mergedDroppedPacks.length} · draft ${
      includedOutreachDraft ? 'included' : droppedOutreachDraft ? 'dropped' : 'none'
    } · ${profileLabel}`,
    includedPacks,
    droppedPacks: mergedDroppedPacks,
    includedOutreachDraft,
    droppedOutreachDraft,
    profileLabel,
    warningCount
  }
}

import type {
  CounterpartyContextPack,
  FinderOutreachDraft,
  SessionContext
} from './app-types'
import {
  buildFinderRelationshipMemory,
  finderOutreachDraftSessionIneligibilityReasonLabels,
  finderOutreachDraftSessionDecisionKindLabels,
  finderOutreachDraftSessionDecisionReasonLabels,
  getFinderOutreachDraftSessionDecision,
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
  availableOutreachDrafts = [],
  auditedDroppedPacks = [],
  includeProfileContext,
  profileChars
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
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
  const selectedDraft = selectedDraftId
    ? availableOutreachDrafts.find((draft) => draft.id === selectedDraftId)
    : null
  const selectedDraftDecision = selectedDraft
    ? getFinderOutreachDraftSessionDecision(selectedDraft)
    : null
  const includedOutreachDraft: SessionPayloadDraftItem | null = selectedDraft
    ? selectedDraftDecision?.kind !== 'ineligible'
      ? (() => {
        const relationshipMemory = buildFinderRelationshipMemory(selectedDraft)

        return {
          id: selectedDraft.id,
          label: formatDraftLabel(selectedDraft),
          status: 'included',
          reason: 'selected local outreach draft',
          relationshipStatusLabel: relationshipMemory.statusLabel,
          lastContactLabel: relationshipMemory.lastContactLabel,
          followUpContextLabel: relationshipMemory.followUpContextLabel,
          decisionKind: selectedDraftDecision?.kind ?? 'weak',
          decisionReason: formatDraftDecisionReason(selectedDraftDecision)
        }
      })()
      : null
    : null
  const droppedOutreachDraft: SessionPayloadDraftItem | null =
    selectedDraftId &&
    (!selectedDraft || selectedDraftDecision?.kind === 'ineligible')
      ? {
          id: selectedDraftId,
          label: selectedDraft ? formatDraftLabel(selectedDraft) : selectedDraftId,
          status: 'dropped',
          reason: selectedDraft
            ? formatDraftDecisionReason(selectedDraftDecision)
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
            : undefined
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

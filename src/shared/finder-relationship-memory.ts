import type {
  FinderOutreachDraft,
  FinderOutreachDraftStatus,
  FinderOutreachStatusHistoryEntry
} from './app-types'

export const finderOutreachDraftStatusLabels: Record<
  FinderOutreachDraftStatus,
  string
> = {
  draft: 'working draft',
  ready_for_contact: 'ready for contact',
  contacted: 'contacted',
  waiting: 'waiting',
  follow_up: 'follow-up',
  closed: 'closed'
}

export const finderOutreachDraftSessionIneligibilityReasonLabels: Record<
  'closed',
  string
> = {
  closed: 'draft status is closed'
}

export const finderOutreachDraftSessionDecisionKindLabels: Record<
  'ready' | 'usable' | 'weak',
  string
> = {
  ready: 'ready for live call',
  usable: 'usable for follow-up flow',
  weak: 'weak / confirm before call'
}

export const finderOutreachDraftSessionDecisionReasonLabels: Record<
  'draft' | 'contacted' | 'waiting' | 'follow_up' | 'closed',
  string
> = {
  draft: 'draft needs explicit readiness confirmation',
  contacted: 'active contact already started',
  waiting: 'active contact thread is waiting',
  follow_up: 'active follow-up state',
  closed: 'draft is marked closed'
}

export type FinderOutreachDraftSessionDecisionKind =
  'ready' | 'usable' | 'weak' | 'ineligible'

export type FinderOutreachDraftSessionDecisionReason =
  keyof typeof finderOutreachDraftSessionDecisionReasonLabels

export type FinderOutreachDraftSessionIneligibilityReason =
  keyof typeof finderOutreachDraftSessionIneligibilityReasonLabels

export type FinderOutreachDraftSessionDecision = {
  kind: FinderOutreachDraftSessionDecisionKind
  reason: FinderOutreachDraftSessionDecisionReason | null
  ineligibilityReason: FinderOutreachDraftSessionIneligibilityReason | null
}

export const getFinderOutreachDraftSessionEligibility = (
  draft: PickerOutreachDraftLike
): { eligible: boolean; reasons: FinderOutreachDraftSessionIneligibilityReason[] } => {
  const reasons: FinderOutreachDraftSessionIneligibilityReason[] = []

  if (draft.status === 'closed') {
    reasons.push('closed')
  }

  return {
    eligible: reasons.length === 0,
    reasons
  }
}

export const getFinderOutreachDraftSessionDecision = (
  draft: PickerOutreachDraftLike
): FinderOutreachDraftSessionDecision => {
  const ineligibility = getFinderOutreachDraftSessionEligibility(draft)

  if (!ineligibility.eligible) {
    return {
      kind: 'ineligible',
      reason: 'closed',
      ineligibilityReason: 'closed'
    }
  }

  if (draft.status === 'ready_for_contact') {
    return {
      kind: 'ready',
      reason: null,
      ineligibilityReason: null
    }
  }

  if (
    draft.status === 'contacted' ||
    draft.status === 'waiting' ||
    draft.status === 'follow_up'
  ) {
    return {
      kind: 'usable',
      reason: draft.status,
      ineligibilityReason: null
    }
  }

  return {
    kind: 'weak',
    reason: 'draft',
    ineligibilityReason: null
  }
}

type PickerOutreachDraftLike = Pick<FinderOutreachDraft, 'status'>

const contactLikeStatuses = new Set<FinderOutreachDraftStatus>([
  'contacted',
  'waiting',
  'follow_up',
  'closed'
])

const formatTimestamp = (value: string) =>
  value.replace('T', ' ').replace('.000Z', 'Z')

const getLatestHistoryEntry = (
  draft: FinderOutreachDraft,
  statuses?: Set<FinderOutreachDraftStatus>
): FinderOutreachStatusHistoryEntry | null => {
  const history = Array.isArray(draft.statusHistory) ? draft.statusHistory : []

  for (const entry of history) {
    if (!statuses || statuses.has(entry.status)) {
      return entry
    }
  }

  return null
}

export type FinderRelationshipMemory = {
  statusLabel: string
  lastContactAt: string
  lastContactLabel: string
  followUpContextLabel: string
  assistantContextLines: string[]
}

export const buildFinderRelationshipMemory = (
  draft: FinderOutreachDraft
): FinderRelationshipMemory => {
  const latestContactEntry = getLatestHistoryEntry(draft, contactLikeStatuses)
  const latestStatusEntry = getLatestHistoryEntry(draft)
  const followUpContextCandidates = [
    draft.nextAction.trim(),
    draft.questionsToAsk[0]?.trim() ?? '',
    draft.whyRelevant.trim()
  ].filter(Boolean)
  const followUpContextLabel =
    followUpContextCandidates.length > 0
      ? followUpContextCandidates.slice(0, 2).join(' | ')
      : 'No follow-up context yet.'

  return {
    statusLabel: finderOutreachDraftStatusLabels[draft.status],
    lastContactAt: latestContactEntry?.at ?? '',
    lastContactLabel: latestContactEntry
      ? `${finderOutreachDraftStatusLabels[latestContactEntry.status]} · ${formatTimestamp(
          latestContactEntry.at
        )}`
      : latestStatusEntry && latestStatusEntry.status !== 'draft'
        ? `${finderOutreachDraftStatusLabels[latestStatusEntry.status]} · ${formatTimestamp(
            latestStatusEntry.at
          )}`
        : 'No contact recorded yet.',
    followUpContextLabel,
    assistantContextLines: [
      `Relationship status: ${finderOutreachDraftStatusLabels[draft.status]}`,
      latestContactEntry
        ? `Last contact state: ${finderOutreachDraftStatusLabels[latestContactEntry.status]} at ${formatTimestamp(
            latestContactEntry.at
          )}`
        : '',
      `Follow-up context: ${followUpContextLabel}`
    ].filter(Boolean)
  }
}

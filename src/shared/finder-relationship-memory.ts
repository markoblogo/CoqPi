import type {
  FinderCandidateDecisionState,
  FinderCandidateResult,
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

export const finderCandidateDecisionStateLabels: Record<
  FinderCandidateDecisionState | 'rejected_status',
  string
> = {
  auto: 'auto review',
  import_now: 'import now',
  hold_later: 'hold for later',
  rejected: 'rejected',
  rejected_status: 'rejected status'
}

export type FinderOutreachDraftSessionHandoffState =
  | 'ready'
  | 'follow_up'
  | 'review'
  | 'blocked'

export type FinderOutreachDraftSessionHandoff = {
  state: FinderOutreachDraftSessionHandoffState
  included: boolean
  label: string
  hint: string
  queueState: FinderCandidateDecisionState | 'rejected_status' | 'missing_candidate'
  draftStatus: FinderOutreachDraftStatus
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

type FinderOutreachCandidateLike = Pick<
  FinderCandidateResult,
  'status' | 'decision'
>

export const buildFinderOutreachDraftSessionHandoff = (
  draft: FinderOutreachDraft,
  candidateResult?: FinderOutreachCandidateLike | null
): FinderOutreachDraftSessionHandoff => {
  const queueState =
    candidateResult?.status === 'rejected'
      ? 'rejected_status'
      : candidateResult?.decision?.state ?? 'missing_candidate'

  if (queueState === 'rejected' || queueState === 'rejected_status') {
    return {
      state: 'blocked',
      included: false,
      label: 'rejected target',
      hint:
        'Finder queue rejected this target. Draft stays in local history but is dropped from assistant payload.',
      queueState,
      draftStatus: draft.status
    }
  }

  if (draft.status === 'closed') {
    return {
      state: 'blocked',
      included: false,
      label: 'closed draft',
      hint:
        'Closed outreach drafts are not included in the next live session payload.',
      queueState,
      draftStatus: draft.status
    }
  }

  if (draft.status === 'ready_for_contact') {
    return {
      state: 'ready',
      included: true,
      label:
        queueState === 'import_now'
          ? 'import now · ready for contact'
          : 'ready for contact',
      hint:
        'This draft is ready to be used as the active opening context for the next call.',
      queueState,
      draftStatus: draft.status
    }
  }

  if (
    draft.status === 'contacted' ||
    draft.status === 'waiting' ||
    draft.status === 'follow_up'
  ) {
    return {
      state: 'follow_up',
      included: true,
      label:
        draft.status === 'contacted'
          ? 'contact started'
          : draft.status === 'waiting'
            ? 'waiting for reply'
            : 'follow-up due',
      hint:
        'This draft is used as follow-up context for the same target in the next call.',
      queueState,
      draftStatus: draft.status
    }
  }

  if (queueState === 'hold_later') {
    return {
      state: 'review',
      included: true,
      label: 'hold for later · review before call',
      hint:
        'The candidate is held in Finder and the draft is still early. Confirm intent before using it in a live call.',
      queueState,
      draftStatus: draft.status
    }
  }

  if (queueState === 'import_now') {
    return {
      state: 'review',
      included: true,
      label: 'import now · draft still needs confirmation',
      hint:
        'Finder marked the candidate for import, but the outreach draft is not yet contact-ready.',
      queueState,
      draftStatus: draft.status
    }
  }

  return {
    state: 'review',
    included: true,
    label: 'draft only · review before call',
    hint:
      'This draft can stay in context, but it should be confirmed before relying on it in a live session.',
    queueState,
    draftStatus: draft.status
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

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

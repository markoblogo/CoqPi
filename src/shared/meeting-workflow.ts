import type {
  CounterpartyContextPack,
  FinderOutreachDraft,
  SessionContext,
  SessionSummaryDraft
} from './app-types'

export interface PreCallPreparationPacket {
  version: 1
  sessionLabel: string
  agenda: string[]
  participantContext: string[]
  selectedPackIds: string[]
  selectedDraftId: string
  ownerFocus: string[]
  missingContext: string[]
}

export const buildPreCallPreparationPacket = ({
  sessionContext,
  packs,
  draft
}: {
  sessionContext: SessionContext
  packs: CounterpartyContextPack[]
  draft?: FinderOutreachDraft | null
}): PreCallPreparationPacket => {
  const selectedPacks = packs.filter((pack) =>
    sessionContext.selectedCounterpartyPackIds.includes(pack.id)
  )
  const agenda = [sessionContext.goal, ...selectedPacks.map((pack) => pack.title)]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
  const participantContext = selectedPacks
    .flatMap((pack) => [pack.partnerName, pack.summary])
    .concat(draft ? [draft.targetName, draft.whyRelevant] : [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
  const ownerFocus = [sessionContext.role, sessionContext.notes]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
  const missingContext = [
    selectedPacks.length === 0 ? 'No selected counterparty pack' : '',
    sessionContext.goal.trim() ? '' : 'Call goal is empty',
    draft ? '' : 'No outreach draft selected'
  ].filter(Boolean)

  return {
    version: 1,
    sessionLabel: [sessionContext.company, sessionContext.role]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' · '),
    agenda,
    participantContext,
    selectedPackIds: selectedPacks.map((pack) => pack.id),
    selectedDraftId: draft?.id ?? '',
    ownerFocus,
    missingContext
  }
}

export const buildPostCallRecapDraft = ({
  sessionContext,
  summary,
  confirmedOutcomes = [],
  followUps = [],
  risks = []
}: {
  sessionContext: SessionContext
  summary: string
  confirmedOutcomes?: string[]
  followUps?: string[]
  risks?: string[]
}): SessionSummaryDraft => ({
  sourceId: `session:${sessionContext.company || 'unlabeled'}`,
  partnerName: sessionContext.company || 'Unlabeled counterpart',
  title: sessionContext.role || 'Professional call',
  summary: summary.trim(),
  agenda: [sessionContext.goal].filter(Boolean),
  confirmedOutcomes,
  followUps,
  risks,
  sessionLabel: [sessionContext.company, sessionContext.role]
    .filter(Boolean)
    .join(' · '),
  selectedCounterpartyPackIds: sessionContext.selectedCounterpartyPackIds,
  selectedFinderOutreachDraftId: sessionContext.selectedFinderOutreachDraftId
})

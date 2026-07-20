import type { CounterpartyContextPackDraft } from './app-types'
import {
  parseFinderCounterpartyPayloadText,
  normalizeFinderLinksText,
  type FinderCounterpartyDraftSource
} from './finder-ingest-contract'

const mapDraft = (draft: FinderCounterpartyDraftSource): CounterpartyContextPackDraft => ({
  sourceId: draft.sourceId,
  kind: draft.kind,
  partnerName: draft.partnerName,
  title: draft.title,
  summary: draft.summary,
  context: draft.context,
  links: draft.links,
  selected: draft.selected
})

export const parseCounterpartyPackJsonPayload = (
  text: string
): CounterpartyContextPackDraft[] => parseFinderCounterpartyPayloadText(text).map(mapDraft)

export const normalizeLinksText = normalizeFinderLinksText

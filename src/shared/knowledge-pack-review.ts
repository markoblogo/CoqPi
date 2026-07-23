import type { CounterpartyContextPackDraft } from './app-types'

export type KnowledgePackReviewWeakFieldId =
  | 'missing_source_id'
  | 'missing_partner'
  | 'missing_title'
  | 'missing_summary'
  | 'missing_context'
  | 'missing_links'
  | 'selected_on_save'

export type KnowledgePackReviewWeakField = {
  id: KnowledgePackReviewWeakFieldId
  label: string
  fix: string
}

export type KnowledgePackReviewSurface = {
  canSave: boolean
  sourceId: string
  kind: CounterpartyContextPackDraft['kind']
  partnerName: string
  title: string
  summary: string
  context: string
  links: string[]
  selectedOnSave: boolean
  weakFields: KnowledgePackReviewWeakField[]
  confirmationLabel: string
}

const trimText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeLinks = (links?: string[]) =>
  Array.from(new Set((links ?? []).map(trimText).filter(Boolean)))

export const buildKnowledgePackReviewSurface = (
  draft: CounterpartyContextPackDraft
): KnowledgePackReviewSurface => {
  const sourceId = trimText(draft.sourceId)
  const partnerName = trimText(draft.partnerName)
  const title = trimText(draft.title)
  const summary = trimText(draft.summary)
  const context = trimText(draft.context)
  const links = normalizeLinks(draft.links)
  const selectedOnSave = draft.selected === true
  const weakFields: KnowledgePackReviewWeakField[] = []

  if (!sourceId) {
    weakFields.push({
      id: 'missing_source_id',
      label: 'source missing',
      fix: 'Keep a stable knowledge:* or finder:* source ID before saving.'
    })
  }

  if (!partnerName) {
    weakFields.push({
      id: 'missing_partner',
      label: 'partner missing',
      fix: 'Name the owner profile, company, respondent, fund, or role target.'
    })
  }

  if (!title) {
    weakFields.push({
      id: 'missing_title',
      label: 'title missing',
      fix: 'Add the role, opportunity, or context title.'
    })
  }

  if (!summary) {
    weakFields.push({
      id: 'missing_summary',
      label: 'summary missing',
      fix: 'Add a compact summary of what should enter assistant context.'
    })
  }

  if (!context) {
    weakFields.push({
      id: 'missing_context',
      label: 'context weak',
      fix: 'Add constraints, status, missing fields, or how this source should be used.'
    })
  }

  if (links.length === 0) {
    weakFields.push({
      id: 'missing_links',
      label: 'links missing',
      fix: 'Add reviewed provenance links when available.'
    })
  }

  if (selectedOnSave && sourceId.startsWith('knowledge:')) {
    weakFields.push({
      id: 'selected_on_save',
      label: 'will be selected',
      fix: 'For knowledge-assembled drafts, save unselected first unless you are ready to use it in assistant retrieval.'
    })
  }

  const blockingIds = new Set<KnowledgePackReviewWeakFieldId>([
    'missing_source_id',
    'missing_partner',
    'missing_title',
    'missing_summary'
  ])

  return {
    canSave: !weakFields.some((field) => blockingIds.has(field.id)),
    sourceId,
    kind: draft.kind,
    partnerName,
    title,
    summary,
    context,
    links,
    selectedOnSave,
    weakFields,
    confirmationLabel: selectedOnSave
      ? 'Save pack selected for retrieval'
      : 'Save reviewed pack'
  }
}

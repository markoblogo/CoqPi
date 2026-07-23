import type {
  CounterpartyContextPackDraft,
  KnowledgePackLifecycleEntry,
  KnowledgePackLifecycleStatus
} from './app-types'

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

export type KnowledgePackLifecycleStatusFilter =
  | 'all'
  | KnowledgePackLifecycleStatus

export type KnowledgePackLifecycleVisibilityFilter =
  | 'all'
  | 'selected'
  | 'unselected'

export type KnowledgePackLifecycleQualityFilter =
  | 'all'
  | 'assistant_ready'
  | 'weak'
  | 'stale'

export type KnowledgePackLifecycleReviewFilters = {
  status: KnowledgePackLifecycleStatusFilter
  visibility: KnowledgePackLifecycleVisibilityFilter
  quality: KnowledgePackLifecycleQualityFilter
}

export type KnowledgePackLifecycleReviewItem = KnowledgePackLifecycleEntry & {
  latestForSource: boolean
  assistantReady: boolean
  needsReview: boolean
}

export type KnowledgePackLifecycleReview = {
  totalCount: number
  sourceCount: number
  assistantReadyCount: number
  weakCount: number
  staleCount: number
  filteredItems: KnowledgePackLifecycleReviewItem[]
  emptyLabel: string
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

export const defaultKnowledgePackLifecycleReviewFilters: KnowledgePackLifecycleReviewFilters =
  {
    status: 'all',
    visibility: 'all',
    quality: 'all'
  }

export const buildKnowledgePackLifecycleReview = (
  entries: KnowledgePackLifecycleEntry[],
  filters: KnowledgePackLifecycleReviewFilters =
    defaultKnowledgePackLifecycleReviewFilters
): KnowledgePackLifecycleReview => {
  const latestEntryIdBySource = new Map<string, string>()

  for (const entry of entries) {
    latestEntryIdBySource.set(entry.sourceId, entry.id)
  }

  const items = entries
    .slice()
    .reverse()
    .map((entry): KnowledgePackLifecycleReviewItem => {
      const latestForSource = latestEntryIdBySource.get(entry.sourceId) === entry.id
      const assistantReady =
        latestForSource &&
        entry.status === 'saved' &&
        entry.selected &&
        entry.weakFields.length === 0

      return {
        ...entry,
        latestForSource,
        assistantReady,
        needsReview: !assistantReady
      }
    })

  const filteredItems = items.filter((entry) => {
    const statusOk =
      filters.status === 'all' ? true : entry.status === filters.status
    const visibilityOk =
      filters.visibility === 'all'
        ? true
        : filters.visibility === 'selected'
          ? entry.selected
          : !entry.selected
    const qualityOk =
      filters.quality === 'all'
        ? true
        : filters.quality === 'assistant_ready'
          ? entry.assistantReady
          : filters.quality === 'weak'
            ? entry.weakFields.length > 0
            : !entry.latestForSource

    return statusOk && visibilityOk && qualityOk
  })

  return {
    totalCount: entries.length,
    sourceCount: latestEntryIdBySource.size,
    assistantReadyCount: items.filter((entry) => entry.assistantReady).length,
    weakCount: items.filter((entry) => entry.weakFields.length > 0).length,
    staleCount: items.filter((entry) => !entry.latestForSource).length,
    filteredItems,
    emptyLabel:
      entries.length === 0
        ? 'No lifecycle entries yet.'
        : 'No lifecycle entries match the current filters.'
  }
}

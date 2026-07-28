import type {
  ContextSource,
  ContextSourceManifest,
  CounterpartyContextPack,
  FinderSearchStore,
  KnowledgePackLifecycleEntry,
  LocalMemoryAssistantDropReason,
  LocalMemoryAssistantRecord,
  LocalMemoryRecord,
  LocalMemoryState,
  SessionSummary
} from './app-types'
import { isSessionEligibleCounterpartyPack } from './session-pack-selection'
import {
  buildFinderOutreachDraftSessionHandoff,
  getFinderOutreachDraftSessionEligibility
} from './finder-relationship-memory'
import {
  formatRetrievalQualityMatches,
  rankRetrievalCandidates,
  type RetrievalQualityCandidate
} from './retrieval-quality'

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const sanitizePackIds = (ids?: string[]) =>
  [...new Set((ids ?? []).map((id) => sanitizeText(id)).filter(Boolean))]

const hasExpiredRetention = (expiresAt: string) => {
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) ? expiresAtMs <= Date.now() : false
}

const formatDropReason = (reason: LocalMemoryAssistantDropReason) => {
  switch (reason) {
    case 'not_selected':
      return 'not selected for the current session'
    case 'stale':
      return 'stale selection or missing local record'
    case 'disabled':
      return 'disabled or not assistant-eligible'
    case 'classification_blocked':
      return 'classification or scope blocks assistant use'
    case 'retention_expired':
      return 'retention expired'
    case 'no_evidence':
      return 'no evidence-backed content'
    default:
      return reason
  }
}

const createRecord = (
  record: Omit<LocalMemoryRecord, 'version'>
): LocalMemoryRecord => ({
  version: 1,
  ...record
})

const buildContextSourceRecords = (source: ContextSource): LocalMemoryRecord[] => {
  if (!source.extraction) {
    return []
  }

  const base = {
    entityId: `source:${source.id}`,
    entityLabel: source.label,
    sourceType: 'context_source' as const,
    sourceId: source.provenance.sourceId,
    createdAt: source.createdAt,
    updatedAt: source.extraction.extractedAt,
    classification: source.classification,
    retention: source.retention,
    scopes: source.retrievalScopes,
    confidence:
      source.status === 'retrieval_ready' && source.classification === 'private' ? 0.82 : 0.45,
    assistantEligible:
      source.selected &&
      source.status === 'retrieval_ready' &&
      source.classification === 'private' &&
      source.retrievalScopes.includes('coqpi_interview_en_fr'),
    evidenceRefs: [source.id, source.provenance.locatorSha256]
  }

  const records: LocalMemoryRecord[] = []

  if (source.extraction.ownerFacts.length > 0) {
    records.push(
      createRecord({
        ...base,
        id: `memory:source:${source.id}:owner-facts`,
        kind: 'fact',
        title: `${source.label} owner facts`,
        content: source.extraction.ownerFacts.join(' | ')
      })
    )
  }

  if (source.extraction.roleFacts.length > 0) {
    records.push(
      createRecord({
        ...base,
        id: `memory:source:${source.id}:role-facts`,
        kind: 'fact',
        title: `${source.label} role facts`,
        content: source.extraction.roleFacts.join(' | ')
      })
    )
  }

  return records
}

const buildPackSummaryRecord = (
  pack: CounterpartyContextPack,
  lifecycleEntries: KnowledgePackLifecycleEntry[]
): LocalMemoryRecord => {
  const latestLifecycle = lifecycleEntries
    .filter((entry) => entry.sourceId === pack.sourceId)
    .sort((left, right) => right.at.localeCompare(left.at))[0]

  return createRecord({
    id: `memory:pack:${pack.id}:summary`,
    entityId: `target:${pack.sourceId}`,
    entityLabel: `${pack.partnerName} · ${pack.title}`,
    kind: 'summary',
    sourceType: 'counterparty_pack',
    sourceId: pack.provenance.sourceId,
    title: `${pack.partnerName} session pack`,
    content: [
      pack.summary,
      pack.context,
      latestLifecycle
        ? `Lifecycle: ${latestLifecycle.status} (${latestLifecycle.reason})`
        : ''
    ]
      .filter(Boolean)
      .join(' | '),
    createdAt: pack.createdAt,
    updatedAt: latestLifecycle?.at ?? pack.createdAt,
    classification: pack.classification,
    retention: pack.retention,
    scopes: pack.retrievalScopes,
    confidence: 0.88,
    assistantEligible: isSessionEligibleCounterpartyPack(pack),
    evidenceRefs: [pack.id, pack.contentHash, pack.provenance.locatorSha256]
  })
}

const buildLifecycleRecords = (
  pack: CounterpartyContextPack,
  lifecycleEntries: KnowledgePackLifecycleEntry[]
): LocalMemoryRecord[] =>
  lifecycleEntries
    .filter((entry) => entry.sourceId === pack.sourceId)
    .map((entry) =>
      createRecord({
        id: `memory:lifecycle:${entry.id}`,
        entityId: `target:${pack.sourceId}`,
        entityLabel: `${pack.partnerName} · ${pack.title}`,
        kind: 'interaction',
        sourceType: 'knowledge_pack_lifecycle',
        sourceId: pack.provenance.sourceId,
        title: `Pack ${entry.status}`,
        content: [entry.reason, entry.weakFields.join(', ')].filter(Boolean).join(' | '),
        createdAt: entry.at,
        updatedAt: entry.at,
        classification: pack.classification,
        retention: pack.retention,
        scopes: pack.retrievalScopes,
        confidence: 0.74,
        assistantEligible: isSessionEligibleCounterpartyPack(pack),
        evidenceRefs: [entry.id, entry.draftHash, pack.contentHash]
      })
    )

const buildFinderRecords = ({
  store,
  sessionSummariesBySourceId
}: {
  store: FinderSearchStore
  sessionSummariesBySourceId: Map<string, SessionSummary[]>
}): LocalMemoryRecord[] => {
  const resultById = new Map(store.results.map((result) => [result.id, result]))

  return store.outreachDrafts.flatMap((draft) => {
    const candidate = resultById.get(draft.candidateResultId)
    const handoff = buildFinderOutreachDraftSessionHandoff(draft, candidate)
    const eligibility = getFinderOutreachDraftSessionEligibility(draft)
    const lastStatus = draft.statusHistory[0]
    const entityId = `target:${draft.sourceId}`
    const entityLabel = `${draft.targetName} · ${draft.opportunity}`
    const latestSessionSummary =
      sessionSummariesBySourceId.get(draft.sourceId)?.[0] ?? null
    const base = {
      entityId,
      entityLabel,
      sourceId: draft.provenance.sourceId,
      classification: 'private' as const,
      retention: {
        mode: 'manual_deletion_required' as const,
        maxAgeDays: 30,
        expiresAt: new Date(
          Date.parse(draft.createdAt) + 30 * 24 * 60 * 60 * 1000
        ).toISOString()
      },
      scopes: ['coqpi_interview_en_fr'],
      evidenceRefs: [draft.id, draft.contentHash, draft.candidateResultId],
      createdAt: draft.createdAt,
      updatedAt: lastStatus?.at ?? draft.createdAt
    }

    const records: LocalMemoryRecord[] = [
      createRecord({
        ...base,
        id: `memory:draft:${draft.id}:relationship`,
        kind: 'relationship_state',
        sourceType: 'finder_outreach_draft',
        title: `${draft.targetName} relationship state`,
        content: [
          `status ${draft.status}`,
          `handoff ${handoff.state}`,
          draft.nextAction,
          draft.whyRelevant,
          latestSessionSummary
            ? `last confirmed summary ${latestSessionSummary.summary}`
            : ''
        ]
          .filter(Boolean)
          .join(' | '),
        confidence: 0.9,
        assistantEligible: eligibility.eligible && handoff.included
      })
    ]

    if (lastStatus) {
      records.push(
        createRecord({
          ...base,
          id: `memory:draft:${draft.id}:last-interaction`,
          kind: 'interaction',
          sourceType: 'finder_outreach_draft',
          title: `${draft.targetName} latest interaction`,
          content: `${lastStatus.status} | ${lastStatus.reason}`,
          confidence: 0.78,
          assistantEligible: eligibility.eligible && handoff.included
        })
      )
    }

    return records
  })
}

const buildSessionSummaryRecords = (
  summaries: SessionSummary[],
  packBySourceId: Map<string, CounterpartyContextPack>
): LocalMemoryRecord[] =>
  summaries.map((summary) => {
    const relatedPack = packBySourceId.get(summary.sourceId)
    const retention =
      relatedPack?.retention ?? {
        mode: 'manual_deletion_required' as const,
        maxAgeDays: 30,
        expiresAt: new Date(
          Date.parse(summary.confirmedAt) + 30 * 24 * 60 * 60 * 1000
        ).toISOString()
      }
    const scopes = relatedPack?.retrievalScopes ?? ['coqpi_interview_en_fr']
    const assistantEligible = Boolean(
      relatedPack ? isSessionEligibleCounterpartyPack(relatedPack) : scopes.includes('coqpi_interview_en_fr')
    )

    return createRecord({
      id: `memory:session-summary:${summary.id}`,
      entityId: `target:${summary.sourceId}`,
      entityLabel: `${summary.partnerName} · ${summary.title}`,
      kind: 'summary',
      sourceType: 'session_summary',
      sourceId: `coqpi:session-summary:${summary.sourceId}`,
      title: `${summary.partnerName} owner-confirmed session summary`,
      content: [
        summary.summary,
        summary.confirmedOutcomes.length
          ? `Outcomes: ${summary.confirmedOutcomes.join('; ')}`
          : '',
        summary.followUps.length
          ? `Follow-up: ${summary.followUps.join('; ')}`
          : '',
        summary.risks.length ? `Risks: ${summary.risks.join('; ')}` : ''
      ]
        .filter(Boolean)
        .join(' | '),
      createdAt: summary.createdAt,
      updatedAt: summary.confirmedAt,
      classification: 'private',
      retention,
      scopes,
      confidence: 0.93,
      assistantEligible,
      evidenceRefs: [summary.id, summary.sourceId, ...summary.selectedCounterpartyPackIds]
    })
  })

export const buildLocalMemoryRecords = ({
  manifest,
  finderStore,
  sessionSummaries = []
}: {
  manifest: ContextSourceManifest
  finderStore: FinderSearchStore
  sessionSummaries?: SessionSummary[]
}): LocalMemoryRecord[] => {
  const lifecycleEntries = manifest.knowledgePackLifecycle ?? []
  const packBySourceId = new Map(
    (manifest.counterpartyPacks ?? []).map((pack) => [pack.sourceId, pack])
  )
  const sessionSummariesBySourceId = new Map<string, SessionSummary[]>()
  for (const summary of sessionSummaries) {
    const current = sessionSummariesBySourceId.get(summary.sourceId) ?? []
    current.push(summary)
    current.sort((left, right) => right.confirmedAt.localeCompare(left.confirmedAt))
    sessionSummariesBySourceId.set(summary.sourceId, current)
  }
  const packRecords = (manifest.counterpartyPacks ?? []).flatMap((pack) => [
    buildPackSummaryRecord(pack, lifecycleEntries),
    ...buildLifecycleRecords(pack, lifecycleEntries)
  ])
  const sourceRecords = manifest.sources.flatMap((source) =>
    buildContextSourceRecords(source)
  )
  const finderRecords = buildFinderRecords({
    store: finderStore,
    sessionSummariesBySourceId
  })
  const sessionSummaryRecords = buildSessionSummaryRecords(
    sessionSummaries,
    packBySourceId
  )

  return [...sourceRecords, ...packRecords, ...finderRecords, ...sessionSummaryRecords].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  )
}

const resolveRecordDropReason = ({
  record,
  selectedPackIds,
  selectedDraftId,
  packBySourceId,
  draftSourceIds
}: {
  record: LocalMemoryRecord
  selectedPackIds: Set<string>
  selectedDraftId: string
  packBySourceId: Map<string, CounterpartyContextPack>
  draftSourceIds: Set<string>
}): LocalMemoryAssistantDropReason | null => {
  if (!record.content.trim()) {
    return 'no_evidence'
  }

  if (record.classification !== 'private') {
    return 'classification_blocked'
  }

  if (!record.scopes.includes('coqpi_interview_en_fr')) {
    return 'classification_blocked'
  }

  if (hasExpiredRetention(record.retention.expiresAt)) {
    return 'retention_expired'
  }

  if (!record.assistantEligible) {
    return 'disabled'
  }

  if (record.sourceType === 'finder_outreach_draft') {
    return selectedDraftId && record.id.includes(`memory:draft:${selectedDraftId}:`)
      ? null
      : selectedDraftId
        ? 'stale'
        : 'not_selected'
  }

  const relatedPack = packBySourceId.get(record.entityId.replace(/^target:/u, ''))

  if (selectedPackIds.size > 0) {
    if (!relatedPack) {
      return 'stale'
    }

    return selectedPackIds.has(relatedPack.id) ? null : 'not_selected'
  }

  if (relatedPack) {
    return relatedPack.selected ? null : 'not_selected'
  }

  if (draftSourceIds.has(record.entityId.replace(/^target:/u, ''))) {
    return selectedDraftId ? null : 'not_selected'
  }

  return record.sourceType === 'context_source' ? null : 'not_selected'
}

export const buildLocalMemoryState = ({
  manifest,
  finderStore,
  sessionSummaries = [],
  selectedPackIds = [],
  selectedDraftId = ''
}: {
  manifest: ContextSourceManifest
  finderStore: FinderSearchStore
  sessionSummaries?: SessionSummary[]
  selectedPackIds?: string[]
  selectedDraftId?: string
}): LocalMemoryState => {
  const records = buildLocalMemoryRecords({ manifest, finderStore, sessionSummaries })
  const normalizedSelectedPackIds = new Set(sanitizePackIds(selectedPackIds))
  const normalizedSelectedDraftId = sanitizeText(selectedDraftId)
  const packBySourceId = new Map(
    (manifest.counterpartyPacks ?? []).map((pack) => [pack.sourceId, pack])
  )
  const draftSourceIds = new Set(
    finderStore.outreachDrafts.map((draft) => draft.sourceId)
  )
  const assistantRecords = records.map((record): LocalMemoryAssistantRecord => {
    const dropReason = resolveRecordDropReason({
      record,
      selectedPackIds: normalizedSelectedPackIds,
      selectedDraftId: normalizedSelectedDraftId,
      packBySourceId,
      draftSourceIds
    })

    return {
      record,
      status: dropReason ? 'dropped' : 'included',
      reason: dropReason ? formatDropReason(dropReason) : 'eligible selected local memory'
    }
  })

  return {
    version: 1,
    records,
    assistantView: {
      included: assistantRecords.filter((record) => record.status === 'included'),
      dropped: assistantRecords.filter((record) => record.status === 'dropped')
    }
  }
}

export const formatLocalMemoryAssistantContext = (
  state: LocalMemoryState,
  maxChars = 1400
) =>
  state.assistantView.included
    .slice(0, 6)
    .map(
      ({ record }) =>
        `[${record.sourceId}] ${record.title}: ${record.content}`
    )
    .join('\n')
    .slice(0, maxChars)

const localMemoryWeightByKind: Record<LocalMemoryRecord['kind'], number> = {
  summary: 9,
  relationship_state: 8,
  fact: 7,
  interaction: 5,
  preference: 6
}

const buildLocalMemoryRetrievalCandidates = (
  state: LocalMemoryState
): RetrievalQualityCandidate[] =>
  state.assistantView.included.map(({ record }) => ({
    id: record.id,
    sourceId: record.sourceId,
    label: record.entityLabel,
    kind: `${record.sourceType}:${record.kind}`,
    fallbackPriority: Math.round(
      (localMemoryWeightByKind[record.kind] ?? 4) * record.confidence
    ),
    sections: [
      {
        label: 'title',
        text: record.title,
        weight: localMemoryWeightByKind[record.kind] ?? 4
      },
      {
        label: 'content',
        text: record.content,
        weight: (localMemoryWeightByKind[record.kind] ?? 4) + 1
      },
      {
        label: 'entity',
        text: record.entityLabel,
        weight: 4
      }
    ]
  }))

export const buildLocalMemoryRetrievalContext = ({
  state,
  query,
  limit = 4,
  maxChars = 1200
}: {
  state: LocalMemoryState
  query: string
  limit?: number
  maxChars?: number
}): {
  context: string
  shouldAbstain: boolean
  reason: 'no_included_records' | 'no_strong_match' | 'matched'
} => {
  const candidates = buildLocalMemoryRetrievalCandidates(state)

  if (candidates.length === 0) {
    return {
      context: '',
      shouldAbstain: true,
      reason: 'no_included_records'
    }
  }

  const retrieval = rankRetrievalCandidates({
    query,
    candidates,
    limit
  })

  const hasStrongMatch = retrieval.matches.some(
    (match) => !match.fallbackUsed && match.score >= 8 && match.matchedTerms.length > 0
  )

  if (!hasStrongMatch) {
    return {
      context: '',
      shouldAbstain: true,
      reason: 'no_strong_match'
    }
  }

  return {
    context: formatRetrievalQualityMatches(retrieval, maxChars),
    shouldAbstain: false,
    reason: 'matched'
  }
}

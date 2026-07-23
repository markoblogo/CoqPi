const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildKnowledgePackLifecycleReview,
  buildKnowledgePackReviewSurface,
  buildKnowledgePackSessionHandoffCandidates
} = require('../dist-electron/shared/knowledge-pack-review.js')

const makeDraft = (overrides = {}) => ({
  sourceId: 'knowledge:source-1',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Senior Product Manager',
  summary: 'Owner has relevant AI product strategy experience.',
  context: 'Missing fields to review: salary range.',
  links: ['https://example.com/job'],
  selected: false,
  ...overrides
})

test('knowledge pack review shows what will be saved and allows complete drafts', () => {
  const review = buildKnowledgePackReviewSurface(makeDraft())

  assert.equal(review.canSave, true)
  assert.equal(review.sourceId, 'knowledge:source-1')
  assert.equal(review.title, 'Senior Product Manager')
  assert.deepEqual(review.links, ['https://example.com/job'])
  assert.equal(review.selectedOnSave, false)
  assert.equal(review.confirmationLabel, 'Save reviewed pack')
  assert.equal(review.weakFields.length, 0)
})

test('knowledge pack review blocks missing required save fields', () => {
  const review = buildKnowledgePackReviewSurface(
    makeDraft({ sourceId: '', partnerName: '', title: '', summary: '' })
  )

  assert.equal(review.canSave, false)
  assert.deepEqual(
    review.weakFields.map((field) => field.id),
    [
      'missing_source_id',
      'missing_partner',
      'missing_title',
      'missing_summary'
    ]
  )
})

test('knowledge pack review warns before saving knowledge draft selected', () => {
  const review = buildKnowledgePackReviewSurface(
    makeDraft({ context: '', links: [], selected: true })
  )

  assert.equal(review.canSave, true)
  assert.equal(review.confirmationLabel, 'Save pack selected for retrieval')
  assert.deepEqual(
    review.weakFields.map((field) => field.id),
    ['missing_context', 'missing_links', 'selected_on_save']
  )
})

const makeLifecycleEntry = (overrides = {}) => ({
  version: 1,
  id: 'life-1',
  status: 'assembled',
  at: '2026-07-23T10:00:00.000Z',
  sourceId: 'knowledge:source-1',
  draftHash: 'a'.repeat(64),
  reason: 'compact lifecycle event',
  selected: false,
  weakFields: [],
  ...overrides
})

const makePack = (overrides = {}) => ({
  version: 1,
  id: 'pack-1',
  sourceId: 'knowledge:source-1',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Senior Product Manager',
  summary: 'Owner has relevant AI product strategy experience.',
  context: '',
  links: [],
  selected: false,
  status: 'retrieval_ready',
  createdAt: '2026-07-23T10:00:00.000Z',
  ownerId: 'owner',
  provenance: {
    sourceId: 'knowledge:source-1',
    locatorSha256: 'b'.repeat(64)
  },
  contentHash: 'c'.repeat(64),
  classification: 'private',
  retention: {
    mode: 'manual_deletion_required',
    maxAgeDays: 30,
    expiresAt: '2026-08-22T10:00:00.000Z'
  },
  retrievalScopes: ['coqpi_interview_en_fr'],
  promotion: 'explicit_audit_required',
  ...overrides
})

const makeSession = (selectedCounterpartyPackIds = []) => ({
  company: 'Acme',
  role: 'Interview',
  context: '',
  goal: '',
  notes: '',
  selectedCounterpartyPackIds,
  selectedFinderOutreachDraftId: ''
})

test('knowledge pack lifecycle review filters stale weak and assistant-ready entries', () => {
  const entries = [
    makeLifecycleEntry({
      id: 'assembled-old',
      status: 'assembled',
      sourceId: 'knowledge:source-1',
      selected: false,
      weakFields: ['missing_links']
    }),
    makeLifecycleEntry({
      id: 'saved-current',
      status: 'saved',
      sourceId: 'knowledge:source-1',
      selected: true,
      weakFields: []
    }),
    makeLifecycleEntry({
      id: 'reviewed-weak',
      status: 'reviewed',
      sourceId: 'knowledge:source-2',
      selected: false,
      weakFields: ['missing_context']
    })
  ]
  const review = buildKnowledgePackLifecycleReview(entries, {
    status: 'all',
    visibility: 'all',
    quality: 'all'
  })

  assert.equal(review.totalCount, 3)
  assert.equal(review.sourceCount, 2)
  assert.equal(review.assistantReadyCount, 1)
  assert.equal(review.weakCount, 2)
  assert.equal(review.staleCount, 1)
  assert.equal(review.filteredItems[0].id, 'reviewed-weak')
  assert.equal(review.filteredItems[1].id, 'saved-current')
  assert.equal(review.filteredItems[2].latestForSource, false)

  const assistantReady = buildKnowledgePackLifecycleReview(entries, {
    status: 'all',
    visibility: 'selected',
    quality: 'assistant_ready'
  })

  assert.deepEqual(
    assistantReady.filteredItems.map((entry) => entry.id),
    ['saved-current']
  )

  const staleOnly = buildKnowledgePackLifecycleReview(entries, {
    status: 'all',
    visibility: 'all',
    quality: 'stale'
  })

  assert.deepEqual(
    staleOnly.filteredItems.map((entry) => entry.id),
    ['assembled-old']
  )
})

test('knowledge pack session handoff exposes only saved weak-free pack matches', () => {
  const entries = [
    makeLifecycleEntry({
      id: 'assembled-old',
      status: 'assembled',
      sourceId: 'knowledge:source-1',
      weakFields: []
    }),
    makeLifecycleEntry({
      id: 'saved-current',
      status: 'saved',
      sourceId: 'knowledge:source-1',
      selected: true,
      weakFields: []
    }),
    makeLifecycleEntry({
      id: 'saved-weak',
      status: 'saved',
      sourceId: 'knowledge:source-2',
      selected: true,
      weakFields: ['missing_links']
    })
  ]

  const candidates = buildKnowledgePackSessionHandoffCandidates(
    entries,
    [
      makePack({
        id: 'pack-1',
        sourceId: 'knowledge:source-1',
        selected: false
      }),
      makePack({
        id: 'pack-2',
        sourceId: 'knowledge:source-2',
        selected: true
      })
    ],
    makeSession()
  )

  const current = candidates.find((candidate) => candidate.entryId === 'saved-current')
  const stale = candidates.find((candidate) => candidate.entryId === 'assembled-old')
  const weak = candidates.find((candidate) => candidate.entryId === 'saved-weak')

  assert.equal(current.canAttach, true)
  assert.equal(current.packId, 'pack-1')
  assert.equal(current.packSelected, false)
  assert.equal(current.reason, 'ready_for_session')
  assert.equal(stale.canAttach, false)
  assert.equal(stale.reason, 'not_latest_saved_review')
  assert.equal(weak.canAttach, false)
  assert.equal(weak.reason, 'weak_fields')

  const alreadyAttached = buildKnowledgePackSessionHandoffCandidates(
    entries,
    [makePack({ id: 'pack-1', sourceId: 'knowledge:source-1', selected: true })],
    makeSession(['pack-1'])
  ).find((candidate) => candidate.entryId === 'saved-current')

  assert.equal(alreadyAttached.canAttach, false)
  assert.equal(alreadyAttached.alreadyInSession, true)
  assert.equal(alreadyAttached.reason, 'already_in_session')
})

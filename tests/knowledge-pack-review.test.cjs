const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildKnowledgePackLifecycleReview,
  buildKnowledgePackReviewSurface
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

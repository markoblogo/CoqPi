const assert = require('node:assert/strict')
const test = require('node:test')

const {
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

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createMailDraftRecord,
  createOpportunityApplicationPack,
  extractCalendarSuggestion,
  getRemainingDailySendAllowance,
  createBatchSendApproval,
  deduplicateOpportunityCandidates,
  isBatchSendApprovalValid,
  migrateFinderStoreV1ToV2
} = require('../dist-electron/shared/opportunity-contracts.js')

test('migrates Finder v1 records to opportunity v2 without losing data', () => {
  const store = migrateFinderStoreV1ToV2({
    version: 1,
    jobs: [{
      version: 1,
      id: 'job-1',
      kind: 'job',
      label: 'Product roles',
      query: 'product manager france',
      status: 'ready',
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
      ownerId: 'owner',
      provenance: { sourceId: 'legacy-job', locatorSha256: 'abc' },
      contentHash: 'legacy-hash',
      statusHistory: []
    }],
    results: [{
      version: 1,
      id: 'candidate-1',
      jobId: 'job-1',
      kind: 'job',
      sourceId: 'legacy-result',
      partnerName: 'Acme',
      title: 'Product Lead',
      summary: 'A role in France.',
      links: ['https://example.com/job?a=1&utm_source=test'],
      status: 'ready',
      decision: { state: 'auto', updatedAt: '2026-08-10T10:00:00.000Z' },
      createdAt: '2026-08-10T10:00:00.000Z',
      ownerId: 'owner',
      provenance: { sourceId: 'legacy-result', locatorSha256: 'def' },
      contentHash: 'legacy-result-hash',
      statusHistory: []
    }],
    outreachDrafts: []
  })

  assert.equal(store.version, 2)
  assert.equal(store.jobs.length, 1)
  assert.equal(store.jobs[0].version, 2)
  assert.equal(store.jobs[0].scenario, 'job')
  assert.deepEqual(store.jobs[0].sourceAdapters, ['brave_web', 'greenhouse', 'lever'])
  assert.equal(store.results[0].version, 2)
  assert.equal(store.results[0].canonicalUrl, 'https://example.com/job?a=1')
  assert.equal(store.results[0].provider, 'legacy_import')
  assert.equal(store.results[0].firstSeenAt, '2026-08-10T10:00:00.000Z')
})

test('deduplicates opportunities by provider id, canonical URL and content hash', () => {
  const base = {
    version: 2,
    id: 'one',
    jobId: 'job-1',
    kind: 'job',
    sourceId: 'greenhouse:123',
    providerSourceId: '123',
    provider: 'greenhouse',
    partnerName: 'Acme',
    title: 'Product Lead',
    summary: 'Role summary',
    links: ['https://boards.greenhouse.io/acme/jobs/123'],
    canonicalUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    evidence: [],
    sourceConfidence: 0.9,
    discoveryContentHash: 'same',
    firstSeenAt: '2026-08-10T10:00:00.000Z',
    lastSeenAt: '2026-08-10T10:00:00.000Z',
    status: 'ready',
    decision: { state: 'auto', updatedAt: '2026-08-10T10:00:00.000Z' },
    createdAt: '2026-08-10T10:00:00.000Z',
    ownerId: 'owner',
    provenance: { sourceId: 'one', locatorSha256: 'a' },
    contentHash: 'same',
    statusHistory: []
  }

  const result = deduplicateOpportunityCandidates([
    base,
    { ...base, id: 'two', sourceId: 'other', providerSourceId: '123' },
    { ...base, id: 'three', provider: 'brave_web', providerSourceId: 'x' }
  ])

  assert.equal(result.unique.length, 1)
  assert.equal(result.duplicates.length, 2)
})

test('batch approval is bound to exact immutable message hashes', () => {
  const approval = createBatchSendApproval({
    id: 'approval-1',
    now: '2026-08-13T10:00:00.000Z',
    messageHashes: ['bbb', 'aaa', 'aaa']
  })

  assert.deepEqual(approval.messageHashes, ['aaa', 'bbb'])
  assert.equal(isBatchSendApprovalValid(approval, ['bbb', 'aaa']), true)
  assert.equal(isBatchSendApprovalValid(approval, ['aaa', 'changed']), false)
})

test('application pack abstains from ready when selected owner facts are weak', () => {
  const candidate = {
    version: 2,
    id: 'candidate',
    jobId: 'job',
    kind: 'job',
    sourceId: 'source',
    partnerName: 'Acme',
    title: 'Product Lead',
    summary: 'Role',
    links: ['https://example.com/job'],
    canonicalUrl: 'https://example.com/job',
    provider: 'brave_web',
    providerSourceId: 'source',
    evidence: [],
    sourceConfidence: 0.5,
    discoveryContentHash: 'hash',
    firstSeenAt: '2026-08-13T10:00:00Z',
    lastSeenAt: '2026-08-13T10:00:00Z',
    status: 'ready',
    decision: { state: 'auto', updatedAt: '2026-08-13T10:00:00Z' },
    createdAt: '2026-08-13T10:00:00Z',
    ownerId: 'owner',
    provenance: { sourceId: 'source', locatorSha256: 'a' },
    contentHash: 'hash',
    statusHistory: []
  }
  const pack = createOpportunityApplicationPack({
    id: 'pack',
    now: '2026-08-13T10:00:00Z',
    candidate,
    ownerFactsToUse: [],
    ownerFactsToAvoid: ['Unrelated personal history']
  })

  assert.equal(pack.status, 'needs_review')
  assert.match(pack.missingInformation.join(' '), /owner fact/i)
})

test('mail draft hash changes whenever reviewed message content changes', () => {
  const applicationPack = {
    version: 1,
    id: 'pack',
    candidateId: 'candidate',
    scenario: 'job',
    status: 'ready',
    targetFacts: [],
    ownerFactsToUse: ['Verified product leadership experience.'],
    ownerFactsToAvoid: [],
    opener: 'Hello',
    motivationLetter: 'Body',
    materialIds: [],
    questions: [],
    missingInformation: [],
    confidence: 0.9,
    createdAt: '2026-08-13T10:00:00Z',
    contentHash: 'pack-hash'
  }
  const first = createMailDraftRecord({ id: 'one', now: '2026-08-13T10:00:00Z', applicationPack, recipient: 'me@example.com', subject: 'Role', body: 'First' })
  const edited = createMailDraftRecord({ id: 'two', now: '2026-08-13T10:00:00Z', applicationPack, recipient: 'me@example.com', subject: 'Role', body: 'Edited' })
  assert.notEqual(first.messageHash, edited.messageHash)
})

test('extracts only explicit ISO-like call details into a Calendar suggestion', () => {
  const suggestion = extractCalendarSuggestion(
    'Call 2026-08-20 14:30+02:00 with partner@example.com https://meet.google.com/abc-defg-hij',
    'Europe/Paris'
  )
  assert.equal(suggestion.startAt, '2026-08-20T12:30:00.000Z')
  assert.equal(suggestion.timezone, 'Europe/Paris')
  assert.deepEqual(suggestion.attendees, ['partner@example.com'])
  assert.match(suggestion.meetingUrl, /meet\.google\.com/)
  assert.equal(extractCalendarSuggestion('Maybe next week.'), undefined)
})

test('daily send allowance enforces the 20 message local-day cap', () => {
  const drafts = Array.from({ length: 19 }, (_, index) => ({
    id: String(index),
    status: 'sent',
    updatedAt: '2026-08-13T10:00:00.000Z'
  }))
  assert.equal(getRemainingDailySendAllowance(drafts, '2026-08-13T12:00:00.000Z'), 1)
  assert.equal(getRemainingDailySendAllowance(drafts, '2026-08-14T12:00:00.000Z'), 20)
})

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildKnowledgeIngestionSummary,
  evaluateContextSourceReadiness,
  formatContextSourceReadinessFixes
} = require('../dist-electron/shared/knowledge-ingestion-quality.js')

const now = new Date('2026-07-22T00:00:00.000Z')

const makeSource = (overrides = {}) => ({
  id: 'source-A',
  kind: 'file',
  location: '/tmp/profile.md',
  label: 'Profile',
  selected: true,
  status: 'pending_classification',
  createdAt: '2026-07-21T00:00:00.000Z',
  ownerId: 'owner',
  provenance: {
    sourceId: 'coqpi:ingress:source-A',
    locatorSha256: 'a'.repeat(64)
  },
  contentHash: null,
  classification: 'pending',
  retention: {
    mode: 'manual_deletion_required',
    maxAgeDays: 30,
    expiresAt: '2026-08-20T00:00:00.000Z'
  },
  retrievalScopes: ['coqpi_pending_classification'],
  promotion: 'explicit_audit_required',
  ...overrides
})

const makePack = (overrides = {}) => ({
  version: 1,
  id: 'pack-A',
  sourceId: 'finder:job:a',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Senior Product Manager',
  summary:
    'Acme is hiring a senior product manager for AI transformation work in France.',
  context:
    'The call is about a CDI role. The candidate sent a focused product and AI transformation profile, and the goal is to explain fit, clarify scope, and ask about decision process.',
  links: ['https://example.com/job'],
  selected: true,
  status: 'retrieval_ready',
  createdAt: '2026-07-22T00:00:00.000Z',
  ownerId: 'owner',
  provenance: {
    sourceId: 'coqpi:finder:finder:job:a',
    locatorSha256: 'b'.repeat(64)
  },
  contentHash: 'c'.repeat(64),
  classification: 'private',
  retention: {
    mode: 'manual_deletion_required',
    maxAgeDays: 30,
    expiresAt: '2026-08-21T00:00:00.000Z'
  },
  retrievalScopes: ['coqpi_interview_en_fr'],
  promotion: 'explicit_audit_required',
  ...overrides
})

test('context source readiness keeps pending sources out of retrieval', () => {
  const readiness = evaluateContextSourceReadiness(makeSource(), now)

  assert.equal(readiness.level, 'pending')
  assert.equal(readiness.retrievalReady, false)
  assert.deepEqual(
    readiness.issues.map((issue) => issue.id),
    ['pending_classification']
  )
  assert.match(formatContextSourceReadinessFixes(readiness), /Capture and classify/)
})

test('context source readiness distinguishes hash-only captures from retrieval-ready text', () => {
  const hashOnly = evaluateContextSourceReadiness(
    makeSource({
      status: 'hash_captured',
      contentHash: 'd'.repeat(64),
      classification: 'private',
      retrievalScopes: []
    }),
    now
  )

  assert.equal(hashOnly.level, 'blocked')
  assert.equal(hashOnly.issues[0].id, 'hash_only')

  const ready = evaluateContextSourceReadiness(
    makeSource({
      status: 'retrieval_ready',
      contentHash: 'e'.repeat(64),
      classification: 'private',
      retrievalScopes: ['coqpi_interview_en_fr']
    }),
    now
  )

  assert.equal(ready.level, 'ready')
  assert.equal(ready.retrievalReady, true)
  assert.equal(ready.issues.length, 0)
  assert.match(ready.label, /expires in/)
})

test('context source readiness treats explicit source adapters differently', () => {
  const profileFile = evaluateContextSourceReadiness(
    makeSource({
      kind: 'owner_profile_file',
      status: 'retrieval_ready',
      contentHash: 'e'.repeat(64),
      classification: 'private',
      retrievalScopes: ['coqpi_interview_en_fr']
    }),
    now
  )
  const profileLink = evaluateContextSourceReadiness(
    makeSource({
      kind: 'public_profile_link',
      location: 'https://linkedin.com/in/example',
      label: 'LinkedIn profile'
    }),
    now
  )

  assert.equal(profileFile.level, 'ready')
  assert.equal(profileFile.retrievalReady, true)
  assert.equal(profileLink.retrievalReady, false)
  assert.equal(
    profileLink.issues.some((issue) => issue.id === 'unsupported_ingress'),
    true
  )
  assert.match(formatContextSourceReadinessFixes(profileLink), /pointer-only/)
})

test('knowledge ingestion summary reports lifecycle and vector candidate-set readiness', () => {
  const readySource = makeSource({
    status: 'retrieval_ready',
    contentHash: 'e'.repeat(64),
    classification: 'private',
    retrievalScopes: ['coqpi_interview_en_fr']
  })
  const weakPack = makePack({
    id: 'pack-weak',
    sourceId: 'finder:job:weak',
    summary: 'Short.',
    context: '',
    links: []
  })

  const summary = buildKnowledgeIngestionSummary(
    [readySource],
    [makePack(), weakPack],
    now
  )

  assert.equal(summary.sourceReadyCount, 1)
  assert.equal(summary.sourcePendingCount, 0)
  assert.equal(summary.packStrongCount, 1)
  assert.equal(summary.packWeakCount, 1)
  assert.equal(summary.retrievalReadyPackCount, 1)
  assert.equal(summary.vectorReady, true)
  assert.match(summary.label, /1\/1 sources ready/)
  assert.match(summary.soonestExpiryLabel, /soonest expiry/)
})

test('expired retention blocks source readiness and vector candidate-set readiness', () => {
  const expired = makeSource({
    status: 'retrieval_ready',
    contentHash: 'f'.repeat(64),
    classification: 'private',
    retrievalScopes: ['coqpi_interview_en_fr'],
    retention: {
      mode: 'manual_deletion_required',
      maxAgeDays: 30,
      expiresAt: '2026-07-01T00:00:00.000Z'
    }
  })
  const readiness = evaluateContextSourceReadiness(expired, now)
  const summary = buildKnowledgeIngestionSummary([expired], [makePack()], now)

  assert.equal(readiness.level, 'blocked')
  assert.equal(readiness.issues.some((issue) => issue.id === 'expired_retention'), true)
  assert.equal(summary.sourceBlockedCount, 1)
  assert.equal(summary.vectorReady, false)
})

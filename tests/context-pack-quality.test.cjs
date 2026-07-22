const assert = require('node:assert/strict')
const test = require('node:test')

const {
  evaluateCounterpartyPackQuality,
  formatCounterpartyPackQualityFixes
} = require('../dist-electron/shared/context-pack-quality.js')

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
    locatorSha256: 'a'.repeat(64)
  },
  contentHash: 'b'.repeat(64),
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

test('counterparty pack quality marks complete retrieval-ready packs as strong', () => {
  const quality = evaluateCounterpartyPackQuality(makePack())

  assert.equal(quality.score, 100)
  assert.equal(quality.level, 'strong')
  assert.equal(quality.label, 'strong 100/100')
  assert.deepEqual(quality.issues, [])
  assert.equal(formatCounterpartyPackQualityFixes(quality), 'No obvious fixes.')
})

test('counterparty pack quality reports concrete fixes for weak packs', () => {
  const quality = evaluateCounterpartyPackQuality(
    makePack({
      summary: 'Short.',
      context: '',
      links: []
    })
  )

  assert.equal(quality.level, 'weak')
  assert.equal(quality.score, 40)
  assert.deepEqual(
    quality.issues.map((issue) => issue.id),
    ['short_summary', 'missing_context', 'missing_links']
  )
  assert.match(formatCounterpartyPackQualityFixes(quality), /summary/)
  assert.match(formatCounterpartyPackQualityFixes(quality), /goal/)
})

test('counterparty pack quality blocks packs that cannot enter session retrieval', () => {
  const quality = evaluateCounterpartyPackQuality(
    makePack({
      selected: false,
      status: 'pending_classification',
      retrievalScopes: []
    })
  )

  assert.equal(quality.level, 'blocked')
  assert.equal(quality.issues[0].id, 'session_blocked')
  assert.match(quality.issues[0].label, /blocked:/)
  assert.match(formatCounterpartyPackQualityFixes(quality), /selection/)
})

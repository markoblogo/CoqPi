const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSessionPayloadInspector
} = require('../dist-electron/shared/session-payload-inspector.js')

const makeContext = (overrides = {}) => ({
  company: 'Acme',
  role: 'Senior Product Manager',
  context: 'Interview context.',
  goal: 'Explain fit.',
  notes: 'Use selected context only.',
  selectedCounterpartyPackIds: ['pack-ready', 'pack-blocked', 'pack-missing'],
  selectedFinderOutreachDraftId: 'draft-A',
  ...overrides
})

const makePack = (overrides = {}) => ({
  version: 1,
  id: 'pack-ready',
  sourceId: 'finder:job:ready',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Senior Product Manager',
  summary: 'Relevant role.',
  context: 'Interview context.',
  links: ['https://example.com/job'],
  selected: true,
  status: 'retrieval_ready',
  createdAt: '2026-07-23T10:00:00.000Z',
  ownerId: 'owner',
  provenance: {
    sourceId: 'finder:job:ready',
    locatorSha256: 'a'.repeat(64)
  },
  contentHash: 'b'.repeat(64),
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

const makeDraft = (overrides = {}) => ({
  version: 1,
  id: 'draft-A',
  jobId: 'job-A',
  candidateResultId: 'result-A',
  sourceId: 'finder:job:ready',
  kind: 'job',
  targetName: 'Acme',
  opportunity: 'Senior Product Manager',
  fitLabel: '90/100 strong',
  whyRelevant: 'Strong match.',
  knownContext: ['Role context.'],
  questionsToAsk: ['What is success?'],
  openingMessage: 'Hello Acme.',
  nextAction: 'Use before call.',
  warnings: [],
  status: 'draft',
  createdAt: '2026-07-23T10:00:00.000Z',
  ...overrides
})

test('session payload inspector separates included and dropped context', () => {
  const inspector = buildSessionPayloadInspector({
    context: makeContext(),
    availablePacks: [
      makePack(),
      makePack({
        id: 'pack-blocked',
        sourceId: 'finder:job:blocked',
        partnerName: 'Blocked',
        selected: false
      })
    ],
    availableOutreachDrafts: [makeDraft()],
    includeProfileContext: true,
    profileChars: 123
  })

  assert.equal(inspector.includedPacks.length, 1)
  assert.equal(inspector.includedPacks[0].id, 'pack-ready')
  assert.deepEqual(
    inspector.droppedPacks.map((pack) => pack.id),
    ['pack-blocked', 'pack-missing']
  )
  assert.match(inspector.droppedPacks[0].reason, /not selected/)
  assert.match(inspector.droppedPacks[1].reason, /missing/)
  assert.equal(inspector.includedOutreachDraft.label, 'Acme · Senior Product Manager')
  assert.equal(inspector.droppedOutreachDraft, null)
  assert.equal(inspector.profileLabel, 'profile 123 chars')
  assert.equal(inspector.warningCount, 2)
  assert.match(inspector.summaryLabel, /included packs 1/)
})

test('session payload inspector reports stale outreach draft and profile off', () => {
  const inspector = buildSessionPayloadInspector({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-missing' }),
    availablePacks: [makePack()],
    availableOutreachDrafts: [],
    includeProfileContext: false,
    profileChars: 0
  })

  assert.equal(inspector.includedOutreachDraft, null)
  assert.equal(inspector.droppedOutreachDraft.id, 'draft-missing')
  assert.match(inspector.droppedOutreachDraft.reason, /missing/)
  assert.equal(inspector.profileLabel, 'profile off')
  assert.equal(inspector.warningCount, 3)
})

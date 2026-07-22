const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildManualPrepPreview
} = require('../dist-electron/shared/manual-prep-preview.js')

const makeContext = (overrides = {}) => ({
  company: 'Acme',
  role: 'Senior Product Manager',
  context: 'CDI AI transformation role in France.',
  goal: 'Explain fit and clarify the hiring process.',
  notes: 'Mention product leadership, AI transformation, and agro-commodities workflow experience.',
  selectedCounterpartyPackIds: ['pack-A'],
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

test('manual prep preview summarizes focused session and assistant payload', () => {
  const preview = buildManualPrepPreview({
    context: makeContext(),
    availablePacks: [makePack()],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.sessionLabel, 'Acme · Senior Product Manager')
  assert.equal(preview.selectedPackCount, 1)
  assert.equal(preview.selectedPackQualityLevel, 'strong')
  assert.equal(preview.selectedPackQualityLabel, 'strong 100/100')
  assert.match(preview.assistantPayloadLabel, /packs 1/)
  assert.match(preview.assistantPayloadLabel, /profile 1234 chars/)
  assert.deepEqual(preview.weakFields, [])
})

test('manual prep preview reports weak fields and missing pack', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({
      company: '',
      role: '',
      context: '',
      goal: '',
      notes: '',
      selectedCounterpartyPackIds: []
    }),
    availablePacks: [],
    includeProfileContext: false,
    profileChars: 0
  })

  assert.equal(preview.sessionLabel, 'No company/role')
  assert.equal(preview.goalLabel, 'No goal')
  assert.equal(preview.contextLabel, 'No context')
  assert.equal(preview.selectedPackLabel, 'No selected pack')
  assert.equal(preview.selectedPackQualityLevel, 'none')
  assert.match(preview.assistantPayloadLabel, /profile off/)
  assert.deepEqual(
    preview.weakFields.map((field) => field.id),
    [
      'missing_company',
      'missing_role',
      'missing_goal',
      'missing_context',
      'missing_notes',
      'missing_pack'
    ]
  )
})

test('manual prep preview surfaces weak selected pack', () => {
  const preview = buildManualPrepPreview({
    context: makeContext(),
    availablePacks: [
      makePack({
        summary: 'Short.',
        context: '',
        links: []
      })
    ],
    includeProfileContext: true,
    profileChars: 10
  })

  assert.equal(preview.selectedPackQualityLevel, 'weak')
  assert.equal(
    preview.weakFields.some((field) => field.id === 'weak_pack'),
    true
  )
})

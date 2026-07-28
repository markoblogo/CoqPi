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
  selectedFinderOutreachDraftId: '',
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

const makeDraft = (overrides = {}) => ({
  version: 1,
  id: 'draft-A',
  jobId: 'job-A',
  candidateResultId: 'result-A',
  sourceId: 'finder:job:a',
  kind: 'job',
  targetName: 'Acme',
  opportunity: 'Senior Product Manager',
  fitLabel: '91/100 strong',
  whyRelevant: 'Strong match.',
  knownContext: ['Role context.'],
  questionsToAsk: ['What is success?'],
  openingMessage: 'Hi Acme, I saw the role.',
  nextAction: 'Use this context before the call.',
  warnings: [],
  status: 'draft',
  createdAt: '2026-07-22T00:00:00.000Z',
  ...overrides
})

const makeCandidateResult = (overrides = {}) => ({
  version: 1,
  id: 'result-A',
  jobId: 'job-A',
  sourceId: 'finder:job:a',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Senior Product Manager',
  summary: 'Relevant role.',
  status: 'ready',
  decision: {
    state: 'auto',
    updatedAt: '2026-07-22T00:00:00.000Z'
  },
  fitScore: 91,
  whyRelevant: 'Strong match.',
  missingInfo: 'None',
  nextAction: 'Use this context before the call.',
  createdAt: '2026-07-22T00:00:00.000Z',
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
  assert.equal(preview.selectedOutreachDraftLabel, 'No selected outreach draft')
  assert.match(preview.assistantPayloadLabel, /packs 1/)
  assert.match(preview.assistantPayloadLabel, /profile 1234 chars/)
  assert.deepEqual(preview.weakFields, [])
})

test('manual prep preview shows selected outreach draft label', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-A' }),
    availablePacks: [makePack()],
    availableOutreachDrafts: [makeDraft()],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.selectedOutreachDraftLabel, 'Acme · Senior Product Manager')
  assert.equal(preview.selectedOutreachDraftStatusLabel, 'working draft')
  assert.match(preview.selectedOutreachDraftLastContactLabel, /No contact recorded/)
  assert.match(preview.selectedOutreachDraftFollowUpLabel, /Use this context before the call/)
  assert.equal(preview.selectedOutreachDraftDecisionKind, 'weak')
  assert.match(preview.selectedOutreachDraftDecisionReasonLabel, /weak/)
  assert.equal(preview.selectedOutreachDraftHandoffState, 'review')
  assert.match(preview.selectedOutreachDraftHandoffLabel, /review before call|draft only/i)
  assert.deepEqual(
    preview.weakFields.some((field) => field.id === 'weak_outreach_draft'),
    true
  )
})

test('manual prep preview marks ineligible draft when status is closed', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-A' }),
    availablePacks: [makePack()],
    availableOutreachDrafts: [makeDraft({ status: 'closed' })],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.selectedOutreachDraftDecisionKind, 'ineligible')
  assert.match(preview.selectedOutreachDraftDecisionReasonLabel, /ineligible/)
  assert.deepEqual(
    preview.weakFields.some((field) => field.id === 'ineligible_outreach_draft'),
    true
  )
})

test('manual prep preview auto-links follow-up draft from selected pack when no explicit draft is selected', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({
      selectedCounterpartyPackIds: ['pack-A'],
      selectedFinderOutreachDraftId: ''
    }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        decision: {
          state: 'import_now',
          updatedAt: '2026-07-28T10:00:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [
      makeDraft({
        status: 'follow_up',
        nextAction: 'Prepare the next follow-up question about AI delivery.'
      })
    ],
    includeProfileContext: true,
    profileChars: 120
  })

  assert.match(preview.selectedOutreachDraftLabel, /^Linked: /)
  assert.equal(preview.selectedOutreachDraftHandoffState, 'follow_up')
  assert.match(preview.selectedOutreachDraftHandoffLabel, /follow-up|waiting|contact/i)
})

test('manual prep preview shows relationship memory for selected outreach draft', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-A' }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        decision: {
          state: 'hold_later',
          updatedAt: '2026-07-26T18:00:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [
      makeDraft({
        status: 'follow_up',
        statusHistory: [
          {
            status: 'follow_up',
            at: '2026-07-26T18:15:00.000Z',
            reason: 'follow-up due after first contact'
          },
          {
            status: 'contacted',
            at: '2026-07-25T09:30:00.000Z',
            reason: 'owner sent the intro'
          }
        ],
        nextAction: 'Send a brief follow-up if no answer by Tuesday.',
        questionsToAsk: ['Should we align on the next conversation format?']
      })
    ],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.selectedOutreachDraftStatusLabel, 'follow-up')
  assert.match(preview.selectedOutreachDraftLastContactLabel, /follow-up · 2026-07-26 18:15:00Z/)
  assert.match(preview.selectedOutreachDraftFollowUpLabel, /Send a brief follow-up/)
  assert.equal(preview.selectedOutreachDraftHandoffState, 'follow_up')
  assert.match(preview.selectedOutreachDraftHandoffLabel, /follow-up|waiting|contact/i)
})

test('manual prep preview blocks selected draft when linked candidate was rejected', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-A' }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        status: 'rejected',
        decision: {
          state: 'rejected',
          updatedAt: '2026-07-26T18:00:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [makeDraft({ status: 'follow_up' })],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.selectedOutreachDraftHandoffState, 'blocked')
  assert.match(preview.selectedOutreachDraftHandoffLabel, /rejected target/i)
  assert.equal(
    preview.weakFields.some((field) => field.id === 'ineligible_outreach_draft'),
    true
  )
})

test('manual prep preview flags stale selected outreach draft', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-missing' }),
    availablePacks: [makePack()],
    availableOutreachDrafts: [makeDraft()],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.selectedOutreachDraftLabel, 'Missing selected draft')
  assert.equal(
    preview.weakFields.some((field) => field.id === 'missing_outreach_draft'),
    true
  )
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
  assert.equal(preview.selectedPackLabel, 'No pack selected')
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

test('manual prep preview immediately reflects removed or invalidated selected pack', () => {
  const removedPreview = buildManualPrepPreview({
    context: makeContext({ selectedCounterpartyPackIds: ['pack-A'] }),
    availablePacks: [],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(removedPreview.selectedPackCount, 0)
  assert.equal(removedPreview.selectedPackLabel, 'pack-A')
  assert.equal(removedPreview.selectedPackQualityLevel, 'blocked')
  assert.equal(
    removedPreview.weakFields.some((field) => field.id === 'blocked_pack'),
    true
  )

  const invalidatedPreview = buildManualPrepPreview({
    context: makeContext({ selectedCounterpartyPackIds: ['pack-A'] }),
    availablePacks: [
      makePack({
        selected: false,
        status: 'pending_classification'
      })
    ],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(invalidatedPreview.selectedPackCount, 0)
  assert.equal(
    invalidatedPreview.selectedPackLabel,
    'Acme · Senior Product Manager'
  )
  assert.equal(invalidatedPreview.selectedPackQualityLevel, 'blocked')
  assert.equal(
    invalidatedPreview.selectedPackQualityLabel,
    'dropped from assistant payload'
  )
  assert.equal(
    invalidatedPreview.weakFields.some((field) => field.id === 'blocked_pack'),
    true
  )
})

test('manual prep preview preserves dropped selected pack label after session ids are pruned', () => {
  const preview = buildManualPrepPreview({
    context: makeContext({ selectedCounterpartyPackIds: [] }),
    availablePacks: [
      makePack({
        selected: false,
        status: 'pending_classification'
      })
    ],
    auditedDroppedPacks: [
      {
        id: 'pack-A',
        label: 'Acme · Senior Product Manager',
        sourceId: 'finder:job:a',
        status: 'dropped',
        reason: 'not selected, not retrieval-ready'
      }
    ],
    includeProfileContext: true,
    profileChars: 1234
  })

  assert.equal(preview.selectedPackCount, 0)
  assert.equal(preview.selectedPackLabel, 'Acme · Senior Product Manager')
  assert.equal(preview.selectedPackQualityLevel, 'blocked')
  assert.equal(
    preview.weakFields.some((field) => field.id === 'blocked_pack'),
    true
  )
})

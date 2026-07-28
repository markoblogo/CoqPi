const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSessionPayloadInspector,
  buildSessionPayloadPackSummary
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

const makeCandidateResult = (overrides = {}) => ({
  version: 1,
  id: 'result-A',
  jobId: 'job-A',
  sourceId: 'finder:job:ready',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Senior Product Manager',
  summary: 'Relevant role.',
  status: 'ready',
  decision: {
    state: 'auto',
    updatedAt: '2026-07-23T10:00:00.000Z'
  },
  fitScore: 91,
  whyRelevant: 'Strong match.',
  missingInfo: 'None',
  nextAction: 'Use before call.',
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
  assert.equal(inspector.includedOutreachDraft.relationshipStatusLabel, 'working draft')
  assert.match(inspector.includedOutreachDraft.lastContactLabel, /No contact recorded/)
  assert.match(inspector.includedOutreachDraft.followUpContextLabel, /Use before call/)
  assert.equal(inspector.droppedOutreachDraft, null)
  assert.equal(inspector.profileLabel, 'profile 123 chars')
  assert.equal(inspector.warningCount, 2)
  assert.match(inspector.summaryLabel, /included packs 1/)
})

test('session payload inspector includes relationship memory for contacted outreach draft', () => {
  const inspector = buildSessionPayloadInspector({
    context: makeContext({
      selectedCounterpartyPackIds: ['pack-ready'],
      selectedFinderOutreachDraftId: 'draft-A'
    }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        decision: {
          state: 'import_now',
          updatedAt: '2026-07-26T10:59:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [
      makeDraft({
        status: 'waiting',
        statusHistory: [
          {
            status: 'waiting',
            at: '2026-07-26T11:00:00.000Z',
            reason: 'waiting for recruiter reply'
          },
          {
            status: 'contacted',
            at: '2026-07-25T09:30:00.000Z',
            reason: 'owner sent the intro'
          }
        ],
        nextAction: 'Prepare short follow-up for the recruiter.',
        questionsToAsk: ['What is the timeline for next steps?']
      })
    ],
    includeProfileContext: true,
    profileChars: 123
  })

  assert.equal(inspector.includedOutreachDraft.relationshipStatusLabel, 'waiting')
  assert.match(inspector.includedOutreachDraft.lastContactLabel, /waiting · 2026-07-26 11:00:00Z/)
  assert.match(
    inspector.includedOutreachDraft.followUpContextLabel,
    /Prepare short follow-up/
  )
  assert.equal(inspector.includedOutreachDraft.decisionKind, 'usable')
  assert.match(inspector.includedOutreachDraft.decisionReason ?? '', /active/)
  assert.equal(inspector.includedOutreachDraft.handoffState, 'follow_up')
  assert.match(inspector.includedOutreachDraft.handoffLabel ?? '', /contact|follow-up|waiting/i)
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
  assert.equal(inspector.droppedOutreachDraft?.decisionKind, 'ineligible')
})

test('session payload inspector reports weak and ineligible outreach draft decisions', () => {
  const includedInspector = buildSessionPayloadInspector({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-A' }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        decision: {
          state: 'hold_later',
          updatedAt: '2026-07-23T11:00:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [makeDraft()],
    includeProfileContext: true,
    profileChars: 10
  })

  assert.equal(includedInspector.includedOutreachDraft?.decisionKind, 'weak')
  assert.match(
    includedInspector.includedOutreachDraft?.decisionReason ?? '',
    /needs explicit readiness confirmation/
  )
  assert.equal(includedInspector.includedOutreachDraft?.handoffState, 'review')
  assert.match(
    includedInspector.includedOutreachDraft?.handoffLabel ?? '',
    /hold for later|review before call/i
  )

  const ineligibleInspector = buildSessionPayloadInspector({
    context: makeContext({ selectedFinderOutreachDraftId: 'draft-A' }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        status: 'rejected',
        decision: {
          state: 'rejected',
          reason: 'not relevant anymore',
          updatedAt: '2026-07-23T11:30:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [makeDraft({ status: 'closed' })],
    includeProfileContext: true,
    profileChars: 10
  })

  assert.equal(ineligibleInspector.includedOutreachDraft, null)
  assert.equal(ineligibleInspector.droppedOutreachDraft?.decisionKind, 'ineligible')
  assert.match(
    ineligibleInspector.droppedOutreachDraft?.decisionReason ?? '',
    /ineligible/
  )
  assert.equal(ineligibleInspector.droppedOutreachDraft?.handoffState, 'blocked')
})

test('session payload inspector drops selected draft when linked candidate is rejected in queue', () => {
  const inspector = buildSessionPayloadInspector({
    context: makeContext({
      selectedCounterpartyPackIds: ['pack-ready'],
      selectedFinderOutreachDraftId: 'draft-A'
    }),
    availablePacks: [makePack()],
    availableFinderResults: [
      makeCandidateResult({
        status: 'rejected',
        decision: {
          state: 'rejected',
          reason: 'owner rejected candidate',
          updatedAt: '2026-07-23T12:00:00.000Z'
        }
      })
    ],
    availableOutreachDrafts: [makeDraft({ status: 'follow_up' })],
    includeProfileContext: true,
    profileChars: 25
  })

  assert.equal(inspector.includedOutreachDraft, null)
  assert.equal(inspector.droppedOutreachDraft?.handoffState, 'blocked')
  assert.match(inspector.droppedOutreachDraft?.reason ?? '', /rejected target/i)
  assert.match(
    inspector.droppedOutreachDraft?.handoffHint ?? '',
    /dropped from assistant payload/i
  )
})

test('session payload inspector reflects included to dropped transition when available items change', () => {
  const context = makeContext({
    selectedCounterpartyPackIds: ['pack-ready'],
    selectedFinderOutreachDraftId: 'draft-A'
  })

  const initial = buildSessionPayloadInspector({
    context,
    availablePacks: [makePack()],
    availableOutreachDrafts: [makeDraft()],
    includeProfileContext: true,
    profileChars: 123
  })

  const changed = buildSessionPayloadInspector({
    context,
    availablePacks: [
      makePack({
        id: 'pack-ready',
        selected: false,
        status: 'pending_classification'
      })
    ],
    availableOutreachDrafts: [],
    includeProfileContext: true,
    profileChars: 123
  })

  assert.equal(initial.includedPacks.length, 1)
  assert.equal(initial.droppedPacks.length, 0)
  assert.equal(initial.includedOutreachDraft?.id, 'draft-A')
  assert.equal(initial.droppedOutreachDraft, null)

  assert.equal(changed.includedPacks.length, 0)
  assert.equal(changed.droppedPacks.length, 1)
  assert.match(changed.droppedPacks[0].reason, /not selected/)
  assert.equal(changed.includedOutreachDraft, null)
  assert.equal(changed.droppedOutreachDraft?.id, 'draft-A')
  assert.match(changed.droppedOutreachDraft?.reason ?? '', /missing/)
  assert.equal(changed.warningCount, 2)
})

test('session payload inspector preserves dropped pack audit after session ids are pruned', () => {
  const droppedPackAudit = {
    id: 'pack-ready',
    label: 'Acme · Senior Product Manager',
    sourceId: 'finder:job:ready',
    status: 'dropped',
    reason: 'not selected, not retrieval-ready'
  }

  const inspector = buildSessionPayloadInspector({
    context: makeContext({
      selectedCounterpartyPackIds: [],
      selectedFinderOutreachDraftId: ''
    }),
    availablePacks: [
      makePack({
        id: 'pack-ready',
        selected: false,
        status: 'pending_classification'
      })
    ],
    availableOutreachDrafts: [],
    auditedDroppedPacks: [droppedPackAudit],
    includeProfileContext: true,
    profileChars: 123
  })

  assert.equal(inspector.includedPacks.length, 0)
  assert.deepEqual(
    inspector.droppedPacks.map((pack) => pack.id),
    ['pack-ready']
  )
  assert.match(inspector.droppedPacks[0].reason, /not selected/)
  assert.equal(inspector.warningCount, 1)
  assert.match(inspector.summaryLabel, /dropped 1/)
})

test('session payload pack summary stays aligned for included dropped and none states', () => {
  const included = buildSessionPayloadPackSummary(
    buildSessionPayloadInspector({
      context: makeContext({
        selectedCounterpartyPackIds: ['pack-ready'],
        selectedFinderOutreachDraftId: ''
      }),
      availablePacks: [makePack()],
      availableOutreachDrafts: [],
      includeProfileContext: true,
      profileChars: 1
    })
  )
  const dropped = buildSessionPayloadPackSummary(
    buildSessionPayloadInspector({
      context: makeContext({
        selectedCounterpartyPackIds: [],
        selectedFinderOutreachDraftId: ''
      }),
      availablePacks: [
        makePack({
          selected: false,
          status: 'pending_classification'
        })
      ],
      availableOutreachDrafts: [],
      auditedDroppedPacks: [
        {
          id: 'pack-ready',
          label: 'Acme · Senior Product Manager',
          sourceId: 'finder:job:ready',
          status: 'dropped',
          reason: 'not selected, not retrieval-ready'
        }
      ],
      includeProfileContext: true,
      profileChars: 1
    })
  )
  const none = buildSessionPayloadPackSummary(
    buildSessionPayloadInspector({
      context: makeContext({
        selectedCounterpartyPackIds: [],
        selectedFinderOutreachDraftId: ''
      }),
      availablePacks: [],
      availableOutreachDrafts: [],
      includeProfileContext: true,
      profileChars: 1
    })
  )

  assert.equal(included.state, 'included')
  assert.equal(included.label, 'Packs: Acme · Senior Product Manager')
  assert.equal(included.detailLabel, 'Acme · Senior Product Manager')
  assert.equal(dropped.state, 'dropped')
  assert.equal(dropped.label, 'Dropped: Acme · Senior Product Manager')
  assert.equal(dropped.detailLabel, 'Acme · Senior Product Manager')
  assert.equal(none.state, 'none')
  assert.equal(none.label, 'No packs selected')
  assert.equal(none.detailLabel, 'No pack selected')
})

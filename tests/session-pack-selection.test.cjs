const assert = require('node:assert/strict')
const test = require('node:test')

const {
  formatCounterpartyPackSessionEligibility,
  getCounterpartyPackSessionEligibility,
  getSessionContextWithImportedCounterpartyPacks,
  getSessionContextWithCounterpartyPacks,
  getSessionSelectedCounterpartyPackIds,
  reconcileSessionContextWithFinderOutreachDraftSelection,
  reconcileSessionContextWithFinderOutreachDraftStatus,
  reconcileSessionContextWithFinderQueueDecision
} = require('../dist-electron/shared/session-pack-selection.js')

const makeSession = (
  selectedCounterpartyPackIds = [],
  overrides = {}
) => ({
  company: 'Acme',
  role: 'Founder',
  context: 'Interview',
  goal: 'Keep context scoped',
  notes: '',
  selectedCounterpartyPackIds,
  selectedFinderOutreachDraftId: '',
  ...overrides
})

const makePack = (overrides = {}) => ({
  version: 1,
  id: 'pack-A',
  sourceId: 'finder:job:a',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Role',
  summary: 'Summary',
  context: '',
  links: [],
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

const makeResult = (overrides = {}) => ({
  version: 1,
  id: 'result-A',
  jobId: 'job-A',
  sourceId: 'finder:job:a',
  kind: 'job',
  partnerName: 'Acme',
  title: 'Role',
  summary: 'Summary',
  status: 'ready',
  decision: {
    state: 'auto',
    updatedAt: '2026-07-28T10:00:00.000Z'
  },
  createdAt: '2026-07-28T10:00:00.000Z',
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
  opportunity: 'Role',
  fitLabel: '88/100 strong',
  whyRelevant: 'Strong match',
  knownContext: [],
  questionsToAsk: [],
  openingMessage: 'Hello',
  nextAction: 'Follow up',
  warnings: [],
  status: 'draft',
  createdAt: '2026-07-28T10:00:00.000Z',
  statusHistory: [],
  ...overrides
})

test('session pack selection drops disabled, removed, duplicate and missing ids', () => {
  const packA = makePack({ id: 'pack-A' })
  const packB = makePack({
    id: 'pack-B',
    sourceId: 'finder:partner:b',
    kind: 'partner',
    selected: false
  })
  const packC = makePack({
    id: 'pack-C',
    sourceId: 'finder:investor:c',
    kind: 'investor',
    status: 'pending_classification'
  })

  const session = makeSession([
    'pack-A',
    'pack-A',
    'pack-B',
    'pack-C',
    'pack-removed',
    ''
  ])

  assert.deepEqual(
    getSessionSelectedCounterpartyPackIds(session, [packA, packB, packC]),
    ['pack-A']
  )

  assert.deepEqual(
    getSessionContextWithCounterpartyPacks(session, [packB, packC])
      .selectedCounterpartyPackIds,
    []
  )
})

test('session pack eligibility reports stable blocking reasons', () => {
  const eligible = getCounterpartyPackSessionEligibility(makePack())
  assert.equal(eligible.eligible, true)
  assert.deepEqual(eligible.reasons, [])

  const blocked = getCounterpartyPackSessionEligibility(
    makePack({
      version: undefined,
      selected: false,
      status: 'pending_classification',
      ownerId: 'other',
      classification: 'pending',
      retrievalScopes: []
    })
  )

  assert.equal(blocked.eligible, false)
  assert.deepEqual(blocked.reasons, [
    'wrong_version',
    'not_selected',
    'not_retrieval_ready',
    'wrong_owner',
    'not_private',
    'missing_interview_scope'
  ])

  assert.equal(
    formatCounterpartyPackSessionEligibility(eligible),
    'ready for session'
  )
  assert.equal(
    formatCounterpartyPackSessionEligibility(blocked),
    'blocked: wrong version, not selected, not retrieval-ready, wrong owner, not private, missing EN/FR interview scope'
  )
})

test('session pack selection auto-adds only imported packs that remain eligible', () => {
  const existing = makePack({
    id: 'pack-existing',
    sourceId: 'finder:job:existing'
  })
  const importedEligible = makePack({
    id: 'pack-imported',
    sourceId: 'finder:partner:imported',
    kind: 'partner'
  })
  const importedDisabled = makePack({
    id: 'pack-disabled',
    sourceId: 'finder:investor:disabled',
    kind: 'investor',
    selected: false
  })

  const nextContext = getSessionContextWithCounterpartyPacks(
    makeSession(['pack-existing']),
    [existing, importedEligible, importedDisabled],
    [
      {
        sourceId: 'finder:partner:imported',
        kind: 'partner',
        partnerName: 'Imported',
        title: 'Partner',
        summary: 'Imported partner.'
      },
      {
        sourceId: 'finder:investor:disabled',
        kind: 'investor',
        partnerName: 'Disabled',
        title: 'Investor',
        summary: 'Disabled investor.'
      }
    ]
  )

  assert.deepEqual(nextContext.selectedCounterpartyPackIds, [
    'pack-existing',
    'pack-imported'
  ])
})

test('app finder import handoff auto-selects imported eligible pack for session', () => {
  const existing = makePack({
    id: 'pack-existing',
    sourceId: 'finder:job:existing'
  })
  const importedFinderPack = makePack({
    id: 'pack-finder-imported',
    sourceId: 'finder:job:finder-imported',
    partnerName: 'Northfield Labs',
    title: 'Senior Product Lead'
  })

  const nextContext = getSessionContextWithImportedCounterpartyPacks(
    {
      ...makeSession(['pack-existing']),
      company: 'Northfield Labs',
      role: 'Senior Product Lead',
      context: 'Finder import handoff'
    },
    [existing, importedFinderPack],
    [
      {
        sourceId: 'finder:job:finder-imported',
        kind: 'job',
        partnerName: 'Northfield Labs',
        title: 'Senior Product Lead',
        summary: 'Imported from Finder result.'
      }
    ]
  )

  assert.deepEqual(nextContext.selectedCounterpartyPackIds, [
    'pack-existing',
    'pack-finder-imported'
  ])
})

test('session selection prunes selected pack immediately when pack is removed or becomes ineligible', () => {
  const selectedSession = makeSession(['pack-A'])
  const eligiblePack = makePack({ id: 'pack-A' })

  assert.deepEqual(
    getSessionContextWithCounterpartyPacks(selectedSession, [eligiblePack])
      .selectedCounterpartyPackIds,
    ['pack-A']
  )

  assert.deepEqual(
    getSessionContextWithCounterpartyPacks(selectedSession, [])
      .selectedCounterpartyPackIds,
    []
  )

  assert.deepEqual(
    getSessionContextWithCounterpartyPacks(selectedSession, [
      makePack({
        id: 'pack-A',
        selected: false,
        status: 'pending_classification'
      })
    ]).selectedCounterpartyPackIds,
    []
  )
})

test('finder queue import_now re-attaches matching eligible pack to session', () => {
  const pack = makePack({ id: 'pack-A', sourceId: 'finder:job:a' })
  const context = makeSession([])

  const reconciled = reconcileSessionContextWithFinderQueueDecision({
    context,
    availablePacks: [pack],
    availableOutreachDrafts: [],
    affectedResults: [
      makeResult({
        sourceId: 'finder:job:a',
        kind: 'job',
        decision: {
          state: 'import_now',
          updatedAt: '2026-07-28T10:30:00.000Z'
        }
      })
    ],
    nextDecisionState: 'import_now'
  })

  assert.deepEqual(reconciled.context.selectedCounterpartyPackIds, ['pack-A'])
  assert.deepEqual(reconciled.effect.selectedPackIdsAdded, ['pack-A'])
  assert.equal(reconciled.effect.clearedSelectedDraftId, null)
  assert.equal(reconciled.effect.changed, true)
})

test('finder queue hold_later removes matching selected pack but keeps selected draft', () => {
  const pack = makePack({ id: 'pack-A', sourceId: 'finder:job:a' })
  const context = makeSession(['pack-A'], {
    selectedFinderOutreachDraftId: 'draft-A'
  })

  const reconciled = reconcileSessionContextWithFinderQueueDecision({
    context,
    availablePacks: [pack],
    availableOutreachDrafts: [
      makeDraft({
        id: 'draft-A',
        candidateResultId: 'result-A',
        sourceId: 'finder:job:a'
      })
    ],
    affectedResults: [
      makeResult({
        id: 'result-A',
        sourceId: 'finder:job:a',
        kind: 'job',
        decision: {
          state: 'hold_later',
          updatedAt: '2026-07-28T10:45:00.000Z'
        }
      })
    ],
    nextDecisionState: 'hold_later'
  })

  assert.deepEqual(reconciled.context.selectedCounterpartyPackIds, [])
  assert.equal(reconciled.context.selectedFinderOutreachDraftId, 'draft-A')
  assert.deepEqual(reconciled.effect.selectedPackIdsRemoved, ['pack-A'])
  assert.equal(reconciled.effect.clearedSelectedDraftId, null)
  assert.equal(reconciled.effect.changed, true)
})

test('finder queue rejected clears matching selected pack and selected draft from session', () => {
  const pack = makePack({ id: 'pack-A', sourceId: 'finder:job:a' })
  const context = makeSession(['pack-A'], {
    selectedFinderOutreachDraftId: 'draft-A'
  })

  const reconciled = reconcileSessionContextWithFinderQueueDecision({
    context,
    availablePacks: [pack],
    availableOutreachDrafts: [
      makeDraft({
        id: 'draft-A',
        candidateResultId: 'result-A',
        sourceId: 'finder:job:a'
      })
    ],
    affectedResults: [
      makeResult({
        id: 'result-A',
        sourceId: 'finder:job:a',
        kind: 'job',
        status: 'rejected',
        decision: {
          state: 'rejected',
          updatedAt: '2026-07-28T11:00:00.000Z'
        }
      })
    ],
    nextDecisionState: 'rejected'
  })

  assert.deepEqual(reconciled.context.selectedCounterpartyPackIds, [])
  assert.equal(reconciled.context.selectedFinderOutreachDraftId, '')
  assert.deepEqual(reconciled.effect.selectedPackIdsRemoved, ['pack-A'])
  assert.equal(reconciled.effect.clearedSelectedDraftId, 'draft-A')
  assert.equal(reconciled.effect.changed, true)
})

test('selected outreach draft selection auto-attaches matching eligible pack', () => {
  const pack = makePack({ id: 'pack-A', sourceId: 'finder:job:a' })
  const context = makeSession([])

  const reconciled = reconcileSessionContextWithFinderOutreachDraftSelection({
    context,
    availablePacks: [pack],
    draft: makeDraft({
      id: 'draft-A',
      sourceId: 'finder:job:a',
      kind: 'job',
      status: 'follow_up'
    })
  })

  assert.deepEqual(reconciled.context.selectedCounterpartyPackIds, ['pack-A'])
  assert.equal(reconciled.context.selectedFinderOutreachDraftId, 'draft-A')
  assert.deepEqual(reconciled.effect.selectedPackIdsAdded, ['pack-A'])
  assert.equal(reconciled.effect.changed, true)
})

test('selected outreach draft status follow_up re-attaches matching pack', () => {
  const pack = makePack({ id: 'pack-A', sourceId: 'finder:job:a' })
  const context = makeSession([], {
    selectedFinderOutreachDraftId: 'draft-A'
  })

  const reconciled = reconcileSessionContextWithFinderOutreachDraftStatus({
    context,
    availablePacks: [pack],
    affectedDrafts: [
      makeDraft({
        id: 'draft-A',
        sourceId: 'finder:job:a',
        kind: 'job',
        status: 'follow_up'
      })
    ],
    nextStatus: 'follow_up'
  })

  assert.deepEqual(reconciled.context.selectedCounterpartyPackIds, ['pack-A'])
  assert.equal(reconciled.context.selectedFinderOutreachDraftId, 'draft-A')
  assert.deepEqual(reconciled.effect.selectedPackIdsAdded, ['pack-A'])
  assert.equal(reconciled.effect.clearedSelectedDraftId, null)
  assert.equal(reconciled.effect.changed, true)
})

test('selected outreach draft status closed clears stale draft link from session', () => {
  const pack = makePack({ id: 'pack-A', sourceId: 'finder:job:a' })
  const context = makeSession(['pack-A'], {
    selectedFinderOutreachDraftId: 'draft-A'
  })

  const reconciled = reconcileSessionContextWithFinderOutreachDraftStatus({
    context,
    availablePacks: [pack],
    affectedDrafts: [
      makeDraft({
        id: 'draft-A',
        sourceId: 'finder:job:a',
        kind: 'job',
        status: 'closed'
      })
    ],
    nextStatus: 'closed'
  })

  assert.deepEqual(reconciled.context.selectedCounterpartyPackIds, ['pack-A'])
  assert.equal(reconciled.context.selectedFinderOutreachDraftId, '')
  assert.equal(reconciled.effect.clearedSelectedDraftId, 'draft-A')
  assert.equal(reconciled.effect.changed, true)
})

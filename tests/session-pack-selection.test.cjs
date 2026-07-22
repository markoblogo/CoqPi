const assert = require('node:assert/strict')
const test = require('node:test')

const {
  formatCounterpartyPackSessionEligibility,
  getCounterpartyPackSessionEligibility,
  getSessionContextWithCounterpartyPacks,
  getSessionSelectedCounterpartyPackIds
} = require('../dist-electron/shared/session-pack-selection.js')

const makeSession = (selectedCounterpartyPackIds = []) => ({
  company: 'Acme',
  role: 'Founder',
  context: 'Interview',
  goal: 'Keep context scoped',
  notes: '',
  selectedCounterpartyPackIds
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

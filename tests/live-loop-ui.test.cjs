const assert = require('node:assert/strict')
const test = require('node:test')

const {
  AUTO_ANALYSIS_DEBOUNCE_MS,
  buildAutoAnalysisSchedule,
  decideAutoAnalysis,
  getAssistantStatusLabel
} = require('../dist-electron/shared/live-loop.js')

const makeUtterance = (overrides) => ({
  id: 'u-1',
  speaker: 'other',
  text: 'I have experience with product management.',
  isFinal: true,
  timestampStart: new Date().toISOString(),
  timestampEnd: new Date().toISOString(),
  source: 'mock',
  language: 'en',
  ...overrides
})

const analysisText = 'I have experience with product management and leadership.'

test('auto analyze fingerprint includes selected counterparty pack ids', () => {
  const latestFinal = makeUtterance({ id: 'u-4' })
  const withSelection = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-B', 'pack-A', 'pack-A']
  })

  const withoutSelection = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: []
  })

  assert.equal(withSelection.shouldRun, true)
  assert.equal(withSelection.reason, 'schedule')
  assert.equal(withSelection.fingerprint.includes('::packs:pack-A,pack-B'), true)
  assert.equal(withoutSelection.shouldRun, true)
  assert.equal(withoutSelection.fingerprint.includes('::packs:'), true)
  assert.equal(withSelection.fingerprint, 'u-4::other::I have experience with product management and leadership.::packs:pack-A,pack-B')
  assert.equal(withoutSelection.fingerprint, 'u-4::other::I have experience with product management and leadership.::packs:')
})

test('auto analyze re-schedules when selected pack set changes while transcript is same', () => {
  const latestFinal = makeUtterance({ id: 'u-5' })
  const withPackA = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-A']
  })
  assert.equal(withPackA.shouldRun, true)

  const withPackB = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: withPackA.fingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(withPackB.shouldRun, true)
  assert.equal(withPackB.reason, 'schedule')
  assert.equal(withPackB.fingerprint.includes('::packs:pack-B'), true)
})

test('buildAutoAnalysisSchedule extends delay by remaining cooldown window', () => {
  const latestFinal = makeUtterance({ id: 'u-6' })
  const now = Date.now()
  const base = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: now + 800,
    nowMs: now,
    selectedCounterpartyPackIds: ['pack-A']
  })

  assert.equal(base.shouldRun, true)
  assert.equal(base.delayMs, AUTO_ANALYSIS_DEBOUNCE_MS + 800)

  const delayed = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: now + 800,
    nowMs: now + 500,
    selectedCounterpartyPackIds: ['pack-B']
  })
  assert.equal(delayed.shouldRun, true)
  assert.equal(delayed.delayMs, AUTO_ANALYSIS_DEBOUNCE_MS + 300)
  assert.equal(
    delayed.fingerprint.includes('::packs:pack-B'),
    true
  )
  assert.notEqual(base.fingerprint, delayed.fingerprint)
})

test('selected/unselected change still reschedules during error state', () => {
  const latestFinal = makeUtterance({ id: 'u-7' })
  const failedPackPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'error',
    analysisCooldownUntil: Date.now(),
    selectedCounterpartyPackIds: ['pack-A']
  })

  assert.equal(failedPackPlan.shouldRun, true)
  assert.equal(failedPackPlan.fingerprint.includes('::packs:pack-A'), true)

  const failedRetry = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: failedPackPlan.fingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'error',
    analysisCooldownUntil: Date.now(),
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(failedRetry.shouldRun, true)
  assert.equal(failedRetry.fingerprint.includes('::packs:pack-B'), true)
})

test('auto analyze dedupe does not rerun on repeated other final utterance', () => {
  const latestFinal = makeUtterance({ id: 'u-1' })
  const first = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(first.shouldRun, true)
  assert.equal(first.reason, 'schedule')
  assert.equal(typeof first.fingerprint, 'string')

  const repeated = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: first.fingerprint ?? null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(repeated.shouldRun, false)
  assert.equal(repeated.reason, 'already-analyzed')
})

test('auto analyze ignores busy assistant and avoids duplicate scheduling', () => {
  const latestFinal = makeUtterance({ id: 'u-2' })
  const busy = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'analyzing'
  })

  assert.equal(busy.shouldRun, false)
  assert.equal(busy.reason, 'assistant-busy')
  assert.equal(typeof busy.fingerprint, 'string')
})

test('auto analyze skips when same utterance is already scheduled before debounce', () => {
  const latestFinal = makeUtterance({ id: 'u-3' })
  const first = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(first.shouldRun, true)
  assert.equal(first.reason, 'schedule')

  const scheduled = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: first.fingerprint,
    assistantState: 'idle'
  })

  assert.equal(scheduled.shouldRun, false)
  assert.equal(scheduled.reason, 'already-scheduled')
  assert.equal(scheduled.fingerprint, first.fingerprint)
})

test('auto analyze no-final utterance does not schedule analysis', () => {
  const noDecision = decideAutoAnalysis({
    latestFinalUtterance: undefined,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(noDecision.shouldRun, false)
  assert.equal(noDecision.reason, 'no-final')
  assert.equal(noDecision.fingerprint, null)
})

test('auto analyze maps timeout and budget statuses for UI chain', () => {
  const waiting = getAssistantStatusLabel(
    'idle',
    'current-id',
    'current-id',
    null
  )
  assert.equal(waiting.label, 'Waiting')

  const timeout = getAssistantStatusLabel(
    'error',
    'prev-id',
    'prev-id',
    'provider_timeout'
  )
  assert.equal(timeout.label, 'Timeout')
  assert.equal(timeout.classNameSuffix, 'timeout')

  const budget = getAssistantStatusLabel(
    'error',
    'prev-id',
    'prev-id',
    'analysis_budget_exhausted'
  )
  assert.equal(budget.label, 'Budget exhausted')
  assert.equal(budget.classNameSuffix, 'budget-exhausted')
})

test('auto analyze maps stale/ready/error statuses for UI chain', () => {
  const stale = getAssistantStatusLabel('done', 'old-id', 'new-id', null)
  assert.equal(stale.label, 'Stale')
  assert.equal(stale.classNameSuffix, 'stale')

  const ready = getAssistantStatusLabel('done', 'same-id', 'same-id', null)
  assert.equal(ready.label, 'Ready')
  assert.equal(ready.classNameSuffix, 'ready')

  const genericError = getAssistantStatusLabel(
    'error',
    'same-id',
    'same-id',
    'provider_error'
  )
  assert.equal(genericError.label, 'Error')
  assert.equal(genericError.classNameSuffix, 'error')
})

test('auto-analysis debounce constant stays as expected', () => {
  assert.equal(AUTO_ANALYSIS_DEBOUNCE_MS, 900)
})

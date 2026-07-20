const assert = require('node:assert/strict')
const test = require('node:test')

const {
  AUTO_ANALYSIS_DEBOUNCE_MS,
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

test('auto-analysis debounce constant stays as expected', () => {
  assert.equal(AUTO_ANALYSIS_DEBOUNCE_MS, 900)
})

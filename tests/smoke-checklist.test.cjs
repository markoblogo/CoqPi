const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSmokeChecklistSummary,
  smokeChecklistSteps
} = require('../dist-electron/shared/smoke-checklist.js')

const makeReadiness = (overrides = {}) => ({
  apiKeyAvailable: false,
  mockModeEnabled: false,
  transcriptCount: 0,
  autoWindowChars: 0,
  assistantLabel: 'Waiting',
  assistantFreshness: 'waiting',
  selectedPackCount: 0,
  realtimeReady: false,
  ...overrides
})

test('smoke checklist exposes stable live-smoke steps', () => {
  assert.deepEqual(
    smokeChecklistSteps.map((step) => step.id),
    [
      'api_key',
      'mock_line',
      'auto_window',
      'assistant_answer',
      'context_pack',
      'live_mic'
    ]
  )

  assert.equal(
    smokeChecklistSteps.every(
      (step) => step.title && step.action && step.expected
    ),
    true
  )
})

test('smoke checklist starts with key setup and readiness labels', () => {
  const summary = buildSmokeChecklistSummary(makeReadiness())
  const byId = Object.fromEntries(summary.items.map((item) => [item.id, item]))

  assert.equal(summary.progressLabel, '0/6')
  assert.equal(summary.activeStepId, 'api_key')
  assert.equal(byId.api_key.status, 'waiting')
  assert.equal(byId.api_key.readiness, 'needs API key')
  assert.equal(byId.mock_line.readiness, 'enable mock mode')
})

test('smoke checklist tracks done and blocked marks over auto readiness', () => {
  const summary = buildSmokeChecklistSummary(
    makeReadiness({
      apiKeyAvailable: true,
      mockModeEnabled: true,
      transcriptCount: 1,
      autoWindowChars: 74,
      assistantLabel: 'Ready',
      assistantFreshness: 'fresh',
      selectedPackCount: 1,
      realtimeReady: true
    }),
    {
      api_key: 'done',
      mock_line: 'done',
      live_mic: 'blocked'
    }
  )
  const byId = Object.fromEntries(summary.items.map((item) => [item.id, item]))

  assert.equal(summary.progressLabel, '2/6')
  assert.equal(summary.activeStepId, 'auto_window')
  assert.equal(byId.api_key.status, 'done')
  assert.equal(byId.auto_window.status, 'ready')
  assert.equal(byId.assistant_answer.readiness, 'Ready / fresh')
  assert.equal(byId.context_pack.readiness, '1 selected')
  assert.equal(byId.live_mic.status, 'blocked')
})

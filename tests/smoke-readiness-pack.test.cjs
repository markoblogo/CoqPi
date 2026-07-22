const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSmokeReadinessPack
} = require('../dist-electron/shared/smoke-readiness-pack.js')

const makeInput = (overrides = {}) => ({
  apiKeyAvailable: false,
  selectedPackCount: 0,
  selectedPackLabel: 'No pack selected',
  selectedPackQualityLevel: 'none',
  weakFieldCount: 3,
  mockModeEnabled: false,
  transcriptCount: 0,
  autoWindowChars: 0,
  assistantFreshness: 'waiting',
  realtimeReady: false,
  ...overrides
})

test('smoke readiness pack blocks when setup or context is missing', () => {
  const pack = buildSmokeReadinessPack(makeInput())
  const byId = Object.fromEntries(pack.gates.map((gate) => [gate.id, gate]))

  assert.equal(pack.status, 'needs_prep')
  assert.equal(pack.headline, 'Prep needs attention before smoke')
  assert.equal(byId.setup.status, 'waiting')
  assert.equal(byId.context.status, 'blocked')
  assert.equal(pack.scenario[0].status, 'waiting')
})

test('smoke readiness pack becomes ready for mock after setup and context', () => {
  const pack = buildSmokeReadinessPack(
    makeInput({
      apiKeyAvailable: true,
      selectedPackCount: 1,
      selectedPackLabel: 'Northfield Labs',
      selectedPackQualityLevel: 'strong',
      weakFieldCount: 0
    })
  )

  assert.equal(pack.status, 'ready_for_mock')
  assert.equal(pack.nextAction, 'Run mock transcript, then Analyze 2m.')
  assert.equal(pack.scenario[0].status, 'ready')
  assert.equal(pack.scenario[1].status, 'waiting')
})

test('smoke readiness pack records the minimal path before real mic smoke', () => {
  const pack = buildSmokeReadinessPack(
    makeInput({
      apiKeyAvailable: true,
      selectedPackCount: 1,
      selectedPackLabel: 'GreenBridge Accelerator',
      selectedPackQualityLevel: 'usable',
      weakFieldCount: 0,
      mockModeEnabled: true,
      transcriptCount: 2,
      autoWindowChars: 140,
      assistantFreshness: 'fresh',
      realtimeReady: true
    })
  )
  const byId = Object.fromEntries(pack.gates.map((gate) => [gate.id, gate]))

  assert.equal(pack.status, 'ready_for_real_mic')
  assert.equal(pack.headline, 'Ready for a short real mic smoke')
  assert.equal(byId.assistant.status, 'ready')
  assert.equal(byId.real_mic.status, 'ready')
  assert.deepEqual(
    pack.scenario.map((step) => step.id),
    ['select_pack', 'mock_transcript', 'assistant_answer', 'real_mic']
  )
})

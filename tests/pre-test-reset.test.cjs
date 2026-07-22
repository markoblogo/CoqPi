const assert = require('node:assert/strict')
const test = require('node:test')

const {
  preTestResetPlan
} = require('../dist-electron/shared/pre-test-reset.js')

test('pre-test reset clears volatile test state only', () => {
  assert.equal(preTestResetPlan.label, 'Reset for test')
  assert.deepEqual(preTestResetPlan.clears, [
    'transcript',
    'assistant result',
    'assistant errors',
    'mock playback',
    'smoke checklist marks',
    'cost notice',
    'session counters',
    'realtime timer'
  ])
})

test('pre-test reset preserves user and session context', () => {
  assert.equal(preTestResetPlan.preserves.includes('profile context'), true)
  assert.equal(preTestResetPlan.preserves.includes('session context'), true)
  assert.equal(
    preTestResetPlan.preserves.includes('selected counterparty packs'),
    true
  )
  assert.equal(preTestResetPlan.preserves.includes('OpenAI key'), true)
  assert.equal(preTestResetPlan.preserves.includes('audio device'), true)
})

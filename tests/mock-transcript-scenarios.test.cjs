const assert = require('node:assert/strict')
const test = require('node:test')

const {
  getMockTranscriptScenario,
  getMockTranscriptScenarioLines,
  mockTranscriptScenarios
} = require('../dist-electron/shared/mock-transcript-scenarios.js')

test('mock transcript scenarios expose stable pre-smoke scenario set', () => {
  assert.deepEqual(
    mockTranscriptScenarios.map((scenario) => scenario.id),
    [
      'default',
      'job_interview',
      'investor_call',
      'partner_call',
      'french_interview',
      'mixed_en_fr'
    ]
  )

  for (const scenario of mockTranscriptScenarios) {
    assert.equal(typeof scenario.label, 'string')
    assert.equal(scenario.label.length > 0, true)
    assert.equal(scenario.lines.length >= 5, true)
    assert.equal(
      scenario.lines.every(
        (line) =>
          line.speaker === 'other' &&
          line.text.trim().length > 10 &&
          (line.language === 'en' || line.language === 'fr')
      ),
      true
    )
  }
})

test('mock transcript scenario language filtering supports Auto EN and FR paths', () => {
  const mixedAuto = getMockTranscriptScenarioLines('Auto', 'mixed_en_fr')
  const mixedEnglish = getMockTranscriptScenarioLines('English', 'mixed_en_fr')
  const mixedFrench = getMockTranscriptScenarioLines('French', 'mixed_en_fr')

  assert.equal(mixedAuto.some((line) => line.language === 'en'), true)
  assert.equal(mixedAuto.some((line) => line.language === 'fr'), true)
  assert.equal(mixedEnglish.every((line) => line.language === 'en'), true)
  assert.equal(mixedFrench.every((line) => line.language === 'fr'), true)
  assert.equal(mixedEnglish.length > 0, true)
  assert.equal(mixedFrench.length > 0, true)
})

test('unknown mock transcript scenario falls back to default', () => {
  const scenario = getMockTranscriptScenario('missing')

  assert.equal(scenario.id, 'default')
})

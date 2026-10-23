const test = require('node:test')
const assert = require('node:assert/strict')
const {BRIEF_ANALYSIS_SCHEMA, expandBriefAssistantOutput, readBriefProgress} = require('../dist-electron/shared/brief-assistant-output.js')

test('partial text remains readable across JSON and escaped string boundaries', () => {
  const complete = JSON.stringify({meaningRu:'Вопрос о "проекте"', answer:'Je travaille avec une équipe.'})
  for (let i = 0; i <= complete.length; i++) {
    const partial = readBriefProgress(complete.slice(0, i))
    assert.equal(typeof partial.meaningRu, 'string')
    assert.equal(typeof partial.answer, 'string')
  }
  assert.deepEqual(readBriefProgress(complete), JSON.parse(complete))
  assert.deepEqual(readBriefProgress('{"meaningRu":"Вопрос","answer":"Bonjour'), {meaningRu:'Вопрос',answer:'Bonjour'})
  assert.deepEqual(readBriefProgress('invalid'), {meaningRu:'',answer:''})
})

test('brief model output requests only displayed text and expands to existing contract', () => {
  assert.deepEqual(BRIEF_ANALYSIS_SCHEMA.required, ['meaningRu', 'answer'])
  const output = JSON.parse(expandBriefAssistantOutput(JSON.stringify({meaningRu:'Вопрос',answer:'Bonjour.'})))
  assert.equal(output.meaningRu, 'Вопрос')
  assert.equal(output.suggestedAnswers[0].text, 'Bonjour.')
  assert.equal(output.suggestedAnswers.length, 1)
  assert.deepEqual(output.keywordsToRemember, [])
})

test('malformed or empty brief output fails closed', () => {
  for (const value of ['{', 'null', '{}', '{"meaningRu":"Q","answer":5}', '{"meaningRu":"Q","answer":" "}']) {
    assert.throws(() => expandBriefAssistantOutput(value))
  }
})

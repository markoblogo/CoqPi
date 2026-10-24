const test = require('node:test')
const assert = require('node:assert/strict')
const { interviewSafetyScenarios } = require('../dist-electron/shared/interview-safety-scenarios.js')
const { getInterviewAnswerPattern } = require('../dist-electron/shared/interview-answer-patterns.js')
const { groundedAnswerPolicy, interviewAssistantSystemPrompt, simpleAssistantSystemPrompt } = require('../dist-electron/backend/prompts/interview-assistant-prompt.js')
const { thinkingPhrase } = require('../dist-electron/shared/thinking-phrase.js')
const { getInterviewSafetyReply } = require('../dist-electron/shared/interview-safety-gate.js')

test('risky bilingual questions use local clarification, never first-person fabricated evidence', () => {
  for (const scenario of interviewSafetyScenarios.filter(s => !/^(technical|switch|introduction|motivation|questions)-/.test(s.id))) {
    const reply = getInterviewSafetyReply(scenario.question, scenario.language)
    assert.ok(reply, scenario.id)
    assert.ok(reply.answer.length > 10)
  }
  assert.equal(getInterviewSafetyReply('How would you prioritize bugs?', 'en'), null)
  assert.equal(getInterviewSafetyReply('Can you start Monday?', 'uk'), null)
})

test('delay phrases rotate in the current language without personal claims', () => {
  for (const language of ['en', 'fr']) {
    assert.equal(new Set([0, 1, 2].map(i => thinkingPhrase(language, i))).size, 3)
    assert.equal(thinkingPhrase(language, 0), thinkingPhrase(language, 3))
  }
  assert.equal(thinkingPhrase('uk', 0), '')
})

test('both assistant routes carry the same owner-fact and commitment boundary', () => {
  for (const prompt of [interviewAssistantSystemPrompt, simpleAssistantSystemPrompt]) {
    assert.ok(prompt.includes(groundedAnswerPolicy))
    assert.match(prompt, /Missing information means unknown/)
    assert.match(prompt, /Never accept an offer/)
    assert.match(prompt, /interviewer assertion/)
  }
})

test('30 bilingual fixtures cover personal claims, commitments and latest constraints', () => {
  assert.equal(interviewSafetyScenarios.length, 30)
  assert.equal(new Set(interviewSafetyScenarios.map(s => s.id)).size, 30)
  for (const language of ['en', 'fr']) assert.equal(interviewSafetyScenarios.filter(s => s.language === language).length, 15)
  assert.ok(interviewSafetyScenarios.every(s => s.question && s.expectation))
})

test('answer structures are guidance, not cached personal claims or override instructions', () => {
  assert.match(getInterviewAnswerPattern('Présentez-vous'), /verified/)
  assert.match(getInterviewAnswerPattern('Tell me about a time you failed'), /Never invent/)
  assert.match(getInterviewAnswerPattern('Tell me about yourself, but do not mention your age'), /constraints always take precedence/)
  assert.equal(getInterviewAnswerPattern('What is 2 + 2?'), '')
})

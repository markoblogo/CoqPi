const assert = require('node:assert/strict')
const test = require('node:test')
const { detectConversationLanguage } = require('../dist-electron/shared/conversation-language.js')
const { getAutoAnalysisUtteranceEligibility } = require('../dist-electron/shared/live-loop.js')
const { createMeetingTranscriptionSession, applyMeetingTranscriptionRealtimeEvent } = require('../dist-electron/shared/meeting-transcription.js')

test('language switches FR -> EN -> RU -> UK -> FR within one conversation', () => {
  let language = 'fr'
  for (const [text, expected] of [
    ['Bonjour, pouvez vous parler de votre parcours ?', 'fr'],
    ['Could you tell us about your experience?', 'en'],
    ['Расскажите о вашем опыте работы в компании.', 'ru'],
    ['Які ваші основні професійні досягнення?', 'uk'],
    ['Comment pouvez vous nous aider ?', 'fr'],
    ['OK', 'fr']
  ]) {
    language = detectConversationLanguage(text, language)
    assert.equal(language, expected)
    assert.equal(getAutoAnalysisUtteranceEligibility({text, language}, language).eligible, text !== 'OK')
  }
})

test('a temporary STT error does not discard subsequent final segments', () => {
  const session = { ...createMeetingTranscriptionSession({id:'resume', language:'ru', inputLabel:'mic', now:new Date().toISOString()}), status: 'error' }
  const next = applyMeetingTranscriptionRealtimeEvent({session, event:{type:'conversation.item.input_audio_transcription.completed', item_id:'later', transcript:'Продолжаем разговор.'}, now:new Date().toISOString(), createSegmentId:()=> 'later'})
  assert.equal(next.session.segments[0].text, 'Продолжаем разговор.')
})

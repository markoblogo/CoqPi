const { test } = require('node:test')
const assert = require('node:assert/strict')
const { virtualQuestions, virtualRequest } = require('../dist-electron/shared/virtual-interview.js')
const { VirtualInterviewSession } = require('../dist-electron/shared/virtual-interview-session.js')

const tick = () => new Promise(resolve => setImmediate(resolve))
const fixture = (overrides = {}) => {
  let sequence = 0, time = Date.parse('2026-10-24T12:00:00Z')
  const saved = [], requests = [], cancelled = [], order = []
  const deps = {
    id: () => `id-${++sequence}`, now: () => time += 10, changed() {},
    save: async session => { saved.push(structuredClone(session)) }, flush: async () => order.push('flush'),
    openAudio: async () => order.push('audio-open'), closeAudio: async () => order.push('audio-close'),
    speak: async () => order.push('speech'), cancelSpeech() {},
    listen: async () => order.push('listen'), stopListening: async () => order.push('listen-stop'),
    analyze: async request => { requests.push(request); return { ok: true, data: { suggestedAnswers: [{ text: 'Proposed approach' }], meaningRu: '', model: 'fixture', latencyMs: 20 } } },
    cancel: id => cancelled.push(id), ...overrides
  }
  return { interview: new VirtualInterviewSession(deps), saved, requests, cancelled, order }
}

for (const language of ['en', 'fr']) test(`${language}: five questions, ME answers, incremental journal and timing`, async () => {
  const { interview, saved, requests, order } = fixture()
  await interview.start(language)
  for (let index = 0; index < 5; index++) {
    assert.equal(interview.phase, 'answer')
    interview.receive({ type: 'input_audio_buffer.speech_stopped' })
    interview.receive({ type: 'conversation.item.input_audio_transcription.delta', item_id: `a${index}`, delta: 'My ' })
    interview.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: `a${index}`, transcript: 'My proposed approach' })
    interview.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: `a${index}`, transcript: 'duplicate' })
    await tick()
    assert.equal(saved.at(-1).segments.filter(item => item.speaker === 'ME').length, index + 1)
    assert.equal(requests.length, index + 1, 'ME answers never trigger hints')
    await interview.next()
  }
  assert.equal(interview.phase, 'stopped')
  assert.equal(saved.at(-1).segments.length, 10)
  assert.equal(saved.at(-1).practice.turns.length, 5)
  assert.ok(saved.at(-1).practice.turns.every(turn => turn.sttFinalMs >= 0 && turn.questionAudioEndedAt))
  assert.ok(saved.at(-1).practice.turns.every(turn => Date.parse(turn.answerEndedAt) >= Date.parse(turn.answerStartedAt) && Date.parse(turn.answerStartedAt) >= Date.parse(turn.questionAudioEndedAt)))
  assert.ok(order.indexOf('speech') < order.indexOf('listen'))
  assert.equal(order.at(-1), 'flush')
})

test('Stop cancels pending hint and TTS; stale progress and completion cannot reappear', async () => {
  let resolveHint, resolveSpeech
  const { interview, cancelled, saved } = fixture({ analyze: () => new Promise(resolve => { resolveHint = resolve }), speak: () => new Promise(resolve => { resolveSpeech = resolve }), cancelSpeech: () => resolveSpeech?.() })
  const starting = interview.start('en')
  await tick()
  assert.equal(interview.phase, 'question')
  await interview.stop()
  await starting
  resolveHint({ ok: true, data: { suggestedAnswers: [{ text: 'STALE' }] } })
  interview.progress({ streamId: cancelled[0], answer: 'STALE', meaningRu: '' })
  await tick()
  assert.equal(interview.hint, '')
  assert.equal(saved.at(-1).assistantEvents.length, 0)
  assert.equal(interview.phase, 'stopped')
})

test('assistant failure leaves audio and transcript recording operational; typed fallback is labeled', async () => {
  const { interview, saved } = fixture({ analyze: async () => ({ ok: false, error: { message: 'offline' } }) })
  await interview.start('fr')
  await tick()
  interview.typed('Une réponse')
  await interview.stop()
  const last = saved.at(-1)
  assert.equal(last.practice.turns[0].input, 'typed')
  assert.equal(last.practice.turns[0].sttFinalMs, undefined)
  assert.equal(last.segments.at(-1).speaker, 'ME (typed)')
  assert.equal(last.segments.at(-1).source, 'unknown')
})

test('Stop while opening microphone closes late-acquired audio without starting questions', async () => {
  let release
  const { interview, order } = fixture({ openAudio: () => new Promise(resolve => { release = resolve }) })
  const opening = interview.start('en'); await tick()
  const stopped = interview.stop(); release()
  await Promise.all([opening, stopped])
  assert.equal(interview.phase, 'stopped')
  assert.ok(order.includes('audio-close'))
  assert.ok(!order.includes('speech'))
})

test('unfinished STT text survives Stop, no fabricated final segment, restart is a new session', async () => {
  const { interview, saved } = fixture()
  await interview.start('en')
  const firstId = interview.session.id
  interview.receive({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'partial', delta: 'Unfinished response' })
  await interview.stop()
  assert.equal(Object.values(saved.at(-1).interim)[0].text, 'Unfinished response')
  assert.equal(saved.at(-1).segments.length, 1)
  await interview.start('fr')
  assert.notEqual(interview.session.id, firstId)
  assert.equal(interview.session.language, 'fr')
  await interview.stop()
})

test('failed final save can be retried and audio-close failure does not discard text', async () => {
  let fail = false
  const { interview, saved } = fixture({
    closeAudio: async () => { throw new Error('synthetic backup failure') },
    save: async session => { if (fail) throw new Error('disk full'); saved.push(structuredClone(session)) }
  })
  await interview.start('en')
  interview.typed('Preserve this response')
  await tick()
  fail = true
  await assert.rejects(interview.stop(), /disk full/)
  assert.equal(interview.phase, 'stopping')
  fail = false
  await interview.stop()
  assert.equal(interview.phase, 'stopped')
  assert.match(saved.at(-1).segments.at(-1).text, /Preserve/)
  assert.match(interview.error, /audio backup error/)
})

test('late STT after Stop and TTS-time input cannot become learner segments', async () => {
  let release
  const { interview } = fixture({ speak: () => new Promise(resolve => { release = resolve }), cancelSpeech: () => release?.() })
  const starting = interview.start('en'); await tick()
  const event = { type: 'conversation.item.input_audio_transcription.completed', item_id: 'echo', transcript: 'Interviewer echo' }
  interview.receive(event)
  await interview.stop(); await starting
  interview.receive(event)
  assert.equal(interview.session.segments.length, 1)
  assert.equal(interview.session.segments[0].speaker, 'VIRTUAL INTERVIEWER')
})

test('EN/FR rehearsal uses the actual brief request contract with isolated fictional context', () => {
  for (const language of ['en', 'fr']) {
    assert.equal(virtualQuestions[language].length, 5)
    for (const question of virtualQuestions[language]) {
      const request = virtualRequest(language, question, 'test-stream')
      assert.equal(request.latestIncomingUtterance, question)
      assert.equal(request.responseStyle, 'brief')
      assert.equal(request.includeProfileContext, false)
      assert.deepEqual(request.selectedCounterpartyPackIds, [])
      assert.deepEqual(request.sessionContext.selectedCounterpartyPackIds, [])
      assert.equal(request.sessionContext.selectedFinderOutreachDraftId, '')
      assert.match(request.sessionContext.context, /FICTIONAL/)
      assert.equal(request.answerLanguage, language)
    }
  }
})

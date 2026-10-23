const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')

const originalModuleLoad = Module._load

Module._load = (request, parent, isMain) => {
  if (request === 'electron') {
    return {
      app: {
        getName: () => 'CoqPi',
        getPath: () => path.join(os.tmpdir(), 'coqpi-realtime-config')
      }
    }
  }

  return originalModuleLoad(request, parent, isMain)
}

const { buildRealtimeTranscriptionSessionConfigForTests } = require(
  '../dist-electron/backend/services/realtime-transcription-service.js'
)

test.after(() => {
  Module._load = originalModuleLoad
})

test('realtime transcription config passes explicit meeting languages', () => {
  for (const language of ['uk', 'ru', 'en', 'fr']) {
    const config = buildRealtimeTranscriptionSessionConfigForTests(language)
    assert.equal(config.audio.input.transcription.language, language)
    assert.match(config.audio.input.transcription.prompt, /Transcribe/)
  }
})

test('realtime auto preserves all four languages and language switches', () => {
  const config = buildRealtimeTranscriptionSessionConfigForTests('auto')

  assert.equal(config.audio.input.transcription.language, undefined)
  assert.match(config.audio.input.transcription.prompt, /English, French, Russian and Ukrainian/)
  assert.match(config.audio.input.transcription.prompt, /independently for each spoken turn/)
  assert.match(config.audio.input.transcription.prompt, /French speech must remain French/)
  assert.match(config.audio.input.transcription.prompt, /Never translate speech into Russian/)
  assert.match(config.audio.input.transcription.prompt, /numbers, dates, names, negations/)
})

test('conversation uses 500ms silence without lowering quality or restricting language switches', () => {
  const recording = buildRealtimeTranscriptionSessionConfigForTests('auto')
  const live = buildRealtimeTranscriptionSessionConfigForTests('auto', 'conversation')
  assert.equal(recording.audio.input.turn_detection.silence_duration_ms, 800)
  assert.equal(live.audio.input.turn_detection.silence_duration_ms, 500)
  assert.equal(live.audio.input.turn_detection.prefix_padding_ms, 300)
  assert.equal(live.audio.input.turn_detection.threshold, 0.5)
  assert.deepEqual(live.audio.input.transcription, recording.audio.input.transcription)
  assert.equal(live.audio.input.transcription.language, undefined)
})

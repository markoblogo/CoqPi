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

test('realtime transcription config keeps live auto as EN/FR only prompt without explicit language', () => {
  const config = buildRealtimeTranscriptionSessionConfigForTests('auto')

  assert.equal(config.audio.input.transcription.language, undefined)
  assert.match(config.audio.input.transcription.prompt, /English or French/)
})

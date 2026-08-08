const assert = require('node:assert/strict')
const test = require('node:test')

const {
  SYSTEM_DEFAULT_AUDIO_INPUT_ID,
  buildAudioInputConstraints,
  resolveAudioInputSelection
} = require('../dist-electron/shared/audio-input-config.js')

test('system default is the first-class audio input selection', () => {
  assert.equal(SYSTEM_DEFAULT_AUDIO_INPUT_ID, '')
  assert.deepEqual(resolveAudioInputSelection('', ['mic-1', 'mic-2']), '')
  assert.deepEqual(buildAudioInputConstraints(''), {})
})

test('manual input selection remains available when the device is present', () => {
  assert.equal(
    resolveAudioInputSelection('mic-2', ['mic-1', 'mic-2']),
    'mic-2'
  )
  assert.deepEqual(buildAudioInputConstraints('mic-2'), {
    deviceId: { exact: 'mic-2' }
  })
})

test('stale manual selection falls back to system default', () => {
  assert.equal(resolveAudioInputSelection('missing', ['mic-1']), '')
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const fixture = (api = {}) => {
  const processors = [], calls = [], errors = []
  const node = () => ({ connect() {}, disconnect() {} })
  const stream = { getTracks: () => [{ stop: () => calls.push('track-stop') }] }
  const context = { exports: {}, Error, ArrayBuffer, DataView, window: { coqpi: { meetingTranscription: {
    backupStart: async () => { calls.push('start'); return { manifestId: 'test' } },
    backupChunk: async () => { calls.push('chunk') },
    backupStop: async () => { calls.push('stop'); return { manifestId: 'test' } }, ...api
  } } }, AudioContext: class {
    sampleRate = 16000; destination = {}
    async resume() {} async close() { calls.push('context-close') }
    createMediaStreamSource() { return node() }
    createScriptProcessor() { const n = node(); processors.push(n); return n }
    createGain() { return { ...node(), gain: { value: 0 } } }
  } }
  const code = ts.transpileModule(fs.readFileSync('src/renderer/raw-audio-backup-recorder.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, context)
  return { recorder: new context.exports.RawAudioBackupRecorder(message => errors.push(message)), calls, errors, processors, stream }
}

test('Stop waits for pending backup Start, closes tracks and finalizes once', async () => {
  let release
  const f = fixture({ backupStart: () => new Promise(resolve => { release = resolve }) })
  const start = f.recorder.start({ sessionId: 'test', stream: f.stream, now: new Date().toISOString() })
  while (!release) await new Promise(resolve => setImmediate(resolve))
  const stop = f.recorder.stop(new Date().toISOString())
  release({ manifestId: 'test' })
  await start
  await stop
  assert.deepEqual(f.calls, ['track-stop', 'context-close', 'stop'])
  assert.equal(await f.recorder.stop(new Date().toISOString()), null)
})

test('write errors remain visible and Stop still closes the capture', async () => {
  const f = fixture({ backupChunk: async () => { throw new Error('disk full') } })
  await f.recorder.start({ sessionId: 'test', stream: f.stream, now: new Date().toISOString() })
  f.processors[0].onaudioprocess({ inputBuffer: { length: 2, numberOfChannels: 1, getChannelData: () => [0.1, 0.2] } })
  await assert.rejects(f.recorder.stop(new Date().toISOString()), /disk full/)
  assert.deepEqual(f.errors, ['disk full'])
  assert.ok(f.calls.includes('track-stop'))
  assert.ok(f.calls.includes('stop'))
})

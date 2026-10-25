const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { EventEmitter } = require('node:events')

test('window close acknowledges only after all recorder callbacks finish, including a failed writer', async () => {
  const ipc = new EventEmitter(), sent = []
  ipc.send = (...args) => sent.push(args)
  let api, release
  const original = Module._load
  Module._load = (name, ...args) => name === 'electron' ? { ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_key, value) => { api = value } } } : original(name, ...args)
  try {
    require('../dist-electron/main/preload.js')
    api.meetingTranscription.onShutdown(async () => {})
    api.meetingTranscription.onShutdown(() => new Promise(resolve => { release = resolve }))
    api.meetingTranscription.onShutdown(async () => { throw new Error('disk full') })
    ipc.emit('coqpi:recording:flush-request')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(sent.length, 0)
    release()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(sent.length, 1)
    assert.equal(sent[0][0], 'coqpi:recording:flushed')
    assert.match(sent[0][1], /Unable to save/)
  } finally { Module._load = original }
})

/* global window, MediaStream, document */
const { _electron } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')

;(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-package-check-'))
  const env = { ...process.env, OPENAI_API_KEY: 'synthetic-unused', COQPI_ENV_FILE: path.join(directory, 'absent.env'), COQPI_DATA_DIR: directory, COQPI_SESSIONS_DIR: path.join(directory, 'sessions'), COQPI_PROFILE_DIR: path.join(directory, 'profile'), COQPI_PERSONAL_KNOWLEDGE_CORE_DIR: path.join(directory, 'knowledge'), COQPI_GOVERNANCE_DIR: path.join(directory, 'governance') }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await _electron.launch({ executablePath: process.env.COQPI_TEST_EXECUTABLE, cwd: directory, args: [`--user-data-dir=${path.join(directory, 'electron')}`], env, timeout: 60000 })
  try {
    await app.evaluate(({ app, BrowserWindow, ipcMain }) => {
      BrowserWindow.getAllWindows().forEach(w => { w.setAlwaysOnTop(false); w.hide() })
      assertVersion(app.getVersion())
      function assertVersion(version) { if (version !== '0.3.3') throw new Error(`Wrong version: ${version}`) }
      ipcMain.removeHandler('coqpi:realtime:create-transcription-answer')
      ipcMain.handle('coqpi:realtime:create-transcription-answer', () => ({ ok: true, data: { answerSdp: 'fixture' } }))
      global.fetch = () => { throw new Error('External network forbidden in package test') }
    })
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.locator('.call-focus').waitFor({ timeout: 60000 })
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => new MediaStream()
      window.AudioContext = class {
        sampleRate = 16000; destination = {}
        async resume() {} async close() {}
        createMediaStreamSource() { return { connect() {}, disconnect() {} } }
        createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} } }
        createScriptProcessor() { const p = { connect() {}, disconnect() {} }; window.__processor = p; return p }
      }
      window.RTCPeerConnection = class {
        iceGatheringState = 'complete'; connectionState = 'new'; localDescription = { sdp: 'fixture' }
        createDataChannel() { this.channel = new EventTarget(); this.channel.readyState = 'open'; this.channel.close = () => {}; window.__channel = this.channel; return this.channel }
        addTrack() {} async createOffer() { return { sdp: 'fixture' } } async setLocalDescription() {}
        async setRemoteDescription() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); this.channel.dispatchEvent(new Event('open')) }
        close() {} addEventListener() {} removeEventListener() {}
      }
    })
    await page.getByTitle('Meeting transcription', { exact: true }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.waitForFunction(() => Boolean(window.__channel && window.__processor))
    await page.evaluate(() => {
      window.__processor.onaudioprocess({ inputBuffer: { length: 3200, numberOfChannels: 1, getChannelData: () => new Float32Array(3200).fill(0.1) } })
      window.__channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'package-test', transcript: 'Synthetic recording survives window close.' }) }))
    })
    await page.waitForFunction(() => document.body.innerText.includes('Synthetic recording survives window close.'))
    const closing = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await closing
    const saved = JSON.parse(await fs.readFile(path.join(directory, 'sessions', 'meeting-transcription-current.json'), 'utf8'))
    assert.ok(saved.endedAt)
    assert.equal(saved.segments[0].text, 'Synthetic recording survives window close.')
    const backupDirectory = path.join(directory, 'sessions', 'audio-backups', createHash('sha256').update(saved.id).digest('hex'))
    const wav = await fs.readFile(path.join(backupDirectory, 'microphone.wav'))
    const manifest = JSON.parse(await fs.readFile(path.join(backupDirectory, 'manifest.json'), 'utf8'))
    assert.equal(wav.readUInt32LE(40), 6400)
    assert.equal(manifest.files[0].status, 'closed')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ version: '0.3.3', rendererLoaded: true, closePreservedTranscript: true, closeFinalizedAudioBytes: 6400, isolatedData: directory }))
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await app.close().catch(() => {})
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

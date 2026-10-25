const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { promisify } = require('node:util')
const run = promisify(require('node:child_process').execFile)
const { _electron } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
;(async () => {
  if (process.env.COQPI_ACCEPTANCE_PAID !== '1') throw new Error('Explicit paid authorization required')
  const repeatMode = process.env.COQPI_REPEAT_ACCEPTANCE === '1'
  const positiveMode = process.env.COQPI_REPEAT_POSITIVE === '1'
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-audio-review-paid-'))
  await fs.chmod(directory, 0o700)
  const secret = path.join(directory, 'electron/secrets/openai-key.bin')
  await fs.mkdir(path.dirname(secret), { recursive: true })
  await fs.copyFile(path.join(os.homedir(), 'Library/Application Support/CoqPi/secrets/openai-key.bin'), secret)
  let app, watchdog
  try {
    app = await _electron.launch({ executablePath: process.env.COQPI_ACCEPTANCE_EXECUTABLE || '/Applications/CoqPi.app/Contents/MacOS/CoqPi', args: [`--user-data-dir=${path.join(directory, 'electron')}`], cwd: directory,
      env: { PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(), COQPI_ENV_FILE: path.join(directory, 'absent.env'), COQPI_DATA_DIR: path.join(directory, 'data'), COQPI_PROFILE_DIR: path.join(directory, 'profile'), COQPI_SESSIONS_DIR: path.join(directory, 'sessions'), COQPI_GOVERNANCE_DIR: path.join(directory, 'governance'), COQPI_PERSONAL_KNOWLEDGE_CORE_DIR: path.join(directory, 'knowledge') }, timeout: 60000 })
    watchdog = setTimeout(() => app.process().kill('SIGTERM'), 180000)
    await app.evaluate((_electron, repeatMode) => {
      let calls = 0
      globalThis.__coqpiRepeatPaidStats = { paired: 0 }
      const original = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        if (String(url) !== 'https://api.openai.com/v1/chat/completions' || ++calls > (repeatMode ? 4 : 2)) throw new Error('Paid endpoint/call cap')
        const body = JSON.parse(options.body)
        if (body.messages[1].content.filter(item => item.type === 'input_audio').length === 2) globalThis.__coqpiRepeatPaidStats.paired++
        if (body.model !== 'gpt-audio' || body.max_completion_tokens > 1200 || body.messages[1].content[1].input_audio.data.length > 640000) throw new Error('Paid input/output cap')
        return original(url, options)
      }
    }, repeatMode)
    const report = []
    for (const [language, voice, originalText] of [['en', 'Samantha', 'I would test three priorities before the launch.'], ['fr', 'Thomas', 'Je proposerais trois priorités avant le lancement.']]) {
      if (positiveMode && language !== 'en') continue
      const text = positiveMode ? originalText.replace('three', 'tree') : originalText
      const aiff = path.join(directory, `${language}.aiff`), wav = path.join(directory, `${language}.wav`)
      await run('say', ['-v', voice, '-o', aiff, text], { timeout: 20000 })
      await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', aiff, wav], { timeout: 20000 })
      // afconvert may use extra WAV chunks; locate PCM rather than assuming offset 44.
      const bytes = await fs.readFile(wav)
      let pcm
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const size = bytes.readUInt32LE(offset + 4)
        if (bytes.toString('ascii', offset, offset + 4) === 'data') { pcm = bytes.subarray(offset + 8, offset + 8 + size); break }
        offset += 8 + size + size % 2
      }
      assert.ok(pcm && pcm.length > 32000 && pcm.length < 480000)
      let repeatPcm
      if (repeatMode) {
        const repeatAiff = path.join(directory, `${language}-repeat.aiff`), repeatWav = path.join(directory, `${language}-repeat.wav`)
        await run('say', ['-v', voice, '-o', repeatAiff, language === 'fr' ? 'Trois priorités.' : 'Three priorities.'], { timeout: 20000 })
        await run('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', repeatAiff, repeatWav], { timeout: 20000 })
        const bytes = await fs.readFile(repeatWav)
        for (let offset = 12; offset + 8 <= bytes.length;) {
          const size = bytes.readUInt32LE(offset + 4)
          if (bytes.toString('ascii', offset, offset + 4) === 'data') { repeatPcm = bytes.subarray(offset + 8, offset + 8 + size); break }
          offset += 8 + size + size % 2
        }
        assert.ok(repeatPcm?.length > 16000 && repeatPcm.length < 480000)
      }
      const result = await app.evaluate(async (_electron, payload) => {
        const root = payload.useBundle ? _electron.app.getAppPath() : payload.root
        const load = process.getBuiltinModule('node:module').createRequire(`${root}/package.json`)
        const recording = load(`${root}/dist-electron/backend/services/meeting-recording-backup-service.js`)
        const sessions = load(`${root}/dist-electron/backend/services/meeting-transcription-service.js`)
        const review = load(`${root}/dist-electron/backend/services/interview-audio-review.js`)
        const id = `synthetic-audio-review-${payload.language}`
        const startedAt = '2026-10-25T12:00:00.000Z'
        const audio = Buffer.from(payload.pcm, 'base64')
        const endedAt = new Date(Date.parse(startedAt) + audio.length / 32).toISOString()
        await recording.startMeetingAudioBackup({ sessionId: id, source: 'microphone', sampleRate: 16000, channelCount: 1, now: startedAt })
        await recording.appendMeetingAudioBackupChunk({ sessionId: id, source: 'microphone', pcm16: audio })
        await recording.stopMeetingAudioBackup({ sessionId: id, source: 'microphone', now: endedAt })
        await sessions.saveCurrentMeetingTranscriptionSession({ id, startedAt, endedAt, stoppedAt: endedAt, language: payload.language, status: 'stopped', mode: 'copilot', inputLabel: 'Synthetic speech', scenario: 'FICTIONAL virtual interview', interim: {}, segments: [{ id: 'a', speaker: 'ME', source: 'microphone', sourceItemId: 'turn-0:a', startTime: startedAt, text: payload.text, isFinal: true }], practice: { kind: 'virtual-interview', turns: [{ input: 'voice', question: 'Priorities?', requestedAt: startedAt, expectedAnswer: payload.text, answerStartedAt: startedAt, answerEndedAt: endedAt }] } })
        if (payload.repeatMode) {
          const fs = process.getBuiltinModule('node:fs/promises'), path = process.getBuiltinModule('node:path'), { createHash } = process.getBuiltinModule('node:crypto')
          const state = load(`${root}/dist-electron/backend/services/app-state.js`)
          const repeats = load(`${root}/dist-electron/backend/services/interview-repeat-service.js`)
          const clip = await review.loadInterviewAudioClip({ sessionId: id, turnIndex: 0 })
          const reviewDir = path.join(state.getAppInfo().sessionsDirectory, 'practice-reviews')
          await fs.mkdir(reviewDir, { recursive: true })
          // Explicit synthetic fixtures, never a real learner mistake. Positive
          // probe uses a known /t/ versus /θ/ minimal pair; default challenges false advice.
          await fs.writeFile(path.join(reviewDir, `${createHash('sha256').update(id).digest('hex')}-0.json`), JSON.stringify({ version: 1, sessionId: id, turnIndex: 0, language: payload.language, mode: 'read', audioHash: clip.audioHash, status: 'reviewed', model: 'SYNTHETIC ACCEPTANCE FIXTURE', findings: [{ word: payload.language === 'fr' ? 'priorités' : 'three', heard: payload.positiveMode ? 'tree' : 'wrong sound', correction: 'Use a clearer onset.', example: payload.language === 'fr' ? 'Trois priorités.' : 'Three priorities.', startMs: 0, endMs: 1200, confidence: 0.99, decision: payload.positiveMode ? 'confirmed' : 'pending' }] }))
          const target = { sessionId: id, turnIndex: 0, findingIndex: 0 }
          const recordAttempt = async pcm => {
            const attempt = await repeats.createInterviewRepeat(target)
            await recording.startMeetingAudioBackup({ sessionId: attempt.audioSessionId, source: 'microphone', sampleRate: 16000, channelCount: 1, now: startedAt })
            await recording.appendMeetingAudioBackupChunk({ sessionId: attempt.audioSessionId, source: 'microphone', pcm16: pcm })
            await recording.stopMeetingAudioBackup({ sessionId: attempt.audioSessionId, source: 'microphone', now: endedAt })
            await repeats.finishInterviewRepeat({ id: attempt.id, failed: false })
            return repeats.compareInterviewRepeat({ id: attempt.id, consent: true })
          }
          const result = await recordAttempt(Buffer.from(payload.repeatPcm, 'base64'))
          const identical = await recordAttempt(audio)
          const history = await repeats.listInterviewRepeats(target)
          return { language: payload.language, status: result.comparison.outcome, quality: result.comparison.check.quality, latencyMs: result.comparison.latencyMs, identical: identical.comparison.outcome, persisted: history.some(item => item.comparison?.repeatHash === result.comparison.repeatHash), audioHash: clip.audioHash, ownerConfirmed: result.comparison.ownerConfirmed }
        }
        const response = await review.reviewInterviewAudio({ sessionId: id, turnIndex: 0, consent: true, mode: 'read' })
        const restored = await review.readInterviewReview({ sessionId: id, turnIndex: 0 })
        return { language: payload.language, status: response.status, findings: response.findings.length, latencyMs: response.latencyMs, audioHash: response.audioHash, persisted: restored?.audioHash === response.audioHash }
      }, { root: process.cwd(), useBundle: process.env.COQPI_REVIEW_USE_BUNDLE === '1', repeatMode, positiveMode, repeatPcm: repeatPcm?.toString('base64'), language, text, pcm: pcm.toString('base64') })
      assert.equal(result.persisted, true)
      assert.equal(result.audioHash.length, 64)
      if (repeatMode) console.log(JSON.stringify(result))
      if (repeatMode) { if (!positiveMode) assert.notEqual(result.status, 'improved'); assert.equal(result.identical, 'same_audio'); assert.equal(result.ownerConfirmed, positiveMode) }
      report.push(result)
    }
    if (positiveMode) assert.ok((await app.evaluate(() => globalThis.__coqpiRepeatPaidStats)).paired > 0, 'paired-audio provider branch was not exercised; no positive accuracy claim')
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ directory, report, scope: 'Synthetic EN/FR smoke; not human pronunciation calibration.' }, null, 2))
  } finally {
    clearTimeout(watchdog)
    if (app) await app.close().catch(() => undefined)
    await fs.rm(path.join(directory, 'electron/secrets'), { recursive: true, force: true })
  }
})().catch(error => { console.error(error.message); process.exitCode = 1 })

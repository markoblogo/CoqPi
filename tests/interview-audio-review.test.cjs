const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const originalLoad = Module._load
Module._load = (request, parent, isMain) => request === 'electron' ? { app: { getName: () => 'CoqPi', getPath: () => '/private/tmp/coqpi-audio-review-test' } } : originalLoad(request, parent, isMain)
const { sliceAnswerAudio, parseAudioFeedback } = require('../dist-electron/backend/services/interview-audio-review.js')
Module._load = originalLoad

const wav = (seconds = 4, silent = false) => {
  const b = Buffer.alloc(44 + seconds * 16000 * 2)
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40)
  if (!silent) for (let i = 44; i < b.length; i += 2) b.writeInt16LE(Math.round(Math.sin(i / 30) * 4000), i)
  return b
}
test('audio slice contains only requested answer frames with a valid WAV header', () => {
  const result = sliceAnswerAudio(wav(), 1000, 3000)
  assert.equal(result.audio.length, 64044)
  assert.equal(result.audio.readUInt32LE(40), 64000)
  assert.equal(result.durationMs, 2000)
  assert.ok(result.rms > 100)
})
test('invalid, silent, oversized or incomplete ranges cannot masquerade as pronunciation evidence', () => {
  for (const [start, end] of [[-1, 1000], [1000, 500], [0, 90001], [0, 6000], [NaN, 2000]]) {
    assert.throws(() => sliceAnswerAudio(wav(), start, end))
  }
  assert.equal(sliceAnswerAudio(wav(4, true), 0, 2000).rms, 0)
  assert.throws(() => sliceAnswerAudio(Buffer.from('no audio'), 0, 1000))
})
test('feedback requires bounded acoustic evidence, confidence and a correct spoken example', () => {
  const finding = { word: 'three', heard: 'tree', explanation: 'Initial sound is unclear.', correction: 'Use /θ/.', example: 'Three priorities.', startMs: 100, endMs: 700, confidence: 0.9 }
  const parsed = parseAudioFeedback(JSON.stringify({ status: 'reviewed', summary: 'Intelligible.', findings: [finding, { ...finding, confidence: 0.3 }, { ...finding, endMs: 9000 }] }), 2000)
  assert.equal(parsed.findings.length, 1)
  assert.equal(parsed.findings[0].decision, 'pending')
  assert.equal(parseAudioFeedback(JSON.stringify({ status: 'not_assessed', summary: 'Noise', findings: [finding] }), 2000).findings.length, 0)
  assert.throws(() => parseAudioFeedback('not json', 2000))
})

test('saved microphone audio, not text alone, reaches the provider; review/decisions survive reopen without changing the transcript', async () => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-voice-review-'))
  const startedAt = '2026-10-25T10:00:00.000Z'
  const session = { id: 'synthetic', status: 'stopped', language: 'fr', segments: [{ source: 'microphone', sourceItemId: 'turn-0:a', text: 'Trois priorités.' }], practice: { turns: [{ input: 'voice', question: 'Vos priorités ?', expectedAnswer: 'Trois priorités.', answerStartedAt: '2026-10-25T10:00:01.000Z', answerEndedAt: '2026-10-25T10:00:03.000Z' }] } }
  const baseline = JSON.stringify(session)
  const filePath = path.join(directory, 'microphone.wav')
  await fs.writeFile(filePath, wav())
  const oldFetch = global.fetch
  let calls = 0
  global.fetch = async (url, options) => {
    calls++
    const body = JSON.parse(options.body)
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(body.store, false)
    assert.equal(body.modalities[0], 'text')
    assert.equal(Buffer.from(body.messages[1].content[1].input_audio.data, 'base64').length, 64044)
    assert.ok(body.messages[0].content.includes('Never infer phonetics'))
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ status: 'reviewed', summary: 'Clear.', findings: [{ word: 'trois', heard: 'unclear onset', explanation: 'Possible issue', correction: 'Try slowly', example: 'Trois priorités.', startMs: 100, endMs: 600, confidence: 0.85 }] }) } }] }) }
  }
  const load = () => {
    const modulePath = require.resolve('../dist-electron/backend/services/interview-audio-review.js')
    delete require.cache[modulePath]
    Module._load = (request, parent, isMain) => {
      if (request === './app-state') return { getAppInfo: () => ({ sessionsDirectory: directory }) }
      if (request === './meeting-transcription-service') return { getArchivedMeetingTranscriptionSession: async () => structuredClone(session) }
      if (request === './meeting-recording-backup-service') return { getMeetingAudioBackupFilePath: async () => ({ filePath, file: { relativePath: 'microphone.wav', status: 'closed', startedAt } }) }
      if (request === './secret-storage-service') return { resolveOpenAIApiKey: async () => 'synthetic-key' }
      if (request === './governance-service') return { runGovernedProviderAction: async (action, run) => { assert.equal(action.kind, 'assistant_analysis'); assert.equal(JSON.stringify(action).includes('Trois'), false); return run() } }
      return originalLoad(request, parent, isMain)
    }
    try { return require(modulePath) } finally { Module._load = originalLoad }
  }
  try {
    let service = load()
    const request = { sessionId: session.id, turnIndex: 0, consent: true, mode: 'read' }
    await assert.rejects(service.reviewInterviewAudio({ ...request, consent: false }), /consent/)
    session.status = 'recording'
    await assert.rejects(service.reviewInterviewAudio(request), /Stop and save/)
    session.status = 'stopped'
    const review = await service.reviewInterviewAudio(request)
    assert.equal(review.findings.length, 1)
    assert.equal(calls, 1)
    await service.decideInterviewFinding({ ...request, findingIndex: 0, decision: 'dismissed' })
    service = load()
    assert.equal((await service.reviewInterviewAudio(request)).findings[0].decision, 'dismissed')
    assert.equal(calls, 1, 'cached review must not create another paid call')
    assert.equal(JSON.stringify(session), baseline)
    await fs.writeFile(filePath, wav(4, true))
    assert.equal(await service.readInterviewReview(request), null, 'changed audio invalidates evidence')
    assert.equal((await service.reviewInterviewAudio(request)).status, 'not_assessed')
    assert.equal(calls, 1, 'silence never reaches provider')
    await fs.writeFile(filePath, wav())
    global.fetch = async () => ({ ok: false, status: 503 })
    await assert.rejects(service.reviewInterviewAudio(request), /Recording is preserved/)
    assert.equal(JSON.stringify(session), baseline)
  } finally { global.fetch = oldFetch; Module._load = originalLoad; await fs.rm(directory, { recursive: true, force: true }) }
})

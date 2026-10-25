const test = require('node:test')
const assert = require('node:assert/strict')
const { parseRecommendationCheck, parseAttemptComparison } = require('../dist-electron/shared/interview-repeat.js')

test('an unsupported or uncertain recommendation cannot produce an improvement verdict', () => {
  assert.equal(parseRecommendationCheck(JSON.stringify({ quality: 'supported', reason: 'Maybe.', heard: 'word', confidence: 0.4 })).quality, 'uncertain')
  assert.equal(parseRecommendationCheck(JSON.stringify({ quality: 'unsupported', reason: 'Original is clear.', heard: 'three', confidence: 0.9 })).quality, 'unsupported')
  assert.throws(() => parseRecommendationCheck('{}'))
  assert.equal(parseAttemptComparison(JSON.stringify({ outcome: 'improved', reason: 'Sounds clearer', originalEvidence: '', repeatEvidence: 'clear', confidence: 0.99 })).outcome, 'uncertain')
  assert.equal(parseAttemptComparison(JSON.stringify({ outcome: 'improved', reason: 'The target is clearer', originalEvidence: 'initial /t/', repeatEvidence: 'audible /θ/', originalHeard: 'tree', repeatHeard: 'three', confidence: 0.9 })).outcome, 'improved')
})

test('Stop during microphone permission waits for capture and flushes exactly once', async () => {
  const { RepeatCapture } = require('../dist-electron/shared/repeat-capture.js')
  let opened, finish = 0, close = 0
  const wait = new Promise(resolve => { opened = resolve })
  const capture = new RepeatCapture({ create: async () => ({ id: 'test', audioSessionId: 'repeat' }), open: () => wait, close: async () => { close++ }, finish: async (_id, failed) => { assert.equal(failed, false); finish++ }, changed() {} })
  const starting = capture.start()
  await new Promise(resolve => setImmediate(resolve))
  const stopping = capture.stop()
  assert.equal(capture.phase, 'stopping')
  assert.equal(finish, 0)
  opened()
  await Promise.all([starting, stopping, capture.stop()])
  assert.equal(capture.phase, 'stopped')
  assert.equal(close, 1)
  assert.equal(finish, 1)
})

test('capture failures are retained and flagged before any comparison', async () => {
  const { RepeatCapture } = require('../dist-electron/shared/repeat-capture.js')
  let failed
  const capture = new RepeatCapture({ create: async () => ({ id: 'test', audioSessionId: 'repeat' }), open: async () => {}, close: async () => { throw new Error('disk gap') }, finish: async (_id, value) => { failed = value }, changed() {} })
  await capture.start(); await capture.stop()
  assert.equal(capture.phase, 'stopped')
  assert.equal(failed, true)
  assert.match(capture.error, /disk gap/)
})

test('comparison requires consent, closed audio and supported advice; hashes/cache/history survive reopen', async () => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), Module = require('node:module'), { createHash } = require('node:crypto')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-repeat-test-'))
  const wav = (pitch = 30, silent = false) => {
    const b = Buffer.alloc(64044)
    b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(64000, 40)
    if (!silent) for (let i = 44; i < b.length; i += 2) b.writeInt16LE(Math.round(Math.sin(i / pitch) * 4000), i)
    return b
  }
  const original = wav(), originalHash = createHash('sha256').update(original).digest('hex')
  const target = { sessionId: 'synthetic', turnIndex: 0, findingIndex: 0 }
  const finding = { word: 'three', heard: 'tree', correction: 'Use /θ/.', example: 'Three priorities.', startMs: 0, endMs: 1000, decision: 'confirmed' }
  const filePath = path.join(directory, 'microphone.wav')
  await fs.writeFile(filePath, wav(20))
  let closed = true, changed = false, calls = 0, quality = 'supported', invalid = false, failure = false, conflict = false
  const oldLoad = Module._load, oldFetch = global.fetch
  global.fetch = async (_url, options) => {
    calls++
    if (failure) return { ok: false, status: 503 }
    const body = JSON.parse(options.body)
    assert.equal(body.store, false)
    assert.equal(body.max_completion_tokens, 900)
    assert.equal(body.tools.length, 1)
    assert.equal(body.tool_choice.function.name, body.tools[0].function.name)
    const audios = body.messages[1].content.filter(item => item.type === 'input_audio')
    const value = audios.length === 1 ? { quality, reason: 'Audible evidence.', heard: 'tree', confidence: 0.95 } : { outcome: 'improved', reason: 'Target clearer.', originalEvidence: invalid ? '' : '/t/', repeatEvidence: '/θ/', originalHeard: conflict ? 'three' : 'tree', repeatHeard: 'three', confidence: 0.95 }
    return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify(value) } }] } }] }) }
  }
  const load = () => {
    const modulePath = require.resolve('../dist-electron/backend/services/interview-repeat-service.js')
    delete require.cache[modulePath]
    Module._load = (request, parent, isMain) => {
      if (request === './app-state') return { getAppInfo: () => ({ sessionsDirectory: directory }) }
      if (request === './interview-audio-review') return {
        readInterviewReview: async () => ({ language: 'en', findings: [finding] }),
        loadInterviewAudioClip: async () => ({ audio: original, audioHash: changed ? 'changed' : originalHash, durationMs: 2000, rms: 2000 }),
        sliceAnswerAudio: (audio) => ({ audio, durationMs: 2000, rms: audio.subarray(44).some(x => x !== 0) ? 2000 : 0 })
      }
      if (request === './meeting-recording-backup-service') return { getMeetingAudioBackupFilePath: async () => ({ filePath, file: { relativePath: 'microphone.wav', status: closed ? 'closed' : 'open' } }) }
      if (request === './secret-storage-service') return { resolveOpenAIApiKey: async () => 'fake-key' }
      if (request === './governance-service') return { runGovernedProviderAction: async (action, run) => { assert.equal(JSON.stringify(action).includes('three'), false); return run() } }
      return oldLoad(request, parent, isMain)
    }
    try { return require(modulePath) } finally { Module._load = oldLoad }
  }
  try {
    let service = load()
    assert.equal(service.sameAudioFrames(original, original.subarray(0, original.length - 16)), true)
    assert.equal(service.sameAudioFrames(original, original.subarray(0, original.length - 320)), false)
    assert.equal(service.sameAudioFrames(original, wav(20)), false)
    const attempt = await service.createInterviewRepeat(target)
    await assert.rejects(service.compareInterviewRepeat({ id: attempt.id, consent: false }), /consent/)
    closed = false
    await assert.rejects(service.compareInterviewRepeat({ id: attempt.id, consent: true }), /Stop and save/)
    closed = true
    const compared = await service.compareInterviewRepeat({ id: attempt.id, consent: true })
    assert.equal(compared.comparison.outcome, 'improved'); assert.equal(calls, 2)
    service = load()
    assert.equal((await service.compareInterviewRepeat({ id: attempt.id, consent: true })).comparison.outcome, 'improved')
    assert.equal(calls, 2)
    assert.equal((await service.listInterviewRepeats(target)).length, 1)
    await fs.writeFile(filePath, wav(25))
    assert.equal((await service.listInterviewRepeats(target))[0].comparison, undefined, 'changed repeat PCM invalidates cached UI evidence')
    await fs.writeFile(filePath, wav(20))
    finding.decision = 'pending'
    assert.equal((await service.listInterviewRepeats(target))[0].comparison, undefined)
    const pending = await service.createInterviewRepeat(target)
    assert.equal((await service.compareInterviewRepeat({ id: pending.id, consent: true })).comparison.outcome, 'uncertain')
    finding.decision = 'confirmed'
    const other = await service.createInterviewRepeat(target)
    quality = 'unsupported'
    assert.equal((await service.compareInterviewRepeat({ id: other.id, consent: true })).comparison.outcome, 'not_assessed')
    assert.equal(calls, 5, 'unsupported advice never reaches comparative praise')
    quality = 'supported'; conflict = true
    const inconsistent = await service.createInterviewRepeat(target)
    const disagreement = await service.compareInterviewRepeat({ id: inconsistent.id, consent: true })
    assert.equal(disagreement.comparison.outcome, 'uncertain')
    assert.match(disagreement.comparison.reason, /disagree/)
    conflict = false
    quality = 'supported'; invalid = true
    const uncertain = await service.createInterviewRepeat(target)
    assert.equal((await service.compareInterviewRepeat({ id: uncertain.id, consent: true })).comparison.outcome, 'uncertain')
    await fs.writeFile(filePath, original)
    const same = await service.createInterviewRepeat(target)
    const before = calls
    assert.equal((await service.compareInterviewRepeat({ id: same.id, consent: true })).comparison.outcome, 'same_audio')
    assert.equal(calls, before)
    await fs.writeFile(filePath, wav(20, true))
    const quiet = await service.createInterviewRepeat(target)
    assert.equal((await service.compareInterviewRepeat({ id: quiet.id, consent: true })).comparison.outcome, 'not_assessed')
    assert.equal(calls, before)
    const oversized = wav(20)
    oversized.writeUInt32LE(100, 24)
    await fs.writeFile(filePath, oversized)
    const tooLong = await service.createInterviewRepeat(target)
    await assert.rejects(service.compareInterviewRepeat({ id: tooLong.id, consent: true }), /at most 20 seconds/)
    assert.equal(calls, before, 'oversized audio cannot trigger provider calls')
    await fs.writeFile(filePath, wav(20))
    const failed = await service.createInterviewRepeat(target)
    await service.finishInterviewRepeat({ id: failed.id, failed: true })
    await service.finishInterviewRepeat({ id: failed.id, failed: false })
    await assert.rejects(service.compareInterviewRepeat({ id: failed.id, consent: true }), /gap or failure/)
    const retry = await service.createInterviewRepeat(target)
    failure = true
    await assert.rejects(service.compareInterviewRepeat({ id: retry.id, consent: true }), /Recordings preserved/)
    failure = false; invalid = false
    assert.equal((await service.compareInterviewRepeat({ id: retry.id, consent: true })).comparison.outcome, 'improved')
    changed = true
    assert.equal((await service.finishInterviewRepeat({ id: attempt.id, failed: false })).recorded, true, 'stale source must not prevent local recording finalization')
    await assert.rejects(service.compareInterviewRepeat({ id: attempt.id, consent: true }), /changed/)
    changed = false; finding.decision = 'dismissed'
    await assert.rejects(service.createInterviewRepeat(target), /non-dismissed/)
    await assert.rejects(service.readInterviewRepeatClip('../bad'), /Invalid repeat ID/)
  } finally { global.fetch = oldFetch; Module._load = oldLoad; await fs.rm(directory, { recursive: true, force: true }) }
})

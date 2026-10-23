// Offline audit probe: synthetic data, isolated storage, no provider requests.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { spawnSync } = require('node:child_process')
const { performance: perf } = require('node:perf_hooks')
const assert = require('node:assert/strict')

const now = '2026-10-23T10:00:00.000Z'
const setup = (directory) => {
  process.env.COQPI_DATA_DIR = directory
  process.env.COQPI_SESSIONS_DIR = path.join(directory, 'sessions')
  process.env.COQPI_GOVERNANCE_DIR = path.join(directory, 'governance')
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'knowledge')
  delete process.env.OPENAI_API_KEY
  const load = Module._load
  Module._load = function (name, parent, main) {
    if (name === 'electron') return {
      app: { getName: () => 'CoqPi Audit', getPath: () => directory },
      safeStorage: { isEncryptionAvailable: () => false }
    }
    return load.call(this, name, parent, main)
  }
  global.fetch = async () => { throw new Error('Audit forbids network requests') }
  return {
    shared: require('../dist-electron/shared/meeting-transcription.js'),
    journal: require('../dist-electron/backend/services/meeting-transcription-service.js'),
    backup: require('../dist-electron/backend/services/meeting-recording-backup-service.js'),
    recovery: require('../dist-electron/backend/services/meeting-transcription-recovery-service.js')
  }
}
const add = (shared, session, index, text = 'Synthetic professional conversation.') =>
  shared.applyMeetingTranscriptionRealtimeEvent({ session,
    event: { type: 'conversation.item.input_audio_transcription.completed', item_id: `item-${index}`, transcript: text },
    now: new Date(Date.parse(now) + index * 1000).toISOString(), createSegmentId: () => `segment-${index}`
  }).session
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { n: sorted.length, medianMs: sorted[Math.ceil(sorted.length / 2) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], worstMs: sorted.at(-1) }
}

async function main() {
  if (process.argv[2] === '--crash-child') {
    const { shared, journal, backup } = setup(process.argv[3])
    let session = shared.createMeetingTranscriptionSession({ id: 'crash', language: 'fr', inputLabel: 'Synthetic', now })
    session = add(shared, session, 0, 'Bonjour, pouvez-vous expliquer votre approche ?')
    await journal.saveCurrentMeetingTranscriptionSession(session)
    await backup.startMeetingAudioBackup({ sessionId: session.id, source: 'system', sampleRate: 16000, channelCount: 1, now })
    await backup.appendMeetingAudioBackupChunk({ sessionId: session.id, source: 'system', pcm16: Buffer.alloc(32000, 1) })
    process.kill(process.pid, 'SIGKILL')
    return
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-audit-'))
  try {
    const child = spawnSync(process.execPath, [__filename, '--crash-child', directory], { encoding: 'utf8' })
    assert.equal(child.signal, 'SIGKILL', child.stderr)
    const { shared, journal, backup, recovery } = setup(directory)
    const restored = await journal.getCurrentMeetingTranscriptionSession()
    assert.equal(restored.segments.length, 1)
    const file = await backup.getMeetingAudioBackupFilePath({ sessionId: 'crash', source: 'system' })
    const audio = await fs.readFile(file.filePath)
    let recoveryError
    try { await recovery.recoverCurrentMeetingTranscriptFromBackup({ sessionId: 'crash' }) }
    catch (error) { recoveryError = error.message }
    const repairedFile = await backup.getMeetingAudioBackupFilePath({ sessionId: 'crash', source: 'system' })
    const results = { environment: { node: process.version, platform: process.platform,
      arch: process.arch, cpu: os.cpus()[0]?.model, storage: 'os.tmpdir()', provider: 'none' },
    crash: { signal: child.signal, persistedSegments: restored.segments.length,
      backupStatus: file.file.status, repairedStatus: repairedFile.file.status, bytesOnDisk: audio.length, wavDeclaredBytes: audio.readUInt32LE(40), recoveryError } }

    let review = { ...restored, segments: [0, 1].map((i) => ({
      id: `review-${i}`, text: i ? 'Second sentence.' : 'First sentence.', startTime: now,
      language: 'en', source: 'system', speaker: 'OTHER', isFinal: true,
      recovery: { status: 'active', source: 'system', recoveredAt: now }
    })) }
    review = shared.mergeMeetingTranscriptSegmentIntoPrevious(review, 'review-1')
    review = shared.restoreMeetingTranscriptSegmentToExport(review, 'review-1')
    results.mergeRestore = { exportableTexts: review.segments.filter(shared.isMeetingTranscriptSegmentExportable).map(s => s.text) }

    results.persistence = []
    for (const count of [10, 100, 1000]) {
      let session = shared.createMeetingTranscriptionSession({ id: `bench-${count}`, language: 'en', inputLabel: 'Synthetic', now })
      for (let i = 0; i < count; i++) session = add(shared, session, i)
      await journal.saveCurrentMeetingTranscriptionSession(session)
      const durations = []
      for (let i = 0; i < 30; i++) {
        session = add(shared, session, count + i)
        const start = perf.now()
        await journal.saveCurrentMeetingTranscriptionSession(session)
        durations.push(perf.now() - start)
      }
      results.persistence.push({ startingSegments: count, ...stats(durations) })
    }
    // Existing final speech is not part of the recovery source/hash dedupe key.
    let session = shared.createMeetingTranscriptionSession({ id: 'overlap', language: 'en', inputLabel: 'Synthetic', now })
    session = add(shared, session, 0, 'The same utterance already saved live.')
    await journal.saveCurrentMeetingTranscriptionSession(session)
    for (const source of ['microphone', 'system']) {
      await backup.startMeetingAudioBackup({ sessionId: session.id, source, sampleRate: 16000, channelCount: 1, now })
      await backup.appendMeetingAudioBackupChunk({ sessionId: session.id, source, pcm16: Buffer.alloc(32000, 1) })
      await backup.stopMeetingAudioBackup({ sessionId: session.id, source, now })
    }
    require('../dist-electron/backend/services/secret-storage-service.js').resolveOpenAIApiKey = async () => 'synthetic-key'
    global.fetch = async () => ({ ok: true, json: async () => ({ text: 'The same utterance already saved live.' }) })
    const recovered = await recovery.recoverCurrentMeetingTranscriptFromBackup({ sessionId: session.id })
    results.liveRecoveryOverlap = { original: 1, after: recovered.session.segments.length,
      uniqueTextCount: new Set(recovered.session.segments.map(s => s.text)).size }
    const partial = shared.createMeetingTranscriptionSession({ id: 'partial-recovery', language: 'en', inputLabel: 'Synthetic', now })
    await journal.saveCurrentMeetingTranscriptionSession(partial)
    for (const source of ['microphone', 'system']) {
      await backup.startMeetingAudioBackup({ sessionId: partial.id, source, sampleRate: 16000, channelCount: 1, now })
      await backup.appendMeetingAudioBackupChunk({ sessionId: partial.id, source, pcm16: Buffer.alloc(32000, 1) })
      await backup.stopMeetingAudioBackup({ sessionId: partial.id, source, now })
    }
    const corruptFile = await backup.getMeetingAudioBackupFilePath({ sessionId: partial.id, source: 'system' })
    await fs.appendFile(corruptFile.filePath, Buffer.from([1, 2]))
    let completedSttCalls = 0
    global.fetch = async () => { completedSttCalls++; return { ok: true, json: async () => ({ text: 'Successfully recovered microphone speech.' }) } }
    let partialError
    try { await recovery.recoverCurrentMeetingTranscriptFromBackup({ sessionId: partial.id }) }
    catch (error) { partialError = error.message }
    results.partialRecovery = { completedSttCalls, error: partialError,
      persistedSegments: (await journal.getCurrentMeetingTranscriptionSession()).segments.length }
    const { detectConversationLanguage } = require('../dist-electron/shared/conversation-language.js')
    results.languageHeuristic = [
      { text: 'Could you explain your approach?', previous: 'fr', expected: 'en' },
      { text: 'Pouvez-vous expliquer votre approche ?', previous: 'en', expected: 'fr' },
      { text: 'Quels risques anticipez-vous ?', previous: 'en', expected: 'fr' },
      { text: 'Describe a challenging project.', previous: 'fr', expected: 'en' },
      { text: 'Quel budget faut-il ?', previous: 'en', expected: 'fr' },
      { text: 'Давайте поговорим про продукт.', previous: 'uk', expected: 'ru' }
    ].map(item => ({ ...item, actual: detectConversationLanguage(item.text, item.previous) }))
    const { rankRetrievalCandidates } = require('../dist-electron/shared/retrieval-quality.js')
    const candidates = [{ id: 'owner', sourceId: 'synthetic-cv', label: 'Reviewed CV', kind: 'owner', fallbackPriority: 12,
      sections: [{ label: 'experience', text: 'Led customer research and launched a pricing experiment.', weight: 8 }] }]
    results.bilingualRetrieval = [
      'Tell me about customer research and pricing.',
      'Parlez-moi de vos recherches clients et de votre tarification.'
    ].map(query => ({ query, matches: rankRetrievalCandidates({ query, candidates }).matches.map(match => ({ quality: match.quality, fallbackUsed: match.fallbackUsed, matchedTerms: match.matchedTerms })) }))
    results.resources = { peakRssKiB: process.resourceUsage().maxRSS, cpuMicros: process.cpuUsage() }
    console.log(JSON.stringify(results, null, 2))
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

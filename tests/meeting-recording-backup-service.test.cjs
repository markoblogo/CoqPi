const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const { createHash } = require('node:crypto')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-meeting-backup-userdata')
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => Buffer.from(value).toString('utf8')
  }
}

const withBackupWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-meeting-backup-'))
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const previousGovernanceDirectory = process.env.COQPI_GOVERNANCE_DIR
  const previousOpenAIKey = process.env.OPENAI_API_KEY
  const previousRecoveryChunkSeconds = process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS
  const previousRecoverySilenceThreshold = process.env.COQPI_AUDIO_RECOVERY_SILENCE_THRESHOLD
  const originalModuleLoad = Module._load
  const modulesToReset = [
    '../dist-electron/backend/services/app-state.js',
    '../dist-electron/backend/services/governance-action-runner.js',
    '../dist-electron/backend/services/governance-receipt-service.js',
    '../dist-electron/backend/services/governance-service.js',
    '../dist-electron/backend/services/meeting-recording-backup-service.js',
    '../dist-electron/backend/services/meeting-transcription-recovery-service.js',
    '../dist-electron/backend/services/meeting-transcription-service.js',
    '../dist-electron/backend/services/secret-storage-service.js',
    '../dist-electron/shared/meeting-transcription.js'
  ].map((modulePath) => require.resolve(modulePath))

  for (const modulePath of modulesToReset) delete require.cache[modulePath]
  process.env.COQPI_SESSIONS_DIR = path.join(directory, 'sessions')
  process.env.COQPI_GOVERNANCE_DIR = path.join(directory, 'governance')
  process.env.OPENAI_API_KEY = 'test-openai-key'

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') return mockElectron
    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const backupService = require('../dist-electron/backend/services/meeting-recording-backup-service.js')
    const transcriptionService = require('../dist-electron/backend/services/meeting-transcription-service.js')
    const recoveryService = require('../dist-electron/backend/services/meeting-transcription-recovery-service.js')
    const shared = require('../dist-electron/shared/meeting-transcription.js')
    await run({ backupService, transcriptionService, recoveryService, shared, directory })
  } finally {
    Module._load = originalModuleLoad
    if (previousSessionsDirectory === undefined) delete process.env.COQPI_SESSIONS_DIR
    else process.env.COQPI_SESSIONS_DIR = previousSessionsDirectory
    if (previousGovernanceDirectory === undefined) delete process.env.COQPI_GOVERNANCE_DIR
    else process.env.COQPI_GOVERNANCE_DIR = previousGovernanceDirectory
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousOpenAIKey
    if (previousRecoveryChunkSeconds === undefined) delete process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS
    else process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS = previousRecoveryChunkSeconds
    if (previousRecoverySilenceThreshold === undefined) delete process.env.COQPI_AUDIO_RECOVERY_SILENCE_THRESHOLD
    else process.env.COQPI_AUDIO_RECOVERY_SILENCE_THRESHOLD = previousRecoverySilenceThreshold
    for (const modulePath of modulesToReset) delete require.cache[modulePath]
    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('audio backup manifest is stored under a session hash and survives session sanitize restore', async () => {
  await withBackupWorkspace(async ({ backupService, transcriptionService, shared, directory }) => {
    const sessionId = '../../unsafe-live-session'
    const now = '2026-09-15T10:00:00.000Z'
    const manifest = await backupService.createMeetingAudioBackupManifest({
      sessionId,
      now,
      sources: ['microphone', 'system']
    })
    const hash = createHash('sha256').update(sessionId).digest('hex')
    const manifestPath = path.join(directory, 'sessions', 'audio-backups', hash, 'manifest.json')

    assert.equal((await fs.stat(manifestPath)).isFile(), true)
    assert.equal(manifest.files.length, 2)
    assert.equal(manifest.files[0].relativePath.endsWith('.wav'), true)

    const session = {
      ...shared.createMeetingTranscriptionSession({
        id: sessionId,
        language: 'en',
        inputLabel: 'Mic',
        now
      }),
      audioBackup: {
        manifestId: hash,
        status: manifest.status,
        updatedAt: manifest.updatedAt
      }
    }

    await transcriptionService.saveCurrentMeetingTranscriptionSession(session)
    const restored = await transcriptionService.getCurrentMeetingTranscriptionSession()
    assert.deepEqual(restored.audioBackup, session.audioBackup)
    assert.equal((await backupService.readMeetingAudioBackupManifest(sessionId)).sessionId, sessionId)
  })
})

test('recording claims are exclusive and recoverable after a dead or corrupt owner', async () => {
  await withBackupWorkspace(async ({ backupService, directory }) => {
    const now = '2026-09-15T11:00:00.000Z'
    const first = await backupService.acquireMeetingRecordingClaim({
      sessionId: 'claim-session',
      stage: 'recording',
      now
    })
    assert.equal(first.acquired, true)
    assert.equal(first.reason, 'created')

    const held = await backupService.acquireMeetingRecordingClaim({
      sessionId: 'claim-session',
      stage: 'recording',
      now: '2026-09-15T11:01:00.000Z'
    })
    assert.equal(held.acquired, false)
    assert.equal(held.reason, 'already-held')

    assert.equal(await backupService.releaseMeetingRecordingClaim({ ...held.claim, token: 'wrong' }), false)
    assert.equal(await backupService.releaseMeetingRecordingClaim(first.claim), true)

    const hash = createHash('sha256').update('claim-session').digest('hex')
    const claimPath = path.join(directory, 'sessions', 'audio-backups', hash, 'recording.claim.json')
    await fs.mkdir(path.dirname(claimPath), { recursive: true })
    await fs.writeFile(claimPath, '{"broken"', 'utf8')
    const recoveredCorrupt = await backupService.acquireMeetingRecordingClaim({
      sessionId: 'claim-session',
      stage: 'recording',
      now: '2026-09-15T11:02:00.000Z'
    })
    assert.equal(recoveredCorrupt.acquired, true)
    assert.equal(recoveredCorrupt.reason, 'recovered-stale')
    await backupService.releaseMeetingRecordingClaim(recoveredCorrupt.claim)

    await fs.writeFile(claimPath, JSON.stringify({
      version: 1,
      sessionId: 'claim-session',
      stage: 'recording',
      ownerPid: 0,
      ownerStartedAt: '2026-09-15T10:59:00.000Z',
      token: 'dead-owner',
      createdAt: '2026-09-15T10:59:00.000Z',
      updatedAt: '2026-09-15T10:59:00.000Z'
    }), 'utf8')
    const recoveredDeadOwner = await backupService.acquireMeetingRecordingClaim({
      sessionId: 'claim-session',
      stage: 'recording',
      now: '2026-09-15T11:03:00.000Z'
    })
    assert.equal(recoveredDeadOwner.acquired, true)
    assert.equal(recoveredDeadOwner.reason, 'recovered-dead-owner')
  })
})

test('microphone backup writes a playable wav file and finalizes manifest', async () => {
  await withBackupWorkspace(async ({ backupService }) => {
    const sessionId = 'mic-backup-session'
    const startedAt = '2026-09-15T12:00:00.000Z'
    const handle = await backupService.startMeetingAudioBackup({
      sessionId,
      source: 'microphone',
      sampleRate: 16000,
      channelCount: 1,
      now: startedAt
    })

    assert.equal(handle.manifest.format, 'wav_pcm')
    assert.equal(handle.manifest.status, 'recording')
    assert.equal(handle.manifest.files[0].relativePath, 'microphone.wav')

    await backupService.appendMeetingAudioBackupChunk({
      sessionId,
      source: 'microphone',
      pcm16: Int16Array.from([0, 1024, -1024, 32767, -32768]).buffer
    })

    const stopped = await backupService.stopMeetingAudioBackup({
      sessionId,
      source: 'microphone',
      now: '2026-09-15T12:00:05.000Z'
    })
    const file = stopped.files[0]

    assert.equal(stopped.status, 'stopped')
    assert.equal(file.status, 'closed')
    assert.equal(file.byteLength, 54)
    assert.match(file.sha256, /^[a-f0-9]{64}$/)

    const audio = await fs.readFile(path.join(handle.directory, file.relativePath))
    assert.equal(audio.subarray(0, 4).toString('ascii'), 'RIFF')
    assert.equal(audio.subarray(8, 12).toString('ascii'), 'WAVE')
    assert.equal(audio.readUInt32LE(24), 16000)
    assert.equal(audio.readUInt16LE(22), 1)
    assert.equal(audio.readUInt32LE(40), 10)
  })
})

test('audio backup can record microphone and system sources in one session manifest', async () => {
  await withBackupWorkspace(async ({ backupService }) => {
    const sessionId = 'multi-source-backup-session'
    const startedAt = '2026-09-16T09:00:00.000Z'
    const microphone = await backupService.startMeetingAudioBackup({
      sessionId,
      source: 'microphone',
      sampleRate: 16000,
      channelCount: 1,
      now: startedAt
    })
    const system = await backupService.startMeetingAudioBackup({
      sessionId,
      source: 'system',
      sampleRate: 16000,
      channelCount: 1,
      now: startedAt
    })

    assert.equal(microphone.manifest.files.some((file) => file.source === 'microphone'), true)
    assert.equal(system.manifest.files.some((file) => file.source === 'system'), true)

    await backupService.appendMeetingAudioBackupChunk({
      sessionId,
      source: 'microphone',
      pcm16: Int16Array.from([0, 1000]).buffer
    })
    await backupService.appendMeetingAudioBackupChunk({
      sessionId,
      source: 'system',
      pcm16: Int16Array.from([0, 2000, -2000]).buffer
    })

    await backupService.stopMeetingAudioBackup({
      sessionId,
      source: 'microphone',
      now: '2026-09-16T09:00:04.000Z'
    })
    const stopped = await backupService.stopMeetingAudioBackup({
      sessionId,
      source: 'system',
      now: '2026-09-16T09:00:04.000Z'
    })

    const micFile = stopped.files.find((file) => file.source === 'microphone')
    const systemFile = stopped.files.find((file) => file.source === 'system')
    assert.equal(stopped.status, 'stopped')
    assert.equal(micFile.status, 'closed')
    assert.equal(systemFile.status, 'closed')
    assert.equal(micFile.relativePath, 'microphone.wav')
    assert.equal(systemFile.relativePath, 'system.wav')
    assert.match(micFile.sha256, /^[a-f0-9]{64}$/)
    assert.match(systemFile.sha256, /^[a-f0-9]{64}$/)
  })
})

test('recovery appends system audio backup with OTHER speaker labels', async () => {
  await withBackupWorkspace(async ({ backupService, transcriptionService, recoveryService, shared }) => {
    const originalFetch = global.fetch
    let fetchCount = 0
    global.fetch = async (_url, request) => {
      const file = request.body.get('file')
      assert.match(file.name, /system-/)
      fetchCount += 1
      return new Response(
        JSON.stringify({ text: 'The other speaker asks a question.' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    try {
      const sessionId = 'recover-system-session'
      const startedAt = '2026-09-16T10:00:00.000Z'
      await backupService.startMeetingAudioBackup({
        sessionId,
        source: 'system',
        sampleRate: 16000,
        channelCount: 1,
        now: startedAt
      })
      await backupService.appendMeetingAudioBackupChunk({
        sessionId,
        source: 'system',
        pcm16: Int16Array.from([0, 256, -256, 512, -512]).buffer
      })
      const manifest = await backupService.stopMeetingAudioBackup({
        sessionId,
        source: 'system',
        now: '2026-09-16T10:00:04.000Z'
      })
      await transcriptionService.saveCurrentMeetingTranscriptionSession({
        ...shared.createMeetingTranscriptionSession({
          id: sessionId,
          language: 'en',
          inputLabel: 'System audio',
          now: startedAt,
          mode: 'recorder'
        }),
        status: 'stopped',
        stoppedAt: '2026-09-16T10:00:04.000Z',
        endedAt: '2026-09-16T10:00:04.000Z',
        audioBackup: {
          manifestId: backupService.getMeetingAudioBackupManifestId(sessionId),
          status: manifest.status,
          updatedAt: manifest.updatedAt
        }
      })

      const recovered = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(recovered.addedSegments, 1)
      assert.equal(fetchCount, 1)
      assert.equal(recovered.report.sources[0].source, 'system')
      assert.equal(recovered.report.recoveredSegments, 1)
      assert.equal(recovered.report.failedChunks, 0)
      assert.equal(recovered.session.segments[0].source, 'system')
      assert.equal(recovered.session.segments[0].speaker, 'OTHER')
      assert.match(recovered.session.segments[0].sourceItemId, /^audio-recovery:system:/)
      assert.equal(recovered.session.segments[0].recovery.source, 'system')
    } finally {
      global.fetch = originalFetch
    }
  })
})

test('recovery appends microphone backup transcript once without duplicate STT calls', async () => {
  await withBackupWorkspace(async ({ backupService, transcriptionService, recoveryService, shared }) => {
    const originalFetch = global.fetch
    let fetchCount = 0
    global.fetch = async (_url, request) => {
      fetchCount += 1
      assert.equal(request.method, 'POST')
      assert.equal(request.headers.Authorization, 'Bearer test-openai-key')
      return new Response(
        JSON.stringify({ text: 'Bonjour, pouvez-vous me parler de votre parcours ?' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    try {
      const sessionId = 'recover-session'
      const startedAt = '2026-09-15T13:00:00.000Z'
      await backupService.startMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        sampleRate: 16000,
        channelCount: 1,
        now: startedAt
      })
      await backupService.appendMeetingAudioBackupChunk({
        sessionId,
        source: 'microphone',
        pcm16: Int16Array.from([0, 256, -256, 512, -512]).buffer
      })
      const manifest = await backupService.stopMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        now: '2026-09-15T13:00:05.000Z'
      })
      await transcriptionService.saveCurrentMeetingTranscriptionSession({
        ...shared.createMeetingTranscriptionSession({
          id: sessionId,
          language: 'fr',
          inputLabel: 'Mic',
          now: startedAt,
          mode: 'recorder'
        }),
        status: 'stopped',
        stoppedAt: '2026-09-15T13:00:05.000Z',
        endedAt: '2026-09-15T13:00:05.000Z',
        audioBackup: {
          manifestId: backupService.getMeetingAudioBackupManifestId(sessionId),
          status: manifest.status,
          updatedAt: manifest.updatedAt
        }
      })

      const recovered = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(recovered.addedSegments, 1)
      assert.equal(recovered.report.totalChunks, 1)
      assert.equal(recovered.report.recoveredSegments, 1)
      assert.equal(recovered.report.recoveredTextChars, 'Bonjour, pouvez-vous me parler de votre parcours ?'.length)
      assert.equal(recovered.session.segments.length, 1)
      assert.equal(recovered.session.segments[0].source, 'microphone')
      assert.equal(recovered.session.segments[0].speaker, 'UNKNOWN')
      assert.match(recovered.session.segments[0].sourceItemId, /^audio-recovery:microphone:/)
      assert.equal(recovered.session.segments[0].recovery.status, 'active')
      assert.equal(recovered.session.segments[0].recovery.source, 'microphone')
      assert.equal(recovered.session.segments[0].recovery.chunkIndex, 0)
      assert.equal(recovered.session.segments[0].text, 'Bonjour, pouvez-vous me parler de votre parcours ?')

      const second = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(second.addedSegments, 0)
      assert.equal(second.session.segments.length, 1)
      assert.equal(second.report.skippedChunks, 1)
      assert.equal(fetchCount, 1)
    } finally {
      global.fetch = originalFetch
    }
  })
})

test('recovery prefers silence boundaries near chunk edges', async () => {
  await withBackupWorkspace(async ({ backupService, transcriptionService, recoveryService, shared }) => {
    const originalFetch = global.fetch
    const recoveredTexts = ['intro turn', 'middle turn', 'closing turn']
    let fetchCount = 0
    process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS = '1'
    process.env.COQPI_AUDIO_RECOVERY_SILENCE_THRESHOLD = '100'
    global.fetch = async (_url, request) => {
      const file = request.body.get('file')
      const audio = Buffer.from(await file.arrayBuffer())
      assert.equal(audio.subarray(0, 4).toString('ascii'), 'RIFF')
      const text = recoveredTexts[fetchCount] ?? ''
      fetchCount += 1
      return new Response(
        JSON.stringify({ text }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    try {
      const sessionId = 'recover-speech-aware-session'
      const startedAt = '2026-09-15T15:00:00.000Z'
      const samples = new Int16Array(2800)
      samples.fill(6000, 0, 800)
      samples.fill(0, 800, 900)
      samples.fill(6000, 900, 1800)
      samples.fill(0, 1800, 1900)
      samples.fill(6000, 1900, 2800)
      await backupService.startMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        sampleRate: 1000,
        channelCount: 1,
        now: startedAt
      })
      await backupService.appendMeetingAudioBackupChunk({
        sessionId,
        source: 'microphone',
        pcm16: samples.buffer
      })
      const manifest = await backupService.stopMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        now: '2026-09-15T15:00:02.800Z'
      })
      await transcriptionService.saveCurrentMeetingTranscriptionSession({
        ...shared.createMeetingTranscriptionSession({
          id: sessionId,
          language: 'en',
          inputLabel: 'Mic',
          now: startedAt,
          mode: 'recorder'
        }),
        status: 'stopped',
        stoppedAt: '2026-09-15T15:00:02.800Z',
        endedAt: '2026-09-15T15:00:02.800Z',
        audioBackup: {
          manifestId: backupService.getMeetingAudioBackupManifestId(sessionId),
          status: manifest.status,
          updatedAt: manifest.updatedAt
        }
      })

      const recovered = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(recovered.addedSegments, 3)
      assert.equal(recovered.report.totalChunks, 3)
      assert.equal(recovered.report.recoveredSegments, 3)
      assert.deepEqual(recovered.session.segments.map((segment) => segment.text), recoveredTexts)
      assert.deepEqual(recovered.session.segments.map((segment) => segment.startTime), [
        '2026-09-15T15:00:00.000Z',
        '2026-09-15T15:00:00.900Z',
        '2026-09-15T15:00:01.900Z'
      ])
      assert.deepEqual(recovered.session.segments.map((segment) => segment.endTime), [
        '2026-09-15T15:00:00.900Z',
        '2026-09-15T15:00:01.900Z',
        '2026-09-15T15:00:02.800Z'
      ])
      assert.equal(fetchCount, 3)
    } finally {
      global.fetch = originalFetch
    }
  })
})

test('recovery splits longer microphone backup into timestamped chunks', async () => {
  await withBackupWorkspace(async ({ backupService, transcriptionService, recoveryService, shared }) => {
    const originalFetch = global.fetch
    const recoveredTexts = ['first chunk', 'second chunk', 'third chunk']
    let fetchCount = 0
    process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS = '1'
    global.fetch = async (_url, request) => {
      const body = request.body
      assert.equal(typeof body.get, 'function')
      const file = body.get('file')
      assert.match(file.name, /^microphone-\d{3}\.wav$/)
      const text = recoveredTexts[fetchCount] ?? ''
      fetchCount += 1
      return new Response(
        JSON.stringify({ text }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    try {
      const sessionId = 'recover-chunked-session'
      const startedAt = '2026-09-15T14:00:00.000Z'
      await backupService.startMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        sampleRate: 16000,
        channelCount: 1,
        now: startedAt
      })
      await backupService.appendMeetingAudioBackupChunk({
        sessionId,
        source: 'microphone',
        pcm16: new Int16Array(16000 * 3).buffer
      })
      const manifest = await backupService.stopMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        now: '2026-09-15T14:00:03.000Z'
      })
      await transcriptionService.saveCurrentMeetingTranscriptionSession({
        ...shared.createMeetingTranscriptionSession({
          id: sessionId,
          language: 'en',
          inputLabel: 'Mic',
          now: startedAt,
          mode: 'recorder'
        }),
        status: 'stopped',
        stoppedAt: '2026-09-15T14:00:03.000Z',
        endedAt: '2026-09-15T14:00:03.000Z',
        audioBackup: {
          manifestId: backupService.getMeetingAudioBackupManifestId(sessionId),
          status: manifest.status,
          updatedAt: manifest.updatedAt
        }
      })

      const recovered = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(recovered.addedSegments, 3)
      assert.equal(recovered.report.totalChunks, 3)
      assert.equal(recovered.report.failedChunks, 0)
      assert.deepEqual(recovered.session.segments.map((segment) => segment.text), recoveredTexts)
      assert.deepEqual(recovered.session.segments.map((segment) => segment.startTime), [
        '2026-09-15T14:00:00.000Z',
        '2026-09-15T14:00:01.000Z',
        '2026-09-15T14:00:02.000Z'
      ])
      assert.deepEqual(recovered.session.segments.map((segment) => segment.endTime), [
        '2026-09-15T14:00:01.000Z',
        '2026-09-15T14:00:02.000Z',
        '2026-09-15T14:00:03.000Z'
      ])
      assert.equal(new Set(recovered.session.segments.map((segment) => segment.sourceItemId)).size, 3)

      const second = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(second.addedSegments, 0)
      assert.equal(second.report.skippedChunks, 3)
      assert.equal(fetchCount, 3)
    } finally {
      global.fetch = originalFetch
    }
  })
})

test('recovery report records failed chunks without losing successful chunks', async () => {
  await withBackupWorkspace(async ({ backupService, transcriptionService, recoveryService, shared }) => {
    const originalFetch = global.fetch
    let fetchCount = 0
    process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS = '1'
    global.fetch = async () => {
      fetchCount += 1
      if (fetchCount === 2) {
        return new Response(
          JSON.stringify({ error: { message: 'temporary STT failure' } }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ text: `recovered chunk ${fetchCount}` }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    try {
      const sessionId = 'recover-partial-failure-session'
      const startedAt = '2026-09-16T11:00:00.000Z'
      await backupService.startMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        sampleRate: 16000,
        channelCount: 1,
        now: startedAt
      })
      await backupService.appendMeetingAudioBackupChunk({
        sessionId,
        source: 'microphone',
        pcm16: new Int16Array(16000 * 3).buffer
      })
      const manifest = await backupService.stopMeetingAudioBackup({
        sessionId,
        source: 'microphone',
        now: '2026-09-16T11:00:03.000Z'
      })
      await transcriptionService.saveCurrentMeetingTranscriptionSession({
        ...shared.createMeetingTranscriptionSession({
          id: sessionId,
          language: 'en',
          inputLabel: 'Mic',
          now: startedAt,
          mode: 'recorder'
        }),
        status: 'stopped',
        stoppedAt: '2026-09-16T11:00:03.000Z',
        endedAt: '2026-09-16T11:00:03.000Z',
        audioBackup: {
          manifestId: backupService.getMeetingAudioBackupManifestId(sessionId),
          status: manifest.status,
          updatedAt: manifest.updatedAt
        }
      })

      const recovered = await recoveryService.recoverCurrentMeetingTranscriptFromBackup({ sessionId })
      assert.equal(recovered.addedSegments, 2)
      assert.equal(recovered.report.totalChunks, 3)
      assert.equal(recovered.report.recoveredSegments, 2)
      assert.equal(recovered.report.failedChunks, 1)
      assert.deepEqual(recovered.session.segments.map((segment) => segment.text), [
        'recovered chunk 1',
        'recovered chunk 3'
      ])
    } finally {
      global.fetch = originalFetch
    }
  })
})

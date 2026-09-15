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
  }
}

const withBackupWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-meeting-backup-'))
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const originalModuleLoad = Module._load
  const modulesToReset = [
    '../dist-electron/backend/services/app-state.js',
    '../dist-electron/backend/services/meeting-recording-backup-service.js',
    '../dist-electron/backend/services/meeting-transcription-service.js',
    '../dist-electron/shared/meeting-transcription.js'
  ].map((modulePath) => require.resolve(modulePath))

  for (const modulePath of modulesToReset) delete require.cache[modulePath]
  process.env.COQPI_SESSIONS_DIR = path.join(directory, 'sessions')

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') return mockElectron
    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const backupService = require('../dist-electron/backend/services/meeting-recording-backup-service.js')
    const transcriptionService = require('../dist-electron/backend/services/meeting-transcription-service.js')
    const shared = require('../dist-electron/shared/meeting-transcription.js')
    await run({ backupService, transcriptionService, shared, directory })
  } finally {
    Module._load = originalModuleLoad
    if (previousSessionsDirectory === undefined) delete process.env.COQPI_SESSIONS_DIR
    else process.env.COQPI_SESSIONS_DIR = previousSessionsDirectory
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

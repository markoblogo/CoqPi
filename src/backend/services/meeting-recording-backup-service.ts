import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type {
  MeetingAudioBackupFile,
  MeetingAudioBackupManifest,
  MeetingAudioBackupSource,
  MeetingRecordingClaim,
  MeetingRecordingClaimResult,
  MeetingRecordingClaimStage
} from '../../shared/meeting-transcription'
import { getAppInfo } from './app-state'

type AudioBackupWriter = {
  sessionId: string
  source: MeetingAudioBackupSource
  filePath: string
  handle: fs.FileHandle
  sampleRate: number
  channelCount: number
  bytesWritten: number
  claim: MeetingRecordingClaim
}

const backupRoot = () => path.join(getAppInfo().sessionsDirectory, 'audio-backups')
const backupId = (sessionId: string) => createHash('sha256').update(sessionId).digest('hex')
const backupDirectory = (sessionId: string) => path.join(backupRoot(), backupId(sessionId))
const manifestPath = (sessionId: string) => path.join(backupDirectory(sessionId), 'manifest.json')
const claimPath = (sessionId: string, stage: MeetingRecordingClaimStage) =>
  path.join(backupDirectory(sessionId), `${stage}.claim.json`)

const activeWriters = new Map<string, AudioBackupWriter>()
const writerKey = (sessionId: string, source: MeetingAudioBackupSource) =>
  `${sessionId}:${source}`

const writeAtomic = async (filePath: string, content: string) => {
  const temporaryPath = `${filePath}.tmp`
  const handle = await fs.open(temporaryPath, 'w', 0o600)
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(temporaryPath, filePath)
}

const sanitizeSessionId = (value: string) => {
  const id = value.trim()
  if (!id) throw new Error('sessionId is required.')
  return id
}

const makeWavHeader = ({
  sampleRate,
  channelCount,
  dataBytes
}: {
  sampleRate: number
  channelCount: number
  dataBytes: number
}) => {
  const header = Buffer.alloc(44)
  const bytesPerSample = 2
  const byteRate = sampleRate * channelCount * bytesPerSample
  const blockAlign = channelCount * bytesPerSample
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channelCount, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

const updateManifest = async (
  sessionId: string,
  update: (manifest: MeetingAudioBackupManifest) => MeetingAudioBackupManifest
) => {
  const current = await readMeetingAudioBackupManifest(sessionId)
  if (!current) throw new Error('Audio backup manifest is missing.')
  const next = update(current)
  await writeAtomic(manifestPath(sessionId), JSON.stringify(next, null, 2))
  return next
}

const isPidAlive = (pid: number) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const sanitizeClaim = (value: unknown): MeetingRecordingClaim | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<MeetingRecordingClaim>
  if (
    candidate.version !== 1 ||
    typeof candidate.sessionId !== 'string' ||
    (candidate.stage !== 'recording' &&
      candidate.stage !== 'transcribing' &&
      candidate.stage !== 'finalizing') ||
    typeof candidate.ownerPid !== 'number' ||
    typeof candidate.ownerStartedAt !== 'string' ||
    typeof candidate.token !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return null
  }
  return {
    version: 1,
    sessionId: candidate.sessionId,
    stage: candidate.stage,
    ownerPid: candidate.ownerPid,
    ownerStartedAt: candidate.ownerStartedAt,
    token: candidate.token,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  }
}

const makeClaim = ({
  sessionId,
  stage,
  now,
  ownerPid = process.pid,
  token = randomUUID()
}: {
  sessionId: string
  stage: MeetingRecordingClaimStage
  now: string
  ownerPid?: number
  token?: string
}): MeetingRecordingClaim => ({
  version: 1,
  sessionId,
  stage,
  ownerPid,
  ownerStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  token,
  createdAt: now,
  updatedAt: now
})

export const createMeetingAudioBackupManifest = async ({
  sessionId,
  now,
  sources,
  format = 'wav_pcm'
}: {
  sessionId: string
  now: string
  sources: MeetingAudioBackupSource[]
  format?: MeetingAudioBackupManifest['format']
}): Promise<MeetingAudioBackupManifest> => {
  const id = sanitizeSessionId(sessionId)
  const uniqueSources = [...new Set(sources.filter((source) => source === 'microphone' || source === 'system'))]
  const files: MeetingAudioBackupFile[] = uniqueSources.map((source) => ({
    source,
    relativePath: `${source}.${format === 'wav_pcm' ? 'wav' : 'caf'}`,
    status: 'open',
    startedAt: now
  }))
  const manifest: MeetingAudioBackupManifest = {
    version: 1,
    sessionId: id,
    createdAt: now,
    updatedAt: now,
    status: files.length > 0 ? 'recording' : 'unavailable',
    format,
    files,
    recoveryNote:
      files.length > 0
        ? undefined
        : 'No audio backup source was available for this session.'
  }

  await fs.mkdir(backupDirectory(id), { recursive: true })
  await writeAtomic(manifestPath(id), JSON.stringify(manifest, null, 2))
  return manifest
}

export const startMeetingAudioBackup = async ({
  sessionId,
  source,
  sampleRate,
  channelCount,
  now
}: {
  sessionId: string
  source: MeetingAudioBackupSource
  sampleRate: number
  channelCount: number
  now: string
}): Promise<{ manifest: MeetingAudioBackupManifest; directory: string }> => {
  const id = sanitizeSessionId(sessionId)
  if (source !== 'microphone' && source !== 'system') {
    throw new Error('Unsupported audio backup source.')
  }
  const safeSampleRate = Number.isFinite(sampleRate) && sampleRate > 0
    ? Math.round(sampleRate)
    : 48000
  const safeChannelCount = channelCount === 2 ? 2 : 1
  const claim = await acquireMeetingRecordingClaim({
    sessionId: id,
    stage: 'recording',
    now
  })
  if (!claim.acquired) throw new Error('Audio backup recording is already active.')

  try {
    const directory = backupDirectory(id)
    await fs.mkdir(directory, { recursive: true })
    const manifest = await createMeetingAudioBackupManifest({
      sessionId: id,
      now,
      sources: [source],
      format: 'wav_pcm'
    })
    const file = manifest.files.find((entry) => entry.source === source)
    if (!file) throw new Error('Audio backup manifest did not include source file.')
    const filePath = path.join(directory, file.relativePath)
    const handle = await fs.open(filePath, 'w+', 0o600)
    await handle.write(makeWavHeader({ sampleRate: safeSampleRate, channelCount: safeChannelCount, dataBytes: 0 }), 0, 44, 0)
    activeWriters.set(writerKey(id, source), {
      sessionId: id,
      source,
      filePath,
      handle,
      sampleRate: safeSampleRate,
      channelCount: safeChannelCount,
      bytesWritten: 0,
      claim: claim.claim
    })
    return { manifest, directory }
  } catch (error) {
    await releaseMeetingRecordingClaim(claim.claim).catch(() => undefined)
    throw error
  }
}

export const appendMeetingAudioBackupChunk = async ({
  sessionId,
  source,
  pcm16
}: {
  sessionId: string
  source: MeetingAudioBackupSource
  pcm16: ArrayBuffer | Uint8Array | Buffer
}): Promise<{ ok: true; bytesWritten: number }> => {
  const writer = activeWriters.get(writerKey(sanitizeSessionId(sessionId), source))
  if (!writer) throw new Error('Audio backup writer is not active.')
  const chunk = Buffer.isBuffer(pcm16)
    ? pcm16
    : pcm16 instanceof Uint8Array
      ? Buffer.from(pcm16)
      : Buffer.from(new Uint8Array(pcm16))
  if (chunk.byteLength === 0) return { ok: true, bytesWritten: writer.bytesWritten }
  await writer.handle.write(chunk, 0, chunk.byteLength, 44 + writer.bytesWritten)
  writer.bytesWritten += chunk.byteLength
  return { ok: true, bytesWritten: writer.bytesWritten }
}

export const stopMeetingAudioBackup = async ({
  sessionId,
  source,
  now
}: {
  sessionId: string
  source: MeetingAudioBackupSource
  now: string
}): Promise<MeetingAudioBackupManifest> => {
  const id = sanitizeSessionId(sessionId)
  const key = writerKey(id, source)
  const writer = activeWriters.get(key)
  if (!writer) {
    const existing = await readMeetingAudioBackupManifest(id)
    if (!existing) throw new Error('Audio backup writer is not active.')
    return existing
  }

  try {
    await writer.handle.write(
      makeWavHeader({
        sampleRate: writer.sampleRate,
        channelCount: writer.channelCount,
        dataBytes: writer.bytesWritten
      }),
      0,
      44,
      0
    )
    await writer.handle.sync()
  } finally {
    await writer.handle.close().catch(() => undefined)
    activeWriters.delete(key)
  }

  const content = await fs.readFile(writer.filePath)
  const sha256 = createHash('sha256').update(content).digest('hex')
  const byteLength = content.byteLength
  const next = await updateManifest(id, (manifest) => ({
    ...manifest,
    updatedAt: now,
    status: 'stopped',
    files: manifest.files.map((file) =>
      file.source === source
        ? {
            ...file,
            status: 'closed',
            endedAt: now,
            byteLength,
            sha256
          }
        : file
    )
  }))
  await releaseMeetingRecordingClaim(writer.claim)
  return next
}

export const readMeetingAudioBackupManifest = async (
  sessionId: string
): Promise<MeetingAudioBackupManifest | null> => {
  try {
    return JSON.parse(await fs.readFile(manifestPath(sanitizeSessionId(sessionId)), 'utf8'))
  } catch {
    return null
  }
}

export const getMeetingAudioBackupManifestId = (sessionId: string) =>
  backupId(sanitizeSessionId(sessionId))

export const acquireMeetingRecordingClaim = async ({
  sessionId,
  stage,
  now,
  staleAfterMs = 30 * 60 * 1000,
  ownerPid = process.pid
}: {
  sessionId: string
  stage: MeetingRecordingClaimStage
  now: string
  staleAfterMs?: number
  ownerPid?: number
}): Promise<MeetingRecordingClaimResult> => {
  const id = sanitizeSessionId(sessionId)
  const filePath = claimPath(id, stage)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const claim = makeClaim({ sessionId: id, stage, now, ownerPid })
  try {
    const handle = await fs.open(filePath, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(claim, null, 2), 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    return { acquired: true, reason: 'created', claim }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }

  let existing: MeetingRecordingClaim | null = null
  try {
    existing = sanitizeClaim(JSON.parse(await fs.readFile(filePath, 'utf8')))
  } catch {
    existing = null
  }
  if (!existing) {
    await writeAtomic(filePath, JSON.stringify(claim, null, 2))
    return { acquired: true, reason: 'recovered-stale', claim }
  }

  const ageMs = new Date(now).getTime() - new Date(existing.updatedAt).getTime()
  const stale = Number.isFinite(ageMs) && ageMs > staleAfterMs
  const ownerDead = !isPidAlive(existing.ownerPid)
  if (stale || ownerDead) {
    await writeAtomic(filePath, JSON.stringify(claim, null, 2))
    return {
      acquired: true,
      reason: ownerDead ? 'recovered-dead-owner' : 'recovered-stale',
      claim
    }
  }

  return { acquired: false, reason: 'already-held', claim: existing }
}

export const releaseMeetingRecordingClaim = async (
  claim: MeetingRecordingClaim
): Promise<boolean> => {
  const filePath = claimPath(sanitizeSessionId(claim.sessionId), claim.stage)
  let existing: MeetingRecordingClaim | null = null
  try {
    existing = sanitizeClaim(JSON.parse(await fs.readFile(filePath, 'utf8')))
  } catch {
    existing = null
  }
  if (!existing || existing.token !== claim.token) return false
  await fs.rm(filePath, { force: true })
  return true
}

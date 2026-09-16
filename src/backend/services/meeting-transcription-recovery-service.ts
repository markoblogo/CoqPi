import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type {
  MeetingTranscriptionRecoveryRequest,
  MeetingTranscriptionRecoveryReport,
  MeetingTranscriptionRecoveryResult
} from '../../shared/app-types'
import type {
  MeetingAudioBackupSource,
  MeetingTranscriptionSession
} from '../../shared/meeting-transcription'
import {
  acquireMeetingRecordingClaim,
  getMeetingAudioBackupFilePath,
  releaseMeetingRecordingClaim
} from './meeting-recording-backup-service'
import {
  getCurrentMeetingTranscriptionSession,
  saveCurrentMeetingTranscriptionSession
} from './meeting-transcription-service'
import { runGovernedProviderAction } from './governance-service'
import { resolveOpenAIApiKey } from './secret-storage-service'

const DEFAULT_RECOVERY_MODEL = 'gpt-4o-transcribe'
const DEFAULT_RECOVERY_CHUNK_SECONDS = 180
const DEFAULT_RECOVERY_SILENCE_THRESHOLD = 500
const RECOVERY_FRAME_MS = 100
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'

const getRecoveryModel = () =>
  process.env.OPENAI_AUDIO_RECOVERY_MODEL?.trim() ||
  process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() ||
  DEFAULT_RECOVERY_MODEL

const getRecoveryChunkMs = () => {
  const value = Number(process.env.COQPI_AUDIO_RECOVERY_CHUNK_SECONDS)
  const seconds = Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_RECOVERY_CHUNK_SECONDS
  return Math.max(1_000, Math.round(seconds * 1000))
}

const getRecoverySilenceThreshold = () => {
  const value = Number(process.env.COQPI_AUDIO_RECOVERY_SILENCE_THRESHOLD)
  return Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_RECOVERY_SILENCE_THRESHOLD
}

const recoverySegmentId = (
  source: MeetingAudioBackupSource,
  sha256: string,
  index: number
) => `recovered-${source}-${sha256.slice(0, 16)}-${index}`

const recoverySourceItemId = ({
  source,
  sha256,
  index,
  startOffsetMs,
  endOffsetMs
}: {
  source: MeetingAudioBackupSource
  sha256: string
  index: number
  startOffsetMs: number
  endOffsetMs: number
}) =>
  `audio-recovery:${source}:${sha256}:chunk:${index}:${startOffsetMs}-${endOffsetMs}`

const legacyRecoverySourceItemId = (
  source: MeetingAudioBackupSource,
  sha256: string
) => `audio-recovery:${source}:${sha256}`

type RecoveryAudioChunk = {
  audio: Buffer
  endOffsetMs: number
  index: number
  sourceItemId: string
  startOffsetMs: number
}

const readWavMetadata = (audio: Buffer) => {
  if (
    audio.byteLength < 44 ||
    audio.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    audio.subarray(8, 12).toString('ascii') !== 'WAVE' ||
    audio.subarray(12, 16).toString('ascii') !== 'fmt ' ||
    audio.subarray(36, 40).toString('ascii') !== 'data'
  ) {
    return null
  }

  const channelCount = audio.readUInt16LE(22)
  const sampleRate = audio.readUInt32LE(24)
  const bitsPerSample = audio.readUInt16LE(34)
  const dataBytes = audio.readUInt32LE(40)
  if (
    channelCount <= 0 ||
    sampleRate <= 0 ||
    bitsPerSample <= 0 ||
    dataBytes <= 0 ||
    44 + dataBytes > audio.byteLength
  ) {
    return null
  }

  return {
    bitsPerSample,
    channelCount,
    dataBytes,
    dataStart: 44,
    sampleRate
  }
}

const makeWavChunk = ({
  source,
  dataStart,
  dataEnd
}: {
  source: Buffer
  dataStart: number
  dataEnd: number
}) => {
  const dataBytes = Math.max(0, dataEnd - dataStart)
  const chunk = Buffer.alloc(44 + dataBytes)
  source.copy(chunk, 0, 0, 44)
  chunk.writeUInt32LE(36 + dataBytes, 4)
  chunk.writeUInt32LE(dataBytes, 40)
  source.copy(chunk, 44, dataStart, dataEnd)
  return chunk
}

const alignToBlock = (value: number, blockAlign: number) =>
  Math.max(blockAlign, Math.floor(value / blockAlign) * blockAlign)

const getFrameRms = ({
  audio,
  frameStart,
  frameEnd
}: {
  audio: Buffer
  frameStart: number
  frameEnd: number
}) => {
  let sumSquares = 0
  let sampleCount = 0
  for (let offset = frameStart; offset + 1 < frameEnd; offset += 2) {
    const sample = audio.readInt16LE(offset)
    sumSquares += sample * sample
    sampleCount += 1
  }
  return sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0
}

const findSpeechAwareBoundary = ({
  audio,
  blockAlign,
  bytesPerSecond,
  dataEnd,
  dataStart,
  preferredEnd
}: {
  audio: Buffer
  blockAlign: number
  bytesPerSecond: number
  dataEnd: number
  dataStart: number
  preferredEnd: number
}) => {
  const frameBytes = alignToBlock(
    (bytesPerSecond * RECOVERY_FRAME_MS) / 1000,
    blockAlign
  )
  const searchBytes = alignToBlock(
    (bytesPerSecond * Math.min(30_000, getRecoveryChunkMs() / 2)) / 1000,
    blockAlign
  )
  const minimumChunkBytes = alignToBlock(
    (bytesPerSecond * Math.min(500, getRecoveryChunkMs() / 3)) / 1000,
    blockAlign
  )
  const threshold = getRecoverySilenceThreshold()
  const lowerBound = Math.max(
    dataStart + minimumChunkBytes,
    preferredEnd - searchBytes
  )
  const upperBound = Math.min(dataEnd, preferredEnd + searchBytes)

  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (
    let frameStart = alignToBlock(lowerBound, blockAlign);
    frameStart + frameBytes <= upperBound;
    frameStart += frameBytes
  ) {
    const frameEnd = frameStart + frameBytes
    if (frameEnd <= dataStart || frameEnd >= dataEnd) continue
    if (getFrameRms({ audio, frameStart, frameEnd }) > threshold) continue
    const distance = Math.abs(frameEnd - preferredEnd)
    if (
      distance < bestDistance ||
      (distance === bestDistance && frameEnd < (best ?? Number.POSITIVE_INFINITY))
    ) {
      best = frameEnd
      bestDistance = distance
    }
  }

  return best ?? preferredEnd
}

const buildRecoveryAudioChunks = (
  audio: Buffer,
  sha256: string,
  source: MeetingAudioBackupSource
) => {
  const metadata = readWavMetadata(audio)
  if (!metadata) {
    return [{
      audio,
      endOffsetMs: 0,
      index: 0,
      sourceItemId: recoverySourceItemId({
        source,
        sha256,
        index: 0,
        startOffsetMs: 0,
        endOffsetMs: 0
      }),
      startOffsetMs: 0
    }]
  }

  const bytesPerSecond =
    metadata.sampleRate * metadata.channelCount * (metadata.bitsPerSample / 8)
  const blockAlign = metadata.channelCount * (metadata.bitsPerSample / 8)
  const chunkDataBytes = Math.max(
    blockAlign,
    Math.floor((bytesPerSecond * getRecoveryChunkMs()) / 1000 / blockAlign) *
      blockAlign
  )
  const dataEnd = metadata.dataStart + metadata.dataBytes
  const chunks: RecoveryAudioChunk[] = []
  let dataStart = metadata.dataStart
  let index = 0
  while (dataStart < dataEnd) {
    const preferredEnd = Math.min(dataStart + chunkDataBytes, dataEnd)
    const end = preferredEnd === dataEnd || metadata.bitsPerSample !== 16
      ? preferredEnd
      : findSpeechAwareBoundary({
          audio,
          blockAlign,
          bytesPerSecond,
          dataEnd,
          dataStart,
          preferredEnd
        })
    const startOffsetMs = Math.round(
      ((dataStart - metadata.dataStart) / bytesPerSecond) * 1000
    )
    const endOffsetMs = Math.round(
      ((end - metadata.dataStart) / bytesPerSecond) * 1000
    )
    chunks.push({
      audio: makeWavChunk({ source: audio, dataStart, dataEnd: end }),
      endOffsetMs,
      index,
      sourceItemId: recoverySourceItemId({
        source,
        sha256,
        index,
        startOffsetMs,
        endOffsetMs
      }),
      startOffsetMs
    })
    dataStart = end > dataStart ? end : preferredEnd
    index += 1
  }
  return chunks
}

const addMs = (timestamp: string, offsetMs: number) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Date(date.getTime() + offsetMs).toISOString()
}

const emptyRecoveryReport = (): MeetingTranscriptionRecoveryReport => ({
  totalChunks: 0,
  recoveredSegments: 0,
  failedChunks: 0,
  skippedChunks: 0,
  emptyChunks: 0,
  recoveredTextChars: 0,
  sources: []
})

const addSourceRecoveryReport = (
  report: MeetingTranscriptionRecoveryReport,
  source: MeetingAudioBackupSource
) => {
  const sourceReport = {
    source,
    chunks: 0,
    recoveredSegments: 0,
    failedChunks: 0,
    skippedChunks: 0,
    emptyChunks: 0,
    textChars: 0
  }
  report.sources.push(sourceReport)
  return sourceReport
}

const readRecoveryTranscript = async ({
  audio,
  filename,
  model
}: {
  audio: Buffer
  filename: string
  model: string
}) => {
  const apiKey = await resolveOpenAIApiKey()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is missing. Add it to .env or save it in Settings to recover a transcript from audio backup.'
    )
  }

  const form = new FormData()
  form.set('model', model)
  form.set('response_format', 'json')
  form.set(
    'prompt',
    'Transcribe professional conversation audio faithfully. The language may be Russian, Ukrainian, English, French, or mixed. Keep the original language and do not summarize.'
  )
  form.set(
    'file',
    new Blob([audio], { type: 'audio/wav' }),
    filename
  )

  const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Safety-Identifier': 'coqpi-local-user'
    },
    body: form,
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Backup retranscription failed (${response.status}): ${body || response.statusText}`
    )
  }

  const payload = (await response.json()) as { text?: unknown }
  return typeof payload.text === 'string' ? payload.text.trim() : ''
}

const appendRecoveredSegment = ({
  session,
  text,
  source,
  sourceItemId,
  segmentId,
  chunkIndex,
  startOffsetMs,
  endOffsetMs,
  startTime,
  endTime
}: {
  session: MeetingTranscriptionSession
  text: string
  source: MeetingAudioBackupSource
  sourceItemId: string
  segmentId: string
  chunkIndex: number
  startOffsetMs: number
  endOffsetMs: number
  startTime: string
  endTime: string
}): MeetingTranscriptionSession => ({
  ...session,
  segments: [
    ...session.segments,
    {
      id: segmentId,
      startTime,
      endTime,
      text,
      language: session.language,
      source,
      speaker: source === 'system' ? 'OTHER' : 'UNKNOWN',
      isFinal: true,
      sourceItemId,
      recovery: {
        status: 'active',
        source,
        recoveredAt: new Date().toISOString(),
        chunkIndex,
        startOffsetMs,
        endOffsetMs
      }
    }
  ],
  interim: {}
})

export const recoverCurrentMeetingTranscriptFromBackup = async (
  request: MeetingTranscriptionRecoveryRequest
): Promise<MeetingTranscriptionRecoveryResult> => {
  const session = await getCurrentMeetingTranscriptionSession()
  if (!session || session.id !== request.sessionId) {
    throw new Error('Current meeting transcription session was not found.')
  }

  const backups = (
    await Promise.all(
      (['microphone', 'system'] as const).map(async (source) => {
        const backup = await getMeetingAudioBackupFilePath({
          sessionId: request.sessionId,
          source
        })
        return backup &&
          backup.file.status === 'closed' &&
          backup.file.sha256
          ? { ...backup, source }
          : null
      })
    )
  ).filter((backup): backup is NonNullable<typeof backup> => Boolean(backup))

  if (backups.length === 0) {
    throw new Error('Closed audio backup was not found.')
  }

  const now = new Date().toISOString()
  const claim = await acquireMeetingRecordingClaim({
    sessionId: request.sessionId,
    stage: 'transcribing',
    now
  })
  if (!claim.acquired) {
    throw new Error('Backup retranscription is already running for this session.')
  }

  try {
    const model = getRecoveryModel()
    let next = session
    const report = emptyRecoveryReport()

    for (const backup of backups) {
      const content = await fs.readFile(backup.filePath)
      const sha256 = createHash('sha256').update(content).digest('hex')
      if (sha256 !== backup.file.sha256) {
        throw new Error(`${backup.source} audio backup hash does not match its manifest.`)
      }

      if (
        session.segments.some(
          (segment) =>
            segment.sourceItemId === legacyRecoverySourceItemId(backup.source, sha256)
        )
      ) {
        continue
      }

      const sourceReport = addSourceRecoveryReport(report, backup.source)
      const allChunks = buildRecoveryAudioChunks(content, sha256, backup.source)
      const chunks = allChunks.filter(
        (chunk) => !next.segments.some((segment) => segment.sourceItemId === chunk.sourceItemId)
      )
      sourceReport.chunks = allChunks.length
      sourceReport.skippedChunks = allChunks.length - chunks.length
      report.totalChunks += allChunks.length
      report.skippedChunks += sourceReport.skippedChunks

      for (const chunk of chunks) {
        let text = ''
        try {
          text = await runGovernedProviderAction(
            {
              kind: 'realtime_transcription',
              provider: 'openai',
              model,
              external: true,
              toolRisk: 'read_only'
            },
            () => readRecoveryTranscript({
              audio: chunk.audio,
              filename: `${backup.source}-${String(chunk.index + 1).padStart(3, '0')}.wav`,
              model
            })
          )
        } catch {
          sourceReport.failedChunks += 1
          report.failedChunks += 1
          continue
        }

        if (!text) {
          sourceReport.emptyChunks += 1
          report.emptyChunks += 1
          continue
        }

        sourceReport.recoveredSegments += 1
        sourceReport.textChars += text.length
        report.recoveredSegments += 1
        report.recoveredTextChars += text.length
        next = appendRecoveredSegment({
          session: next,
          text,
          source: backup.source,
          sourceItemId: chunk.sourceItemId,
          segmentId: recoverySegmentId(backup.source, sha256, chunk.index),
          chunkIndex: chunk.index,
          startOffsetMs: chunk.startOffsetMs,
          endOffsetMs: chunk.endOffsetMs,
          startTime: addMs(backup.file.startedAt || session.startedAt, chunk.startOffsetMs),
          endTime: addMs(backup.file.startedAt || session.startedAt, chunk.endOffsetMs)
        })
      }
    }

    if (report.totalChunks === 0 || report.skippedChunks === report.totalChunks) {
      return {
        ok: true,
        session,
        addedSegments: 0,
        recoveredTextChars: 0,
        report,
        message: 'Backup transcript was already recovered.'
      }
    }

    if (report.recoveredSegments === 0) {
      return {
        ok: true,
        session,
        addedSegments: 0,
        recoveredTextChars: 0,
        report,
        message: 'Backup retranscription returned no text.'
      }
    }

    await saveCurrentMeetingTranscriptionSession(next)

    return {
      ok: true,
      session: next,
      addedSegments: report.recoveredSegments,
      recoveredTextChars: report.recoveredTextChars,
      report,
      message: `Recovered ${report.recoveredSegments} segment${report.recoveredSegments === 1 ? '' : 's'} from ${backups.map((backup) => backup.source).join(' + ')} audio backup${report.failedChunks > 0 ? `; ${report.failedChunks} chunk${report.failedChunks === 1 ? '' : 's'} failed` : ''}.`
    }
  } finally {
    await releaseMeetingRecordingClaim(claim.claim).catch(() => undefined)
  }
}

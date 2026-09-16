import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type {
  MeetingTranscriptionRecoveryRequest,
  MeetingTranscriptionRecoveryResult
} from '../../shared/app-types'
import type { MeetingTranscriptionSession } from '../../shared/meeting-transcription'
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

const recoverySegmentId = (sha256: string, index: number) =>
  `recovered-microphone-${sha256.slice(0, 16)}-${index}`

const recoverySourceItemId = ({
  sha256,
  index,
  startOffsetMs,
  endOffsetMs
}: {
  sha256: string
  index: number
  startOffsetMs: number
  endOffsetMs: number
}) =>
  `audio-recovery:microphone:${sha256}:chunk:${index}:${startOffsetMs}-${endOffsetMs}`

const legacyRecoverySourceItemId = (sha256: string) =>
  `audio-recovery:microphone:${sha256}`

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

const buildRecoveryAudioChunks = (audio: Buffer, sha256: string) => {
  const metadata = readWavMetadata(audio)
  if (!metadata) {
    return [{
      audio,
      endOffsetMs: 0,
      index: 0,
      sourceItemId: recoverySourceItemId({
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
  sourceItemId,
  segmentId,
  startTime,
  endTime
}: {
  session: MeetingTranscriptionSession
  text: string
  sourceItemId: string
  segmentId: string
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
      source: 'microphone',
      speaker: 'UNKNOWN',
      isFinal: true,
      sourceItemId
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

  const backup = await getMeetingAudioBackupFilePath({
    sessionId: request.sessionId,
    source: 'microphone'
  })
  if (!backup || backup.file.status !== 'closed' || !backup.file.sha256) {
    throw new Error('Closed microphone audio backup was not found.')
  }

  const content = await fs.readFile(backup.filePath)
  const sha256 = createHash('sha256').update(content).digest('hex')
  if (sha256 !== backup.file.sha256) {
    throw new Error('Microphone audio backup hash does not match its manifest.')
  }

  if (session.segments.some((segment) => segment.sourceItemId === legacyRecoverySourceItemId(sha256))) {
    return {
      ok: true,
      session,
      addedSegments: 0,
      recoveredTextChars: 0,
      message: 'Backup transcript was already recovered.'
    }
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
    const chunks = buildRecoveryAudioChunks(content, sha256).filter(
      (chunk) => !session.segments.some((segment) => segment.sourceItemId === chunk.sourceItemId)
    )

    if (chunks.length === 0) {
      return {
        ok: true,
        session,
        addedSegments: 0,
        recoveredTextChars: 0,
        message: 'Backup transcript was already recovered.'
      }
    }

    let next = session
    let addedSegments = 0
    let recoveredTextChars = 0
    for (const chunk of chunks) {
      const text = await runGovernedProviderAction(
        {
          kind: 'realtime_transcription',
          provider: 'openai',
          model,
          external: true,
          toolRisk: 'read_only'
        },
        () => readRecoveryTranscript({
          audio: chunk.audio,
          filename: `microphone-${String(chunk.index + 1).padStart(3, '0')}.wav`,
          model
        })
      )
      if (!text) continue

      addedSegments += 1
      recoveredTextChars += text.length
      next = appendRecoveredSegment({
        session: next,
        text,
        sourceItemId: chunk.sourceItemId,
        segmentId: recoverySegmentId(sha256, chunk.index),
        startTime: addMs(backup.file.startedAt || session.startedAt, chunk.startOffsetMs),
        endTime: addMs(backup.file.startedAt || session.startedAt, chunk.endOffsetMs)
      })
    }

    if (addedSegments === 0) {
      return {
        ok: true,
        session,
        addedSegments: 0,
        recoveredTextChars: 0,
        message: 'Backup retranscription returned no text.'
      }
    }

    await saveCurrentMeetingTranscriptionSession(next)

    return {
      ok: true,
      session: next,
      addedSegments,
      recoveredTextChars,
      message: 'Recovered transcript from microphone audio backup.'
    }
  } finally {
    await releaseMeetingRecordingClaim(claim.claim).catch(() => undefined)
  }
}

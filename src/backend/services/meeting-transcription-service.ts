import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  MeetingTranscriptionExportRequest,
  MeetingTranscriptionExportResult,
  MeetingTranscriptionSaveResult
} from '../../shared/app-types'
import {
  exportMeetingTranscriptMarkdown,
  exportMeetingTranscriptText,
  generateMeetingTranscriptFilename,
  type MeetingTranscriptionLanguage,
  type MeetingTranscriptionMode,
  type MeetingTranscriptionSource,
  type MeetingTranscriptionSession
} from '../../shared/meeting-transcription'
import { getAppInfo } from './app-state'

const getCurrentMeetingTranscriptionPath = () =>
  path.join(getAppInfo().sessionsDirectory, 'meeting-transcription-current.json')

const getMeetingTranscriptionJournalPath = () =>
  path.join(getAppInfo().sessionsDirectory, 'meeting-transcription-journal.ndjson')

let saveQueue = Promise.resolve()

const writeAtomic = async (filePath: string, content: string) => {
  const temporaryPath = `${filePath}.tmp`
  await fs.writeFile(temporaryPath, content, 'utf8')
  await fs.rename(temporaryPath, filePath)
}

const sanitizeLanguage = (value: unknown): MeetingTranscriptionLanguage => {
  return value === 'ru' || value === 'en' || value === 'fr' ? value : 'uk'
}

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const sanitizeSource = (value: unknown): MeetingTranscriptionSource =>
  value === 'microphone' || value === 'system' ? value : 'unknown'

const sanitizeSession = (value: unknown): MeetingTranscriptionSession | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<MeetingTranscriptionSession>
  const segments: MeetingTranscriptionSession['segments'] = []
  const interim: MeetingTranscriptionSession['interim'] = {}

  if (Array.isArray(candidate.segments)) {
    for (const segment of candidate.segments) {
      if (!segment || typeof segment !== 'object') {
        continue
      }

      const entry = segment as Partial<
        MeetingTranscriptionSession['segments'][number]
      >
      const text = sanitizeText(entry.text)
      const startTime = sanitizeText(entry.startTime)

      if (!text || !startTime) {
        continue
      }

      segments.push({
        id: sanitizeText(entry.id) || `segment-${startTime}`,
        startTime,
        endTime: sanitizeText(entry.endTime) || undefined,
        text,
        source: sanitizeSource(entry.source),
        translatedText: sanitizeText(entry.translatedText) || undefined,
        confidence:
          typeof entry.confidence === 'number' &&
          Number.isFinite(entry.confidence)
            ? Math.max(0, Math.min(1, entry.confidence))
            : undefined,
        speaker: sanitizeText(entry.speaker) || undefined,
        isFinal: true as const,
        sourceItemId: sanitizeText(entry.sourceItemId) || undefined
      })
    }
  }

  if (candidate.interim && typeof candidate.interim === 'object') {
    for (const [itemId, value] of Object.entries(candidate.interim)) {
      if (!value || typeof value !== 'object') continue
      const entry = value as Partial<MeetingTranscriptionSession['interim'][string]>
      const text = sanitizeText(entry.text)
      const startTime = sanitizeText(entry.startTime)
      const updatedAt = sanitizeText(entry.updatedAt)
      if (!text || !startTime || !updatedAt) continue
      interim[itemId] = { itemId, text, startTime, updatedAt }
    }
  }

  const id = sanitizeText(candidate.id)
  const startedAt = sanitizeText(candidate.startedAt)

  if (!id || !startedAt) {
    return null
  }

  return {
    id,
    language: sanitizeLanguage(candidate.language),
    inputLabel: sanitizeText(candidate.inputLabel),
    mode:
      candidate.mode === 'copilot' || candidate.mode === 'recorder'
        ? (candidate.mode as MeetingTranscriptionMode)
        : 'recorder',
    scenario: sanitizeText(candidate.scenario) || undefined,
    startedAt,
    stoppedAt: sanitizeText(candidate.stoppedAt) || undefined,
    endedAt: sanitizeText(candidate.endedAt) || undefined,
    status:
      candidate.status === 'recording' ||
      candidate.status === 'stopped' ||
      candidate.status === 'error'
        ? candidate.status
        : 'idle',
    segments,
    interim
  }
}

export const getCurrentMeetingTranscriptionSession =
  async (): Promise<MeetingTranscriptionSession | null> => {
    try {
      const raw = await fs.readFile(getCurrentMeetingTranscriptionPath(), 'utf8')
      return sanitizeSession(JSON.parse(raw))
    } catch {
      try {
        const journal = await fs.readFile(
          getMeetingTranscriptionJournalPath(),
          'utf8'
        )
        const entries = journal.trim().split('\n').reverse()
        for (const entry of entries) {
          try {
            const session = sanitizeSession(JSON.parse(entry).session)
            if (session) return session
          } catch {
            // Ignore a truncated final journal record and try the previous one.
          }
        }
      } catch {
        // No recoverable local transcript exists.
      }
      return null
    }
  }

export const saveCurrentMeetingTranscriptionSession = async (
  session: MeetingTranscriptionSession
): Promise<MeetingTranscriptionSaveResult> => {
  const sanitized = sanitizeSession(session)

  if (!sanitized) {
    throw new Error('Invalid meeting transcription session.')
  }

  const filePath = getCurrentMeetingTranscriptionPath()
  const journalPath = getMeetingTranscriptionJournalPath()
  const serialized = JSON.stringify(sanitized, null, 2)
  const journalEntry = `${JSON.stringify({
    savedAt: new Date().toISOString(),
    session: sanitized
  })}\n`

  saveQueue = saveQueue.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.appendFile(journalPath, journalEntry, 'utf8')
    await writeAtomic(filePath, serialized)
  })
  await saveQueue

  return { ok: true }
}

export const clearCurrentMeetingTranscriptionSession =
  async (): Promise<MeetingTranscriptionSaveResult> => {
    saveQueue = saveQueue.then(async () => {
      await fs.rm(getCurrentMeetingTranscriptionPath(), { force: true })
      await fs.rm(getMeetingTranscriptionJournalPath(), { force: true })
    })
    await saveQueue
    return { ok: true }
  }

export const flushMeetingTranscriptionWrites = async () => {
  await saveQueue
}

export const writeMeetingTranscriptExport = async (
  request: MeetingTranscriptionExportRequest,
  filePath: string
): Promise<MeetingTranscriptionExportResult> => {
  const sanitized = sanitizeSession(request.session)

  if (!sanitized) {
    throw new Error('Invalid meeting transcription session.')
  }

  const content =
    request.format === 'txt'
      ? exportMeetingTranscriptText(sanitized)
      : exportMeetingTranscriptMarkdown(sanitized)

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')

  return {
    canceled: false,
    filePath
  }
}

export const getMeetingTranscriptDefaultFilename = (
  request: MeetingTranscriptionExportRequest
) => generateMeetingTranscriptFilename(request.session, request.format)

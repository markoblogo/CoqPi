import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
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
let lastPersisted: MeetingTranscriptionSession | null = null
let lastPersistedPath = ''
const archiveDirectory = () => path.join(getAppInfo().sessionsDirectory, 'recordings')
const archivePath = (id: string) => path.join(archiveDirectory(), `${createHash('sha256').update(id).digest('hex')}.json`)

const enqueueWrite = (write: () => Promise<void>) => {
  const operation = saveQueue.catch(() => undefined).then(write)
  saveQueue = operation
  return operation
}

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
        language: entry.language ? sanitizeLanguage(entry.language) : undefined,
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
    assistantEvents: Array.isArray(candidate.assistantEvents) ? candidate.assistantEvents
      .filter(event => event && typeof event.timestamp === 'string' && typeof event.answer === 'string')
      .map(event => ({ timestamp: event.timestamp, answer: event.answer, meaning: sanitizeText(event.meaning), model: sanitizeText(event.model), latencyMs: typeof event.latencyMs === 'number' ? event.latencyMs : undefined, language: sanitizeText(event.language) })) : [],
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
    let recovered: MeetingTranscriptionSession | null = null
    try {
      const raw = await fs.readFile(getCurrentMeetingTranscriptionPath(), 'utf8')
      recovered = sanitizeSession(JSON.parse(raw))
    } catch { /* Recover from the durable journal below. */ }
    try {
        const journal = await fs.readFile(
          getMeetingTranscriptionJournalPath(),
          'utf8'
        )
        const entries = journal.trim().split('\n')
        for (const entry of entries) {
          try {
            const record = JSON.parse(entry)
            if (record.session) recovered = sanitizeSession(record.session) ?? recovered
            else if (record.patch && recovered && recovered.id === record.patch.id) {
              const byId = new Map(recovered.segments.map(segment => [segment.id, segment]))
              for (const segment of record.patch.segments ?? []) byId.set(segment.id, segment)
              recovered = sanitizeSession({ ...recovered, ...record.patch, segments: [...byId.values()] })
            }
          } catch {
            // Ignore a truncated final journal record and try the previous one.
          }
        }
    } catch { /* A snapshot can still be used without a journal. */ }
    return recovered
  }

export const getMeetingTranscriptionHistory = async () => {
  await saveQueue.catch(() => undefined)
  const names = await fs.readdir(archiveDirectory()).catch(() => [])
  const sessions = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => {
    try { return sanitizeSession(JSON.parse(await fs.readFile(path.join(archiveDirectory(), name), 'utf8'))) }
    catch { return null }
  }))
  return sessions.filter((session): session is MeetingTranscriptionSession => session !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(({ id, startedAt, endedAt, language, mode, segments }) => ({ id, startedAt, endedAt, language, mode, segmentCount: segments.length }))
}

export const getArchivedMeetingTranscriptionSession = async (id: string) =>
  sanitizeSession(JSON.parse(await fs.readFile(archivePath(id), 'utf8')))

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
  await enqueueWrite(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.mkdir(archiveDirectory(), { recursive: true })
    const previous = lastPersistedPath === filePath ? lastPersisted : null
    const sameSession = previous?.id === sanitized.id
    const previousSegments = new Map(previous?.segments.map(segment => [segment.id, JSON.stringify(segment)]))
    const record = sameSession ? { patch: {
      ...sanitized,
      segments: sanitized.segments.filter(segment => previousSegments.get(segment.id) !== JSON.stringify(segment))
    } } : { session: sanitized }
    const handle = await fs.open(journalPath, 'a', 0o600)
    try {
      await handle.writeFile(`\n${JSON.stringify(record)}\n`, 'utf8')
      await handle.sync()
    } finally { await handle.close() }
    await writeAtomic(archivePath(sanitized.id), serialized)
    await writeAtomic(filePath, serialized)
    lastPersisted = sanitized
    lastPersistedPath = filePath
  })

  return { ok: true }
}

export const clearCurrentMeetingTranscriptionSession =
  async (): Promise<MeetingTranscriptionSaveResult> => {
    await enqueueWrite(async () => {
      const current = await getCurrentMeetingTranscriptionSession()
      if (current) {
        await fs.mkdir(archiveDirectory(), { recursive: true })
        await writeAtomic(archivePath(current.id), JSON.stringify(current, null, 2))
      }
      await fs.rm(getCurrentMeetingTranscriptionPath(), { force: true })
      await fs.rm(getMeetingTranscriptionJournalPath(), { force: true })
      lastPersisted = null
    })
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

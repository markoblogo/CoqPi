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
  type MeetingTranscriptionSession
} from '../../shared/meeting-transcription'
import { getAppInfo } from './app-state'

const getCurrentMeetingTranscriptionPath = () =>
  path.join(getAppInfo().sessionsDirectory, 'meeting-transcription-current.json')

const sanitizeLanguage = (value: unknown): MeetingTranscriptionLanguage => {
  return value === 'ru' || value === 'en' || value === 'fr' ? value : 'uk'
}

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const sanitizeSession = (value: unknown): MeetingTranscriptionSession | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<MeetingTranscriptionSession>
  const segments: MeetingTranscriptionSession['segments'] = []

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
        speaker: sanitizeText(entry.speaker) || undefined,
        isFinal: true as const,
        sourceItemId: sanitizeText(entry.sourceItemId) || undefined
      })
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
    startedAt,
    stoppedAt: sanitizeText(candidate.stoppedAt) || undefined,
    status:
      candidate.status === 'recording' ||
      candidate.status === 'stopped' ||
      candidate.status === 'error'
        ? candidate.status
        : 'idle',
    segments,
    interim: {}
  }
}

export const getCurrentMeetingTranscriptionSession =
  async (): Promise<MeetingTranscriptionSession | null> => {
    try {
      const raw = await fs.readFile(getCurrentMeetingTranscriptionPath(), 'utf8')
      return sanitizeSession(JSON.parse(raw))
    } catch {
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
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2), 'utf8')

  return { ok: true }
}

export const clearCurrentMeetingTranscriptionSession =
  async (): Promise<MeetingTranscriptionSaveResult> => {
    await fs.rm(getCurrentMeetingTranscriptionPath(), { force: true })
    return { ok: true }
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

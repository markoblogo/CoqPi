import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  SmokeTestNote,
  SmokeTestNoteDraft,
  SmokeTestNotesResult
} from '../../shared/app-types'
import { getAppInfo } from './app-state'

const MAX_FIELD_CHARS = 1200
const MAX_LABEL_CHARS = 180

const getSmokeNotesPath = () =>
  path.join(getAppInfo().sessionsDirectory, 'smoke-notes.jsonl')

const sanitizeText = (value: unknown, maxLength = MAX_FIELD_CHARS) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const sanitizeDraft = (draft: SmokeTestNoteDraft): SmokeTestNoteDraft => ({
  worked: sanitizeText(draft.worked),
  broken: sanitizeText(draft.broken),
  nextFix: sanitizeText(draft.nextFix),
  sessionLabel: sanitizeText(draft.sessionLabel, MAX_LABEL_CHARS),
  selectedPackLabel: sanitizeText(draft.selectedPackLabel, MAX_LABEL_CHARS)
})

const parseNoteLine = (line: string): SmokeTestNote | null => {
  try {
    const parsed = JSON.parse(line) as Partial<SmokeTestNote>

    if (
      parsed.version !== 1 ||
      typeof parsed.id !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.worked !== 'string' ||
      typeof parsed.broken !== 'string' ||
      typeof parsed.nextFix !== 'string'
    ) {
      return null
    }

    return {
      version: 1,
      id: parsed.id,
      createdAt: parsed.createdAt,
      worked: parsed.worked,
      broken: parsed.broken,
      nextFix: parsed.nextFix,
      sessionLabel:
        typeof parsed.sessionLabel === 'string' ? parsed.sessionLabel : '',
      selectedPackLabel:
        typeof parsed.selectedPackLabel === 'string'
          ? parsed.selectedPackLabel
          : ''
    }
  } catch {
    return null
  }
}

export const saveSmokeTestNote = async (
  draft: SmokeTestNoteDraft
): Promise<SmokeTestNote> => {
  const sanitized = sanitizeDraft(draft)

  if (!sanitized.worked && !sanitized.broken && !sanitized.nextFix) {
    throw new Error('Add at least one smoke test note before saving.')
  }

  const note: SmokeTestNote = {
    version: 1,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...sanitized
  }
  const filePath = getSmokeNotesPath()

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, `${JSON.stringify(note)}\n`, 'utf8')

  return note
}

export const getSmokeTestNotes = async (
  limit = 5
): Promise<SmokeTestNotesResult> => {
  try {
    const raw = await fs.readFile(getSmokeNotesPath(), 'utf8')
    const notes = raw
      .split('\n')
      .filter(Boolean)
      .map(parseNoteLine)
      .filter((note): note is SmokeTestNote => Boolean(note))
      .slice(-Math.max(1, limit))
      .reverse()

    return { notes }
  } catch {
    return { notes: [] }
  }
}

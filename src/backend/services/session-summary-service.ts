import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  SessionSummary,
  SessionSummaryDraft,
  SessionSummariesResult
} from '../../shared/app-types'
import { getAppInfo } from './app-state'

const MAX_FIELD_CHARS = 1200
const MAX_LABEL_CHARS = 180
const MAX_LIST_ITEMS = 6

const getSessionSummariesPath = () =>
  path.join(getAppInfo().personalKnowledgeCoreDirectory, 'session-summaries.jsonl')

const sanitizeText = (value: unknown, maxLength = MAX_FIELD_CHARS) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const sanitizeStringArray = (value: unknown, maxItems = MAX_LIST_ITEMS) =>
  Array.isArray(value)
    ? [...new Set(value.map((item) => sanitizeText(item)).filter(Boolean))].slice(
        0,
        maxItems
      )
    : []

const sanitizeSessionSummaryDraft = (
  draft: SessionSummaryDraft
): SessionSummaryDraft => ({
  sourceId: sanitizeText(draft.sourceId, MAX_LABEL_CHARS),
  partnerName: sanitizeText(draft.partnerName, MAX_LABEL_CHARS),
  title: sanitizeText(draft.title, MAX_LABEL_CHARS),
  summary: sanitizeText(draft.summary),
  agenda: sanitizeStringArray(draft.agenda, 5),
  confirmedOutcomes: sanitizeStringArray(draft.confirmedOutcomes),
  followUps: sanitizeStringArray(draft.followUps),
  risks: sanitizeStringArray(draft.risks),
  sessionLabel: sanitizeText(draft.sessionLabel, MAX_LABEL_CHARS),
  selectedCounterpartyPackIds: sanitizeStringArray(
    draft.selectedCounterpartyPackIds,
    12
  ),
  selectedFinderOutreachDraftId: sanitizeText(
    draft.selectedFinderOutreachDraftId,
    MAX_LABEL_CHARS
  )
})

const parseSummaryLine = (line: string): SessionSummary | null => {
  try {
    const parsed = JSON.parse(line) as Partial<SessionSummary>

    if (
      parsed.version !== 1 ||
      typeof parsed.id !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.confirmedAt !== 'string' ||
      typeof parsed.sourceId !== 'string' ||
      typeof parsed.partnerName !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.summary !== 'string'
    ) {
      return null
    }

    return {
      version: 1,
      id: parsed.id,
      createdAt: parsed.createdAt,
      confirmedAt: parsed.confirmedAt,
      agenda: sanitizeStringArray(parsed.agenda, 5),
      sourceId: parsed.sourceId,
      partnerName: parsed.partnerName,
      title: parsed.title,
      summary: parsed.summary,
      confirmedOutcomes: sanitizeStringArray(parsed.confirmedOutcomes),
      followUps: sanitizeStringArray(parsed.followUps),
      risks: sanitizeStringArray(parsed.risks),
      sessionLabel: sanitizeText(parsed.sessionLabel, MAX_LABEL_CHARS),
      selectedCounterpartyPackIds: sanitizeStringArray(
        parsed.selectedCounterpartyPackIds,
        12
      ),
      selectedFinderOutreachDraftId: sanitizeText(
        parsed.selectedFinderOutreachDraftId,
        MAX_LABEL_CHARS
      )
    }
  } catch {
    return null
  }
}

export const saveSessionSummary = async (
  draft: SessionSummaryDraft
): Promise<SessionSummary> => {
  const sanitized = sanitizeSessionSummaryDraft(draft)

  if (!sanitized.sourceId || !sanitized.partnerName || !sanitized.title) {
    throw new Error('Session summary requires sourceId, partnerName, and title.')
  }

  if (
    !sanitized.summary &&
    (sanitized.confirmedOutcomes?.length ?? 0) === 0 &&
    (sanitized.followUps?.length ?? 0) === 0 &&
    (sanitized.risks?.length ?? 0) === 0
  ) {
    throw new Error('Add at least a summary, outcome, follow-up, or risk.')
  }

  const now = new Date().toISOString()
  const summary: SessionSummary = {
    version: 1,
    id: randomUUID(),
    createdAt: now,
    confirmedAt: now,
    sourceId: sanitized.sourceId,
    partnerName: sanitized.partnerName,
    title: sanitized.title,
    summary: sanitized.summary,
    agenda: sanitized.agenda ?? [],
    confirmedOutcomes: sanitized.confirmedOutcomes ?? [],
    followUps: sanitized.followUps ?? [],
    risks: sanitized.risks ?? [],
    sessionLabel: sanitized.sessionLabel ?? '',
    selectedCounterpartyPackIds: sanitized.selectedCounterpartyPackIds ?? [],
    selectedFinderOutreachDraftId: sanitized.selectedFinderOutreachDraftId ?? ''
  }

  const filePath = getSessionSummariesPath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, `${JSON.stringify(summary)}\n`, 'utf8')

  return summary
}

export const getSessionSummaries = async ({
  limit = 20,
  sourceId = ''
}: {
  limit?: number
  sourceId?: string
} = {}): Promise<SessionSummariesResult> => {
  try {
    const raw = await fs.readFile(getSessionSummariesPath(), 'utf8')
    const normalizedSourceId = sanitizeText(sourceId, MAX_LABEL_CHARS)
    const summaries = raw
      .split('\n')
      .filter(Boolean)
      .map(parseSummaryLine)
      .filter((summary): summary is SessionSummary => Boolean(summary))
      .filter((summary) =>
        normalizedSourceId ? summary.sourceId === normalizedSourceId : true
      )
      .slice(-Math.max(1, limit))
      .reverse()

    return { summaries }
  } catch {
    return { summaries: [] }
  }
}

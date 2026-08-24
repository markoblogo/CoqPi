import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  SimpleAssistantScenarioId,
  TrainingSessionEntry,
  TrainingSessionResult
} from '../../shared/app-types'
import { simpleAssistantScenarioIds } from '../../shared/app-types'
import { getSimpleAssistantTrainingDirectory } from './app-state'

const trainingFileName = 'sessions.json'

const getTrainingFilePath = () =>
  path.join(getSimpleAssistantTrainingDirectory(), trainingFileName)

const sanitizeEntry = (value: unknown): TrainingSessionEntry | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<TrainingSessionEntry>
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.scenarioId !== 'string' ||
    typeof candidate.transcriptText !== 'string' ||
    typeof candidate.answerText !== 'string' ||
    typeof candidate.answerMeaningRu !== 'string' ||
    !simpleAssistantScenarioIds.includes(
      candidate.scenarioId as SimpleAssistantScenarioId
    )
  ) {
    return null
  }

  return {
    id: candidate.id,
    ...(typeof candidate.sessionId === 'string'
      ? { sessionId: candidate.sessionId }
      : {}),
    createdAt: candidate.createdAt,
    scenarioId: candidate.scenarioId as SimpleAssistantScenarioId,
    ...(candidate.language === 'en' || candidate.language === 'fr'
      ? { language: candidate.language }
      : {}),
    transcriptText: candidate.transcriptText,
    ...(candidate.source ? { source: candidate.source } : {}),
    ...(candidate.speaker ? { speaker: candidate.speaker } : {}),
    answerText: candidate.answerText,
    answerMeaningRu: candidate.answerMeaningRu,
    feedback:
      candidate.feedback === 'true' || candidate.feedback === 'false'
        ? candidate.feedback
        : null,
    mode: candidate.mode === 'legacy' ? 'legacy' : 'simple',
    ...(typeof candidate.manualCorrectedAnswer === 'string'
      ? { manualCorrectedAnswer: candidate.manualCorrectedAnswer }
      : {}),
    ...(typeof candidate.latencyMs === 'number'
      ? { latencyMs: candidate.latencyMs }
      : {}),
    ...(typeof candidate.model === 'string' ? { model: candidate.model } : {}),
    ...(typeof candidate.promptVersion === 'string'
      ? { promptVersion: candidate.promptVersion }
      : {}),
    ...(typeof candidate.requestStartedAt === 'string'
      ? { requestStartedAt: candidate.requestStartedAt }
      : {}),
    ...(typeof candidate.responseCompletedAt === 'string'
      ? { responseCompletedAt: candidate.responseCompletedAt }
      : {})
  }
}

export const getTrainingSessions = async (): Promise<TrainingSessionResult> => {
  try {
    const raw = await fs.readFile(getTrainingFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const sessions = Array.isArray(parsed)
      ? parsed
          .map(sanitizeEntry)
          .filter((entry): entry is TrainingSessionEntry => entry !== null)
      : []

    return { sessions }
  } catch {
    return { sessions: [] }
  }
}

export const saveTrainingSession = async (
  entry: TrainingSessionEntry
): Promise<TrainingSessionResult> => {
  const current = await getTrainingSessions()
  const next = [entry, ...current.sessions].slice(0, 500)
  const filePath = getTrainingFilePath()

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')

  return { sessions: next }
}

import type { CallLanguage } from '@shared/app-types'
import {
  getMockTranscriptScenarioLines,
  mockTranscriptScenarios,
  type MockTranscriptLine,
  type MockTranscriptScenarioId
} from '@shared/mock-transcript-scenarios'

export type { MockTranscriptLine, MockTranscriptScenarioId }
export { mockTranscriptScenarios }

const cycleIndexes = new Map<string, number>()

export const getNextMockTranscriptLine = (
  language: CallLanguage,
  scenarioId: MockTranscriptScenarioId = 'default'
) => {
  const lines = getMockTranscriptScenarioLines(language, scenarioId)

  if (lines.length === 0) {
    throw new Error(
      `Mock scenario "${scenarioId}" has no lines for ${language}. Select Auto or another scenario.`
    )
  }

  const key = `${scenarioId}:${language}`
  const nextIndex = cycleIndexes.get(key) ?? 0

  cycleIndexes.set(key, nextIndex + 1)

  return lines[nextIndex % lines.length]
}

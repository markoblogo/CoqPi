import type {
  AssistantAnalysisMode,
  AssistantAnswerLanguage,
  AssistantCallLanguage,
  AssistantRecentWindowLabel,
  SimpleAssistantScenarioId
} from './app-types'

export interface SimpleAssistantPromptInput {
  transcriptText: string
  profileMarkdown: string
  scenarioMarkdown: string
  scenarioId: SimpleAssistantScenarioId
  callLanguage: AssistantCallLanguage
  answerLanguage: AssistantAnswerLanguage
  mode: AssistantAnalysisMode
  recentWindowLabel: AssistantRecentWindowLabel
}

const compactTranscript = (value: string, limit: number) =>
  value.trim().slice(0, limit)

export const buildSimpleAssistantPrompt = (
  input: SimpleAssistantPromptInput
) => {
  const sections = [
    'Context mode: simple markdown',
    `Scenario: ${input.scenarioId}`,
    `Call language: ${input.callLanguage}`,
    `Answer language: ${input.answerLanguage}`,
    `Recent window: ${input.recentWindowLabel}`,
    '',
    'User profile markdown:',
    input.profileMarkdown,
    '',
    'Scenario markdown:',
    input.scenarioMarkdown,
    '',
    'Recent transcript:',
    compactTranscript(input.transcriptText, 5000),
    '',
    'Instructions:',
    '- Return only JSON matching the assistant schema.',
    '- Give one short, natural, speakable answer in the requested language.',
    '- Keep that answer normally under 25 words and never return more than one answer.',
    '- Keep meaningRu and detectedQuestion short.',
    '- Do not invent facts absent from the profile or scenario.',
    '- If the question is unclear, use one concise clarifying answer.',
    input.mode === 'keywords'
      ? '- Keywords mode: return 5-8 useful keywords and keep the answer minimal.'
      : '- Full mode: return exactly one suggested answer.'
  ]

  return sections.join('\n')
}

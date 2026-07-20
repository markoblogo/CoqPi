import OpenAI from 'openai'
import type {
  AssistantCostMode,
  AssistantAnalysisRequest,
  AssistantAnalysisResult,
  SessionContext,
  SuggestedAnswer
} from '../../shared/app-types'
import { PROFILE_CONTEXT_CHARS_LIMIT_BY_MODE } from '../../shared/cost-estimator'
import { getProfileContext } from './profile-service'
import { getPersonalInterviewRetrieval } from './context-source-service'
import { resolveOpenAIApiKey } from './secret-storage-service'
import { runGovernedProviderAction } from './governance-service'
import {
  DEFAULT_OPENAI_ASSISTANT_MODEL,
  interviewAssistantSystemPrompt
} from '../prompts/interview-assistant-prompt'
import {
  getPrimaryOpenAIProviderProfile,
} from './assistant-provider-profile'

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meaningRu: { type: 'string' },
    detectedQuestion: { type: 'string' },
    intent: { type: 'string' },
    risk: { type: 'string' },
    suggestedAnswers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: {
            type: 'string',
            enum: ['short', 'strong', 'clarifying']
          },
          text: { type: 'string' },
          answerMeaningRu: { type: 'string' }
        },
        required: ['label', 'text', 'answerMeaningRu']
      }
    },
    keywordsToRemember: {
      type: 'array',
      items: { type: 'string' }
    },
    openingPhrase: { type: 'string' }
  },
  required: [
    'meaningRu',
    'detectedQuestion',
    'intent',
    'risk',
    'suggestedAnswers',
    'keywordsToRemember',
    'openingPhrase'
  ]
} as const

const getAssistantModel = (costMode: AssistantCostMode, providerModel?: string) => {
  if (costMode === 'economy') {
    return (
      process.env.OPENAI_ASSISTANT_MODEL_ECONOMY?.trim() ||
      providerModel ||
      process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
      DEFAULT_OPENAI_ASSISTANT_MODEL
    )
  }

  if (costMode === 'quality') {
    return (
      process.env.OPENAI_ASSISTANT_MODEL_QUALITY?.trim() ||
      providerModel ||
      process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
      DEFAULT_OPENAI_ASSISTANT_MODEL
    )
  }

  return (
    process.env.OPENAI_ASSISTANT_MODEL_BALANCED?.trim() ||
      providerModel ||
      process.env.OPENAI_ASSISTANT_MODEL?.trim() ||
      DEFAULT_OPENAI_ASSISTANT_MODEL
  )
}

const getOpenAIClient = async () => {
  const apiKey = await resolveOpenAIApiKey()

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is missing. Add it to .env or save it in Settings to use assistant analysis.'
    )
  }

  return new OpenAI({ apiKey })
}

const compactProfileContext = (
  content: string,
  costMode: AssistantCostMode
) => {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PROFILE_CONTEXT_CHARS_LIMIT_BY_MODE[costMode])
}

const compactSessionContext = (
  sessionContext: SessionContext | undefined,
  costMode: AssistantCostMode
) => {
  if (!sessionContext) {
    return ''
  }

  const lines = [
    ['Company', sessionContext.company],
    ['Role', sessionContext.role],
    ['Context', sessionContext.context],
    ['Goal', sessionContext.goal],
    ['Notes', sessionContext.notes]
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`)

  if (lines.length === 0) {
    return ''
  }

  const limit =
    costMode === 'quality' ? 4000 : costMode === 'balanced' ? 2500 : 1200

  return lines.join('\n').slice(0, limit)
}

const validateSuggestedAnswer = (value: unknown): value is SuggestedAnswer => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    (candidate.label === 'short' ||
      candidate.label === 'strong' ||
      candidate.label === 'clarifying') &&
    typeof candidate.text === 'string' &&
    typeof candidate.answerMeaningRu === 'string'
  )
}

const validateAssistantAnalysisResult = (
  value: unknown
): value is AssistantAnalysisResult => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.meaningRu === 'string' &&
    typeof candidate.detectedQuestion === 'string' &&
    typeof candidate.intent === 'string' &&
    typeof candidate.risk === 'string' &&
    Array.isArray(candidate.suggestedAnswers) &&
    candidate.suggestedAnswers.every(validateSuggestedAnswer) &&
    Array.isArray(candidate.keywordsToRemember) &&
    candidate.keywordsToRemember.every((item) => typeof item === 'string') &&
    typeof candidate.openingPhrase === 'string'
  )
}

const buildUserPrompt = async (request: AssistantAnalysisRequest) => {
  const sections = [
    `Cost mode: ${request.costMode}`,
    `Mode: ${request.mode}`,
    `Call language: ${request.callLanguage}`,
    `Answer language: ${request.answerLanguage}`,
    `Recent window: ${request.recentWindowLabel}`,
    '',
    'Transcript text:',
    request.transcriptText.trim()
  ]

  if (request.includeProfileContext) {
    const profile = await getProfileContext()

    sections.push(
      '',
      'Profile context:',
      compactProfileContext(profile.content, request.costMode)
    )
  }

  const sessionContext = compactSessionContext(
    request.sessionContext,
    request.costMode
  )

  if (sessionContext) {
    sections.push('', 'Current session context:', sessionContext)
  }

  const personalKnowledgeContext = await getPersonalInterviewRetrieval(
    request.transcriptText,
    request.answerLanguage
  )

  if (personalKnowledgeContext) {
    sections.push(
      '',
      'Personal Knowledge Core retrieval (private, EN/FR interview scope only):',
      personalKnowledgeContext,
      'Use this only as evidence-backed personal context. Do not invent details beyond it.'
    )
  } else {
    sections.push(
      '',
      'Personal Knowledge Core: no suitable current EN/FR interview context was retrieved. Do not claim owner-specific facts from this source; ask a concise clarifying question or use a neutral answer when such facts are needed.'
    )
  }

  sections.push(
    '',
    'Return only JSON that matches the schema.',
    'For every suggested answer, include answerMeaningRu: a short Russian meaning of that answer.',
    'If mode is keywords, keep meaningRu and detectedQuestion very short, keep suggestedAnswers empty or minimal, and return 5-8 keywords in the selected answer language.'
  )

  if (request.costMode === 'economy') {
    sections.push(
      'Economy mode: prefer minimal profile usage, shorter answers, and concise output.'
    )
  }

  if (request.costMode === 'quality') {
    sections.push(
      'Quality mode: use more relevant profile context when helpful, but still keep answers short and speakable.'
    )
  }

  return sections.join('\n')
}

const parseStructuredResponse = (payload: string) => {
  try {
    const parsed = JSON.parse(payload) as unknown

    if (!validateAssistantAnalysisResult(parsed)) {
      throw new Error('Model response JSON does not match the expected shape.')
    }

    return parsed
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Invalid JSON from model response.'

    throw new Error(`Invalid model response: ${message}`)
  }
}

export const analyzeRecentTranscript = async (
  request: AssistantAnalysisRequest
): Promise<AssistantAnalysisResult> => {
  if (!request.transcriptText.trim()) {
    throw new Error(
      'Transcript is empty. Add transcript lines before requesting analysis.'
    )
  }

  const client = await getOpenAIClient()
  const input = await buildUserPrompt(request)
  const providerProfile = getPrimaryOpenAIProviderProfile()
  const model = getAssistantModel(request.costMode, providerProfile.model)

  try {
    const response = await runGovernedProviderAction(
      {
        kind: 'assistant_analysis',
        provider: providerProfile.provider,
        model,
        external: true
      },
      () =>
        client.responses.create({
          model,
          instructions: interviewAssistantSystemPrompt,
          input,
          text: {
            format: {
              type: 'json_schema',
              name: 'assistant_analysis',
              description:
                'Structured professional call assistant analysis result.',
              strict: true,
              schema: ANALYSIS_SCHEMA
            }
          }
        }),
      (result) => {
        const usage = (result as { usage?: { total_tokens?: unknown } }).usage
        return typeof usage?.total_tokens === 'number'
          ? { tokenCount: usage.total_tokens }
          : undefined
      }
    )

    const outputText = response.output_text?.trim()

    if (!outputText) {
      throw new Error('Model returned an empty response.')
    }

    return parseStructuredResponse(outputText)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown OpenAI assistant error.'

    if (
      message.includes('OPENAI_API_KEY') ||
      message.includes('Transcript is empty') ||
      message.includes('Invalid model response')
    ) {
      throw error
    }

    throw new Error(`Assistant analysis failed: ${message}`)
  }
}

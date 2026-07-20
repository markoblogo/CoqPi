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
  getOrderedEnabledProviderProfiles,
} from './assistant-provider-profile'
import {
  PatterLikeProviderKind,
  type PatterLikeProviderProfile
} from '../../shared/app-types'

type AssistantTextResponse = {
  outputText: string
  tokenCount?: number
}

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

const callOpenAI = async (
  input: string,
  model: string
): Promise<AssistantTextResponse> => {
  const client = await getOpenAIClient()
  const response = await client.responses.create({
    model,
    instructions: interviewAssistantSystemPrompt,
    input,
    text: {
      format: {
        type: 'json_schema',
        name: 'assistant_analysis',
        description: 'Structured professional call assistant analysis result.',
        strict: true,
        schema: ANALYSIS_SCHEMA
      }
    }
  })

  const outputText = response.output_text?.trim()

  if (!outputText) {
    throw new Error('OpenAI returned an empty response.')
  }

  const usage = (response as { usage?: { total_tokens?: unknown } }).usage
  const tokenCount =
    typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined

  return { outputText, tokenCount }
}

const callOllama = async (
  input: string,
  model: string,
  baseUrl: string | undefined
): Promise<AssistantTextResponse> => {
  const endpoint = `${(baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '')}/api/chat`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: interviewAssistantSystemPrompt
        },
        {
          role: 'user',
          content: input
        }
      ],
      stream: false,
      format: 'json'
    })
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(
      `Ollama API request failed: ${response.status} ${response.statusText}${
        details ? `: ${details.slice(0, 240)}` : ''
      }`
    )
  }

  const payload = (await response.json()) as {
    error?: string
    message?: {
      content?: string
    }
    prompt_eval_count?: number
    eval_count?: number
  }

  if (typeof payload.error === 'string') {
    throw new Error(`Ollama API error: ${payload.error}`)
  }

  const outputText =
    payload.message?.content && typeof payload.message.content === 'string'
      ? payload.message.content.trim()
      : ''

  if (!outputText) {
    throw new Error('Ollama returned an empty response.')
  }

  const promptTokens = payload?.prompt_eval_count
  const completionTokens = payload?.eval_count
  const usageFromPayload =
    typeof promptTokens === 'number' && typeof completionTokens === 'number'
      ? promptTokens + completionTokens
      : undefined

  return {
    outputText,
    tokenCount: usageFromPayload
  }
}

const getProviderLabel = (profile: PatterLikeProviderProfile) =>
  `${profile.provider}(${profile.model})`

const analyzeWithProviderFailureAware = async (
  request: AssistantAnalysisRequest,
  profile: PatterLikeProviderProfile,
  input: string
): Promise<AssistantTextResponse> => {
  const model =
    profile.provider === PatterLikeProviderKind.Ollama
      ? profile.model
      : getAssistantModel(request.costMode, profile.model)

  return runGovernedProviderAction(
    {
      kind: 'assistant_analysis',
      provider: profile.provider,
      model,
      external: true
    },
    () => {
      if (profile.provider === PatterLikeProviderKind.Ollama) {
        return callOllama(input, model, profile.baseUrl)
      }

      return callOpenAI(input, model)
    },
    (result) => {
      const tokenCount = result.tokenCount

      return tokenCount === undefined ? undefined : { tokenCount }
    }
  )
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

const isRetryableProviderError = (error: Error) => {
  const message = error.message

  const nonRetryable = [
    'Invalid model response',
    'Model response JSON does not match the expected shape.',
    'OPENAI_API_KEY',
    'OPENAI returned an empty response.',
    'Governance blocked action'
  ]

  if (
    nonRetryable.some((value) => message.includes(value)) ||
    error.name === 'GovernanceBlockedError'
  ) {
    return false
  }

  return true
}

export const analyzeRecentTranscript = async (
  request: AssistantAnalysisRequest
): Promise<AssistantAnalysisResult> => {
  if (!request.transcriptText.trim()) {
    throw new Error(
      'Transcript is empty. Add transcript lines before requesting analysis.'
    )
  }

  const input = await buildUserPrompt(request)
  const providerProfiles = getOrderedEnabledProviderProfiles()
  let lastError: Error | null = null

  for (const profile of providerProfiles) {
    try {
      const result = await analyzeWithProviderFailureAware(request, profile, input)
      return parseStructuredResponse(result.outputText)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown provider error.')
      if (!isRetryableProviderError(lastError)) {
        throw lastError
      }

      if (providerProfiles[providerProfiles.length - 1] === profile) {
        break
      }
    }
  }

  const providerRoute = providerProfiles.map(getProviderLabel).join(' -> ')
  const message =
    lastError?.message || 'No provider in COQPI_ASSISTANT_PROVIDER_PROFILE could complete the request.'

  throw new Error(`Assistant analysis failed for ${providerRoute}: ${message}`)
}

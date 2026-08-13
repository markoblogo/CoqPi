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
import {
  getPersonalInterviewRetrieval,
  resolveSessionSelectedCounterpartyPackIds,
  getCounterpartyContextPacks
} from './context-source-service'
import {
  buildFinderOutreachDraftSessionHandoff,
  buildFinderRelationshipMemory
} from '../../shared/finder-relationship-memory'
import { resolveOpenAIApiKey } from './secret-storage-service'
import { runGovernedProviderAction } from './governance-service'
import { getSessionContext } from './session-context-service'
import {
  resolveSessionFinderOutreachDraft
} from './finder-search-service'
import { buildOpportunitySessionHandoff } from './opportunity-service'
import {
  getLocalMemoryCoreState
} from './local-memory-core-service'
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
import {
  isRetryableProviderError,
  shouldContinueFallback
} from './assistant-service-retry-policy'
import { buildLocalMemoryRetrievalContext } from '../../shared/local-memory-core'
import {
  buildKnowledgeToFinderTargetBrief,
  formatKnowledgeToFinderTargetBrief
} from '../../shared/knowledge-target-brief'
import { processTranscriptForAssistant } from '../../shared/transcript-processing'
import { sanitizeForExternalAssistant } from '../../shared/privacy-sanitizer'
import { buildPreCallPreparationPacket } from '../../shared/meeting-workflow'

const DEFAULT_ANALYSIS_REQUEST_TIMEOUT_MS = 10000
const DEFAULT_ANALYSIS_BUDGET_MS = 25000

const parsePositiveInt = (raw: string | undefined): number | undefined => {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : NaN

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const getAnalysisRequestTimeoutMs = () =>
  parsePositiveInt(process.env.COQPI_ASSISTANT_PROVIDER_TIMEOUT_MS) ??
  DEFAULT_ANALYSIS_REQUEST_TIMEOUT_MS

const getAnalysisBudgetMs = () =>
  parsePositiveInt(process.env.COQPI_ASSISTANT_REQUEST_BUDGET_MS) ??
  DEFAULT_ANALYSIS_BUDGET_MS

const withTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> => {
  const timeoutMsSafe = Math.max(100, timeoutMs)

  let timeoutHandle: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${context} timed out after ${timeoutMsSafe}ms`))
    }, timeoutMsSafe)
  })

  try {
    return await Promise.race([operation(), timeoutPromise])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

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

const getProviderRouteLabel = (profiles: PatterLikeProviderProfile[]) => {
  return profiles.map((profile) => `${profile.provider}(${profile.model})`).join(' -> ')
}

const analyzeWithProviderFailureAware = async (
  request: AssistantAnalysisRequest,
  profile: PatterLikeProviderProfile,
  input: string,
  route: {
    index: number
    count: number
    routeLabel: string
    budgetMs: number
    timeoutMs: number
  }
): Promise<AssistantTextResponse> => {
  const model =
    profile.provider === PatterLikeProviderKind.Ollama
      ? profile.model
      : getAssistantModel(request.costMode, profile.model)

  const executeCall = () =>
    profile.provider === PatterLikeProviderKind.Ollama
      ? callOllama(input, model, profile.baseUrl)
      : callOpenAI(input, model)

  const wrappedExecute = () =>
    withTimeout(executeCall, route.timeoutMs, `assistant analysis ${route.routeLabel}`)

  return runGovernedProviderAction(
    {
      kind: 'assistant_analysis',
      provider: profile.provider,
      model,
      external: true,
      routeIndex: route.index,
      routeCount: route.count,
      routeLabel: route.routeLabel,
      providerTimeoutMs: route.timeoutMs,
      providerBudgetMs: route.budgetMs
    },
    wrappedExecute,
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

const compactSelectedOutreachDraft = async (
  sessionContext: SessionContext | undefined,
  costMode: AssistantCostMode
) => {
  const resolvedDraft = await resolveSessionFinderOutreachDraft({
    selectedDraftId: sessionContext?.selectedFinderOutreachDraftId ?? '',
    selectedPackIds: sessionContext?.selectedCounterpartyPackIds ?? []
  })
  const draft = resolvedDraft.draft

  if (!draft) {
    return ''
  }
  const handoff =
    resolvedDraft.handoff ??
    buildFinderOutreachDraftSessionHandoff(draft, resolvedDraft.candidateResult)

  if (!handoff.included) {
    return ''
  }

  const relationshipMemory =
    resolvedDraft.relationshipMemory ?? buildFinderRelationshipMemory(draft)
  const draftSourceLabel =
    resolvedDraft.selectionMode === 'linked_selected_pack'
      ? 'Linked outreach draft for selected pack'
      : 'Selected outreach draft'

  const lines = [
    `${draftSourceLabel}: ${draft.targetName}`,
    `Target: ${draft.targetName}`,
    `Opportunity: ${draft.opportunity}`,
    `Fit: ${draft.fitLabel}`,
    `Why relevant: ${draft.whyRelevant}`,
    ...relationshipMemory.assistantContextLines,
    `Opening message already drafted: ${draft.openingMessage}`,
    `Next action: ${draft.nextAction}`,
    draft.questionsToAsk.length
      ? `Questions to ask: ${draft.questionsToAsk.join('; ')}`
      : ''
  ].filter(Boolean)
  const limit =
    costMode === 'quality' ? 2400 : costMode === 'balanced' ? 1600 : 900

  return lines.join('\n').slice(0, limit)
}

const compactSelectedTargetGuidance = (
  sessionContext: SessionContext | undefined,
  packs: {
    id: string
    kind: string
    sourceId: string
    partnerName: string
    title: string
    summary: string
  }[]
) => {
  const selectedIds = new Set(
    sessionContext?.selectedCounterpartyPackIds?.filter(Boolean) ?? []
  )
  const selectedPacks = packs.filter((pack) => selectedIds.has(pack.id))

  if (selectedPacks.length === 0) {
    return ''
  }

  const targetLines = selectedPacks
    .slice(0, 3)
    .map(
      (pack) =>
        `- ${pack.partnerName} · ${pack.title} (${pack.kind}; ${pack.sourceId}): ${pack.summary}`
    )

  return [
    'Live communication quality guard for selected Finder/session context:',
    `Active selected target${selectedPacks.length === 1 ? '' : 's'}:`,
    ...targetLines,
    'Use selected target context only when it directly helps answer the current utterance.',
    'Keep suggested answers short, spoken, and specific to the selected target; prefer 1-2 sentences per answer.',
    'Do not include broad owner biography, unrelated projects, or unselected counterpart context unless the selected evidence directly supports it.',
    'If selected context is weak, missing, or unrelated to the question, abstain from owner-specific claims and offer a concise clarifying question.'
  ].join('\n')
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
  const processedTranscript = processTranscriptForAssistant(
    request.transcriptText,
    request.callLanguage
  )
  const sections = [
    `Cost mode: ${request.costMode}`,
    `Mode: ${request.mode}`,
    `Call language: ${request.callLanguage}`,
    `Answer language: ${request.answerLanguage}`,
    `Recent window: ${request.recentWindowLabel}`,
    '',
    'Transcript text:',
    processedTranscript.text,
    `Transcript language hint: ${processedTranscript.languageHint}`
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

  const opportunityHandoff = await buildOpportunitySessionHandoff({
    applicationPackId:
      request.sessionContext?.selectedOpportunityApplicationPackId,
    threadSummaryId:
      request.sessionContext?.selectedCommunicationThreadSummaryId,
    calendarProposalId: request.sessionContext?.selectedCalendarProposalId
  })

  if (opportunityHandoff.included) {
    sections.push(
      '',
      'Selected opportunity-to-call handoff:',
      opportunityHandoff.text
    )
  }

  const selectedOutreachDraft = await compactSelectedOutreachDraft(
    request.sessionContext,
    request.costMode
  )

  if (selectedOutreachDraft) {
    sections.push(
      '',
      'Selected outreach draft for this counterpart (private local source, already used or planned by owner):',
      selectedOutreachDraft,
      'Use this to stay consistent with what was already sent or prepared. Do not claim it was sent unless the draft itself says so.'
    )
  }

  const selectedDraftResolution = await resolveSessionFinderOutreachDraft({
    selectedDraftId: request.sessionContext?.selectedFinderOutreachDraftId ?? '',
    selectedPackIds: request.sessionContext?.selectedCounterpartyPackIds ?? []
  })
  const packManifest = await getCounterpartyContextPacks()
  const selectedTargetGuidance = compactSelectedTargetGuidance(
    request.sessionContext,
    packManifest.manifest.counterpartyPacks ?? []
  )
  const preparationPacket = buildPreCallPreparationPacket({
    sessionContext: request.sessionContext ?? {
      company: '',
      role: '',
      context: '',
      goal: '',
      notes: '',
      selectedCounterpartyPackIds: [],
      selectedFinderOutreachDraftId: ''
    },
    packs: packManifest.manifest.counterpartyPacks ?? [],
    draft: selectedDraftResolution.draft
  })
  sections.push(
    '',
    'Bounded pre-call preparation packet:',
    `Session: ${preparationPacket.sessionLabel || 'unlabeled'}`,
    `Agenda: ${preparationPacket.agenda.join('; ') || 'not set'}`,
    `Participant context: ${preparationPacket.participantContext.join(' | ') || 'not available'}`,
    `Owner focus: ${preparationPacket.ownerFocus.join(' | ') || 'not set'}`,
    `Missing context: ${preparationPacket.missingContext.join('; ') || 'none'}`
  )

  if (selectedTargetGuidance) {
    sections.push('', selectedTargetGuidance)
  }

  const personalKnowledgeContext = await getPersonalInterviewRetrieval(
    processedTranscript.text,
    request.answerLanguage,
    request.contextPackRetrievalKinds ?? request.retrievalKinds,
    request.selectedCounterpartyPackIds,
    request.retrievalProvider ?? 'legacy'
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

  const localMemoryState = await getLocalMemoryCoreState({
    selectedPackIds: request.selectedCounterpartyPackIds,
    selectedDraftId: request.sessionContext?.selectedFinderOutreachDraftId ?? ''
  })
  const selectedTargetBrief = buildKnowledgeToFinderTargetBrief({
    memoryState: localMemoryState,
    selectedPacks: (packManifest.manifest.counterpartyPacks ?? []).filter((pack) =>
      (request.selectedCounterpartyPackIds ?? []).includes(pack.id)
    )
  })
  sections.push(
    '',
    formatKnowledgeToFinderTargetBrief(selectedTargetBrief),
    'Use the brief to choose which owner facts to mention, which facts to avoid, and which prepared question/answer angle fits the current utterance.',
    'If the brief is strong or usable, use only the listed Use owner facts when owner-specific fit is needed.',
    'Never present Avoid or downplay owner facts as achievements for this target.',
    'If the brief is weak or has an Abstain rule, prefer a neutral answer or a concise clarifying question instead of inventing owner-specific fit.'
  )
  const localMemoryRetrieval = buildLocalMemoryRetrievalContext({
    state: localMemoryState,
    query: processedTranscript.text,
    maxChars: 1000
  })

  if (localMemoryRetrieval.context) {
    sections.push(
      '',
      'Selected-context retrieval from local memory core (strict selected set only):',
      localMemoryRetrieval.context,
      'Use this only as evidence-backed continuity from selected packs, drafts, session summaries, and readable owner facts.'
    )
  } else if (localMemoryRetrieval.shouldAbstain) {
    sections.push(
      '',
      'Local memory core: no sufficiently strong selected-context retrieval matched this utterance. Do not invent continuity from selected packs, drafts, or session summaries; ask a concise clarifying question or answer neutrally when owner-specific continuity is needed.'
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

  const sanitized = sanitizeForExternalAssistant(sections.join('\n'))

  if (sanitized.blocked) {
    throw new Error(
      `Assistant prompt blocked by privacy gate: ${sanitized.reason ?? 'unsafe material detected'}`
    )
  }

  return sanitized.safeText
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

const attachAssistantFailureSource = (
  error: Error,
  source: string
): Error => {
  const withSource = error instanceof Error ? error : new Error(String(error))

  withSource.name = withSource.name === 'Error' ? 'AssistantProviderError' : withSource.name
  ;(withSource as Error & { source?: string }).source = source

  return withSource
}

export const analyzeRecentTranscript = async (
  request: AssistantAnalysisRequest
): Promise<AssistantAnalysisResult> => {
  if (!request.transcriptText.trim()) {
    throw new Error(
      'Transcript is empty. Add transcript lines before requesting analysis.'
    )
  }

  const fallbackSessionContext = (await getSessionContext()).context
  const selectedCounterpartyPackIds =
    await resolveSessionSelectedCounterpartyPackIds(
      request.selectedCounterpartyPackIds ??
        fallbackSessionContext.selectedCounterpartyPackIds
    )

  const resolvedRequest: AssistantAnalysisRequest = {
    ...request,
    sessionContext: request.sessionContext ?? fallbackSessionContext,
    selectedCounterpartyPackIds
  }

  const input = await buildUserPrompt(resolvedRequest)
  const providerProfiles = getOrderedEnabledProviderProfiles()
  const providerRoute = getProviderRouteLabel(providerProfiles)
  const routeBudgetMs = getAnalysisBudgetMs()
  const perProviderTimeoutMs = getAnalysisRequestTimeoutMs()
  let remainingBudgetMs = routeBudgetMs
  let lastError: Error | null = null

  for (const [index, profile] of providerProfiles.entries()) {
    if (remainingBudgetMs <= 0) {
      throw new Error(
        `Assistant analysis budget exhausted while routing: ${providerRoute}`
      )
    }

    const attemptTimeoutMs = Math.min(remainingBudgetMs, perProviderTimeoutMs)
    const attemptStartMs = performance.now()
    const profileSource = `${profile.provider}(${profile.model})`

    try {
      const result = await analyzeWithProviderFailureAware(
        resolvedRequest,
        profile,
        input,
        {
          index,
          count: providerProfiles.length,
          routeLabel: providerRoute,
          timeoutMs: attemptTimeoutMs,
          budgetMs: remainingBudgetMs
        }
      )
      return parseStructuredResponse(result.outputText)
    } catch (error) {
      remainingBudgetMs -= Math.round(performance.now() - attemptStartMs)
      lastError = attachAssistantFailureSource(
        error instanceof Error
          ? error
          : new Error('Unknown provider error.'),
        profileSource
      )
      if (!isRetryableProviderError(lastError)) {
        ;(lastError as Error & { source?: string }).source = profileSource
        throw lastError
      }

      if (!shouldContinueFallback(providerProfiles, index)) {
        break
      }
    }
  }

  const message =
    lastError?.message ||
    'No provider in COQPI_ASSISTANT_PROVIDER_PROFILE could complete the request.'

  const routeSource =
    lastError &&
    (lastError as Error & { source?: string }).source
      ? (lastError as Error & { source?: string }).source
      : 'provider route'

  throw new Error(`Assistant analysis failed for ${providerRoute} (${routeSource}): ${message}`)
}

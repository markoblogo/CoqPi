import type {
  AssistantAnalysisError,
  TranscriptUtterance
} from './app-types'

export const AUTO_ANALYSIS_DEBOUNCE_MS = 900

export type AssistantState = 'idle' | 'analyzing' | 'error' | 'done'
export type AssistantStatusCode = AssistantAnalysisError['code'] | null

export type AssistantStatusLabelInfo = {
  label: string
  classNameSuffix: string
}

export const getAutoAnalysisFingerprint = (
  latestFinalUtterance: TranscriptUtterance,
  transcriptText: string,
  selectedCounterpartyPackIds: string[] = []
) =>
  `${latestFinalUtterance.id}::${latestFinalUtterance.speaker}::${transcriptText
    .slice(-500)
    .trim()}::packs:${[
    ...new Set(selectedCounterpartyPackIds.filter(Boolean))
  ]
    .sort()
    .join(',')}`

export const getAssistantStatusLabel = (
  assistantState: AssistantState,
  lastAnalyzedUtteranceId: string | null,
  lastUtteranceId: string | undefined,
  errorCode: AssistantStatusCode
): AssistantStatusLabelInfo => {
  if (assistantState === 'analyzing') {
    return {
      label: 'Analyzing',
      classNameSuffix: 'analyzing'
    }
  }

  if (assistantState === 'error' && errorCode) {
    if (errorCode === 'provider_timeout') {
      return {
        label: 'Timeout',
        classNameSuffix: 'timeout'
      }
    }

    if (errorCode === 'analysis_budget_exhausted') {
      return {
        label: 'Budget exhausted',
        classNameSuffix: 'budget-exhausted'
      }
    }

    if (errorCode === 'missing_api_key') {
      return {
        label: 'Auth missing',
        classNameSuffix: 'auth-missing'
      }
    }

    return {
      label: 'Error',
      classNameSuffix: 'error'
    }
  }

  if (lastUtteranceId && lastAnalyzedUtteranceId !== lastUtteranceId) {
    return {
      label: 'Stale',
      classNameSuffix: 'stale'
    }
  }

  if (assistantState === 'done') {
    return {
      label: 'Ready',
      classNameSuffix: 'ready'
    }
  }

  return {
    label: 'Waiting',
    classNameSuffix: 'waiting'
  }
}

export type LiveLoopDecisionReason =
  | 'schedule'
  | 'no-final'
  | 'already-analyzed'
  | 'already-scheduled'
  | 'assistant-busy'

export type LiveLoopDecision = {
  shouldRun: boolean
  reason: LiveLoopDecisionReason
  fingerprint: string | null
}

export const decideAutoAnalysis = ({
  latestFinalUtterance,
  transcriptText,
  lastAutoAnalyzedFingerprint,
  scheduledAutoAnalysisFingerprint,
  assistantState,
  selectedCounterpartyPackIds = []
}: {
  latestFinalUtterance: TranscriptUtterance | undefined
  transcriptText: string
  lastAutoAnalyzedFingerprint: string | null
  scheduledAutoAnalysisFingerprint: string | null
  assistantState: AssistantState
  selectedCounterpartyPackIds?: string[]
}): LiveLoopDecision => {
  if (!latestFinalUtterance) {
    return {
      shouldRun: false,
      reason: 'no-final',
      fingerprint: null
    }
  }

  const fingerprint = getAutoAnalysisFingerprint(
    latestFinalUtterance,
    transcriptText,
    selectedCounterpartyPackIds
  )

  if (fingerprint === lastAutoAnalyzedFingerprint) {
    return {
      shouldRun: false,
      reason: 'already-analyzed',
      fingerprint
    }
  }

  if (fingerprint === scheduledAutoAnalysisFingerprint) {
    return {
      shouldRun: false,
      reason: 'already-scheduled',
      fingerprint
    }
  }

  if (assistantState === 'analyzing') {
    return {
      shouldRun: false,
      reason: 'assistant-busy',
      fingerprint
    }
  }

  return {
    shouldRun: true,
    reason: 'schedule',
    fingerprint
  }
}

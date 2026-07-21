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

export type AssistantRunHintTone = 'info' | 'warning' | 'error'

export interface AssistantRunHint {
  title: string
  message: string
  tone: AssistantRunHintTone
  actionHint: string | null
}

export const getAssistantRunHint = (
  assistantState: AssistantState,
  errorCode: AssistantStatusCode,
  assistantError: string | null,
  lastAnalyzedUtteranceId: string | null,
  lastUtteranceId: string | undefined,
  cooldownRemainingSeconds = 0
): AssistantRunHint | null => {
  const formatRetryHint = (baseHint: string) => {
    if (cooldownRemainingSeconds <= 0) {
      return baseHint
    }

    return `${baseHint} Повтор запланирован через ${cooldownRemainingSeconds} сек.`
  }

  if (assistantState === 'analyzing') {
    return {
      title: 'Анализ...',
      message: 'Идёт обработка последней финальной реплики.',
      tone: 'info',
      actionHint: null
    }
  }

  if (assistantState === 'error') {
    if (errorCode === 'provider_timeout') {
      return {
        title: 'Тайм-аут ответа провайдера',
        message:
          'Ответ не пришёл вовремя. Обычно помогает короче сформулировать реплику.',
        tone: 'warning',
        actionHint: formatRetryHint(
          'Нажми Retry-режим (A30/KW) или повтори ручной запуск после паузы.'
        )
      }
    }

    if (errorCode === 'analysis_budget_exhausted') {
      return {
        title: 'Лимит budget исчерпан',
        message: 'Запросов больше нет: системный лимит на retry/маршруты исчерпан.',
        tone: 'warning',
        actionHint: formatRetryHint(
          'Сбрось сеанс кнопкой reset и попробуй после паузы или с меньшим окном.'
        )
      }
    }

    if (errorCode === 'missing_api_key') {
      return {
        title: 'Нет ключа API',
        message:
          'Assistant analysis не может стартовать без рабочего ключа OpenAI.',
        tone: 'error',
        actionHint: 'Открой Settings и сохрани API-ключ.'
      }
    }

    if (errorCode === 'invalid_model_response') {
      return {
        title: 'Некорректный ответ модели',
        message:
          'Модель вернула невалидную структуру ответа, поэтому разбор невозможен.',
        tone: 'error',
        actionHint: 'Повтори запуск вручную. Уточни язык и повтори вопрос/ответ.'
      }
    }

    if (errorCode === 'profile_context_error') {
      return {
        title: 'Ошибка профиля/контекста',
        message: 'Нужные профили или сессионные данные временно не удалось собрать.',
        tone: 'warning',
        actionHint: 'Проверь профиль/selected packs и повтори анализ.'
      }
    }

    if (errorCode === 'assistant_error' || errorCode === 'provider_error') {
      return {
        title: 'Ошибка обработки запроса',
        message:
          assistantError ??
          'Сбой маршрута анализа. Проверь подключение и повтори анализ.',
        tone: 'error',
        actionHint: 'Нажми A30/KW повторно, или переключись на другой режим cost.'
      }
    }

    return {
      title: 'Неизвестная ошибка',
      message:
        assistantError ??
        'Непредвиденная ошибка в блоке анализа.',
      tone: 'error',
      actionHint: 'Нажми Reset conversation и попробуй заново.'
    }
  }

  if (assistantState === 'done' && lastUtteranceId) {
    if (lastAnalyzedUtteranceId && lastAnalyzedUtteranceId !== lastUtteranceId) {
      return {
        title: 'Старая подсказка',
        message:
          'Сейчас на экране результат по предыдущей реплике; новый final ещё не обработан.',
        tone: 'warning',
        actionHint: 'Дождись завершения debounce и auto-анализ подтянет новый контент.'
      }
    }
  }

  return null
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

export type LiveLoopScheduleInput = {
  latestFinalUtterance: TranscriptUtterance | undefined
  transcriptText: string
  lastAutoAnalyzedFingerprint: string | null
  scheduledAutoAnalysisFingerprint: string | null
  assistantState: AssistantState
  analysisCooldownUntil: number
  nowMs?: number
  selectedCounterpartyPackIds?: string[]
}

export type LiveLoopSchedulePlan = {
  shouldRun: boolean
  reason: LiveLoopDecisionReason
  fingerprint: string | null
  delayMs: number | null
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

export const buildAutoAnalysisSchedule = ({
  latestFinalUtterance,
  transcriptText,
  lastAutoAnalyzedFingerprint,
  scheduledAutoAnalysisFingerprint,
  assistantState,
  analysisCooldownUntil,
  nowMs,
  selectedCounterpartyPackIds
}: LiveLoopScheduleInput): LiveLoopSchedulePlan => {
  const decision = decideAutoAnalysis({
    latestFinalUtterance,
    transcriptText,
    lastAutoAnalyzedFingerprint,
    scheduledAutoAnalysisFingerprint,
    assistantState,
    selectedCounterpartyPackIds
  })

  if (!decision.shouldRun || decision.fingerprint === null) {
    return {
      shouldRun: false,
      reason: decision.reason,
      fingerprint: null,
      delayMs: null
    }
  }

  const currentNow = nowMs ?? Date.now()
  const cooldownDelay = Math.max(0, analysisCooldownUntil - currentNow)

  return {
    shouldRun: true,
    reason: decision.reason,
    fingerprint: decision.fingerprint,
    delayMs: AUTO_ANALYSIS_DEBOUNCE_MS + cooldownDelay
  }
}

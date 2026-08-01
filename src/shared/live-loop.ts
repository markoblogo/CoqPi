import type {
  AssistantAnalysisError,
  AssistantCallLanguage,
  TranscriptUtterance
} from './app-types'

export const AUTO_ANALYSIS_DEBOUNCE_MS = 900
export const AUTO_ANALYSIS_RAPID_FOLLOW_UP_DELAY_MS = 1200

export type AssistantState = 'idle' | 'analyzing' | 'error' | 'done'
export type AssistantStatusCode = AssistantAnalysisError['code'] | null

export type AssistantStatusLabelInfo = {
  label: string
  classNameSuffix: string
}

export type LiveTestCockpitTone = 'ok' | 'info' | 'warning' | 'error'

export type LiveTestCockpitItem = {
  id:
    | 'listening'
    | 'scope'
    | 'ignored'
    | 'boundary'
    | 'assistant'
    | 'sent'
    | 'context'
    | 'payload'
    | 'payload-drift'
  label: string
  value: string
  detail?: string
  tone: LiveTestCockpitTone
  title: string
}

const getListeningScopeLabel = (callLanguage: AssistantCallLanguage) => {
  if (callLanguage === 'en') {
    return 'EN final other lines'
  }

  if (callLanguage === 'fr') {
    return 'FR final other lines'
  }

  return 'EN/FR final other lines'
}

export const getAutoAnalysisFingerprint = (
  latestFinalUtterance: TranscriptUtterance,
  transcriptText: string,
  selectedCounterpartyPackIds: string[] = [],
  selectedFinderOutreachDraftId = ''
) =>
  `${latestFinalUtterance.id}::${latestFinalUtterance.speaker}::${transcriptText
    .slice(-500)
    .trim()}::packs:${[
    ...new Set(selectedCounterpartyPackIds.filter(Boolean))
  ]
    .sort()
    .join(',')}::draft:${selectedFinderOutreachDraftId.trim()}`

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

    if (errorCode === 'provider_not_retryable') {
      return {
        label: 'Retry blocked',
        classNameSuffix: 'retry-blocked'
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

export interface RetryButtonGateInput {
  assistantState: AssistantState
  cooldownRemainingSeconds: number
  hasTranscript: boolean
}

export const isRetryButtonDisabled = ({
  assistantState,
  cooldownRemainingSeconds,
  hasTranscript
}: RetryButtonGateInput): boolean =>
  assistantState === 'analyzing' ||
  !hasTranscript ||
  cooldownRemainingSeconds > 0

export const isRetryNowButtonDisabled = ({
  assistantState,
  hasTranscript
}: Pick<RetryButtonGateInput, 'assistantState' | 'hasTranscript'>): boolean =>
  assistantState === 'analyzing' || !hasTranscript

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
  cooldownRemainingSeconds = 0,
  assistantErrorSource?: string | null
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
          'Сбрось сеанс кнопкой Reset и попробуй после паузы или с меньшим окном.'
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

    if (errorCode === 'provider_not_retryable') {
      return {
        title: 'Анализ заблокирован',
        message:
          assistantError ??
          'Маршрут анализа остановлен после политики: ошибка не подходит для повторной попытки.',
        tone: 'error',
        actionHint: formatRetryHint(
          `Проверь ${
            assistantErrorSource ? `источник ${assistantErrorSource} / ` : ''
          }конфиг провайдера/ответ модели/входные поля и повтори вручную.`
        )
      }
    }

    if (errorCode === 'assistant_error' || errorCode === 'provider_error') {
      return {
        title: 'Ошибка обработки запроса',
        message:
          assistantError ??
          'Сбой маршрута анализа. Проверь подключение и повтори анализ.',
        tone: 'error',
        actionHint: 'Нажми Retry, A30 или KW повторно, или переключись на другой режим cost.'
      }
    }

    return {
      title: 'Неизвестная ошибка',
      message:
        assistantError ??
        'Непредвиденная ошибка в блоке анализа.',
      tone: 'error',
      actionHint: 'Нажми Reset и попробуй заново.'
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

export interface AssistantStatusRecoveryGuide {
  reason: string
  recovery: string
  source?: string
}

export const getAssistantStatusRecoveryGuide = (
  assistantState: AssistantState,
  errorCode: AssistantStatusCode,
  assistantError: string | null,
  assistantErrorSource?: string | null
): AssistantStatusRecoveryGuide | null => {
  if (assistantState !== 'error' || !errorCode) {
    return null
  }

  if (errorCode === 'provider_not_retryable') {
    return {
      source: assistantErrorSource ?? 'local policy / transport',
      reason:
        assistantError ??
        'Путь анализа остановлен: ошибка не подходит для автоматического retry по политике.',
      recovery:
        'Сейчас нужно ручное восстановление: проверь провайдер, модель, токен или входные поля и запусти анализ заново.'
    }
  }

  if (errorCode === 'provider_error' || errorCode === 'provider_timeout') {
    return {
      source: assistantErrorSource ?? 'provider path',
      reason: 'Повторный вызов провайдера уже возможен по политике.',
      recovery: 'Нажми Retry/ручной запуск после паузы или переключись на другой профиль.'
    }
  }

  if (errorCode === 'analysis_budget_exhausted') {
    return {
      source: assistantErrorSource ?? 'local budget gate',
      reason: 'Лимит общего budget на маршрут анализа исчерпан.',
      recovery:
        'Сбрось сессию (Reset) и продолжай анализ после паузы.'
    }
  }

  return null
}

export type LiveLoopDecisionReason =
  | 'schedule'
  | 'no-final'
  | 'unsupported-language'
  | 'too-short-transcript'
  | 'low-signal-transcript'
  | 'duplicate-boundary-transcript'
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
  callLanguage?: AssistantCallLanguage
  allUtterances?: TranscriptUtterance[]
  lastAutoAnalyzedFingerprint: string | null
  scheduledAutoAnalysisFingerprint: string | null
  assistantState: AssistantState
  analysisCooldownUntil: number
  nowMs?: number
  selectedCounterpartyPackIds?: string[]
  selectedFinderOutreachDraftId?: string
}

export type LiveLoopSchedulePlan = {
  shouldRun: boolean
  reason: LiveLoopDecisionReason
  fingerprint: string | null
  delayMs: number | null
}

export type AutoAnalysisUtteranceEligibility = {
  eligible: boolean
  reason: Extract<
    LiveLoopDecisionReason,
    'unsupported-language' | 'too-short-transcript' | 'low-signal-transcript'
  > | null
}

const unsupportedTranscriptScriptPattern =
  /[\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff\u3040-\u30ff\u3400-\u9fff]/
const latinLetterPattern = /[A-Za-zÀ-ÖØ-öø-ÿ]/
const meaningfulWordPattern = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/g
const punctuationTrimPattern = /[^\p{L}\p{N}\s]+/gu

const lowSignalTranscriptPatterns = new Set([
  'ok',
  'okay',
  'okay thanks',
  'ok thanks',
  'thanks',
  'thank you',
  'thanks a lot',
  'sounds good',
  'all right',
  'alright',
  'great thanks',
  'perfect thanks',
  'yes exactly',
  'yeah exactly',
  'right exactly',
  'exactly',
  'absolutely',
  'definitely',
  'for sure',
  'i see',
  'got it',
  'makes sense',
  'yes thanks',
  'sure thanks',
  'd accord',
  'd accord merci',
  'merci',
  'merci beaucoup',
  'tres bien',
  'très bien',
  'parfait',
  'oui merci',
  'oui exact',
  'tout a fait',
  'tout à fait',
  'je vois',
  'bien compris',
  'ca marche',
  'ça marche',
  'super merci'
])

const rapidFollowUpWindowMs = 2500

const toUtteranceTimestamp = (utterance: TranscriptUtterance | undefined | null) => {
  if (!utterance) {
    return 0
  }

  const timestamp = new Date(
    utterance.timestampEnd ?? utterance.timestampStart
  ).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

const getUtteranceWordCount = (text: string) =>
  normalizeTranscriptBoundaryText(text)
    .split(' ')
    .filter(Boolean).length

const getNormalizedBoundaryText = (text: string) =>
  normalizeTranscriptBoundaryText(text)
    .replace(/\b(a|an|the|and|but|so|well|just|really|very)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isRapidBoundaryDuplicate = (
  utterance: TranscriptUtterance,
  previousEligibleUtterance?: TranscriptUtterance
) => {
  if (!previousEligibleUtterance) {
    return false
  }

  const gapMs =
    toUtteranceTimestamp(utterance) - toUtteranceTimestamp(previousEligibleUtterance)

  if (gapMs <= 0 || gapMs > rapidFollowUpWindowMs) {
    return false
  }

  const current = getNormalizedBoundaryText(utterance.text)
  const previous = getNormalizedBoundaryText(previousEligibleUtterance.text)

  if (!current || !previous) {
    return false
  }

  return (
    current === previous ||
    (current.length >= 12 && previous.includes(current)) ||
    (previous.length >= 12 && current.includes(previous))
  )
}

const getPreviousEligibleUtterance = (
  utterances: TranscriptUtterance[],
  latestUtterance: TranscriptUtterance,
  callLanguage: AssistantCallLanguage = 'auto'
) => {
  const latestIndex = utterances.findIndex(
    (utterance) => utterance.id === latestUtterance.id
  )

  if (latestIndex <= 0) {
    return null
  }

  for (let index = latestIndex - 1; index >= 0; index -= 1) {
    const candidate = utterances[index]

    if (candidate.id === latestUtterance.id) {
      continue
    }

    if (isAutoAnalysisTranscriptCandidate(candidate, callLanguage)) {
      return candidate
    }
  }

  return null
}

const shouldDelayRapidEligibleFollowUp = (
  utterance: TranscriptUtterance,
  previousEligibleUtterance?: TranscriptUtterance | null
) => {
  if (!previousEligibleUtterance) {
    return false
  }

  const gapMs =
    toUtteranceTimestamp(utterance) - toUtteranceTimestamp(previousEligibleUtterance)

  if (gapMs <= 0 || gapMs > rapidFollowUpWindowMs) {
    return false
  }

  if (utterance.text.includes('?')) {
    return false
  }

  const wordCount = getUtteranceWordCount(utterance.text)

  return wordCount >= 4 && wordCount <= 16
}

const hasEnoughAutoAnalysisText = (text: string) => {
  const trimmed = text.trim()

  if (trimmed.length < 6) {
    return false
  }

  return (trimmed.match(meaningfulWordPattern) ?? []).length >= 2
}

const normalizeTranscriptBoundaryText = (text: string) =>
  text
    .toLowerCase()
    .replace(punctuationTrimPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isLowSignalTranscript = (text: string) => {
  if (text.includes('?')) {
    return false
  }

  const normalized = normalizeTranscriptBoundaryText(text)

  if (!normalized) {
    return true
  }

  if (lowSignalTranscriptPatterns.has(normalized)) {
    return true
  }

  const words = normalized.split(' ').filter(Boolean)

  if (words.length <= 3) {
    const joined = words.join(' ')
    if (lowSignalTranscriptPatterns.has(joined)) {
      return true
    }
  }

  return false
}

export const getAutoAnalysisUtteranceEligibility = (
  utterance: TranscriptUtterance,
  callLanguage: AssistantCallLanguage = 'auto'
): AutoAnalysisUtteranceEligibility => {
  const language = utterance.language ?? 'unknown'
  const hasUnsupportedScript = unsupportedTranscriptScriptPattern.test(utterance.text)
  const hasLatinLetters = latinLetterPattern.test(utterance.text)

  if (language === 'ru' || hasUnsupportedScript) {
    return {
      eligible: false,
      reason: 'unsupported-language'
    }
  }

  if (!hasEnoughAutoAnalysisText(utterance.text)) {
    return {
      eligible: false,
      reason: 'too-short-transcript'
    }
  }

  if (isLowSignalTranscript(utterance.text)) {
    return {
      eligible: false,
      reason: 'low-signal-transcript'
    }
  }

  if (language === 'en' || language === 'fr') {
    if (callLanguage === 'auto' || callLanguage === language) {
      return {
        eligible: true,
        reason: null
      }
    }

    return {
      eligible: false,
      reason: 'unsupported-language'
    }
  }

  if (language === 'unknown' && hasLatinLetters) {
    return {
      eligible: true,
      reason: null
    }
  }

  return {
    eligible: false,
    reason: 'unsupported-language'
  }
}

export const isAutoAnalysisTranscriptCandidate = (
  utterance: TranscriptUtterance,
  callLanguage: AssistantCallLanguage = 'auto'
) =>
  utterance.isFinal &&
  utterance.speaker === 'other' &&
  (utterance.source === 'realtime' || utterance.source === 'mock') &&
  getAutoAnalysisUtteranceEligibility(utterance, callLanguage).eligible

export const getLatestAutoAnalysisUtterance = (
  utterances: TranscriptUtterance[],
  callLanguage: AssistantCallLanguage = 'auto'
) =>
  [...utterances]
    .reverse()
    .find((utterance) => {
      if (!isAutoAnalysisTranscriptCandidate(utterance, callLanguage)) {
        return false
      }

      return !isRapidBoundaryDuplicate(
        utterance,
        getPreviousEligibleUtterance(utterances, utterance, callLanguage) ?? undefined
      )
    })

export const getAutoAnalysisTranscriptUtterances = (
  utterances: TranscriptUtterance[],
  callLanguage: AssistantCallLanguage = 'auto'
) =>
  utterances.filter((utterance) => {
    if (!isAutoAnalysisTranscriptCandidate(utterance, callLanguage)) {
      return false
    }

    return !isRapidBoundaryDuplicate(
      utterance,
      getPreviousEligibleUtterance(utterances, utterance, callLanguage) ?? undefined
    )
  })

export const getIgnoredAutoAnalysisUtterances = (
  utterances: TranscriptUtterance[],
  callLanguage: AssistantCallLanguage = 'auto'
) =>
  utterances.filter((utterance) => {
    if (
      !utterance.isFinal ||
      utterance.speaker !== 'other' ||
      (utterance.source !== 'realtime' && utterance.source !== 'mock')
    ) {
      return false
    }

    return !getAutoAnalysisUtteranceEligibility(utterance, callLanguage).eligible
  })

export type IgnoredAutoAnalysisSummary = {
  total: number
  unsupportedLanguageCount: number
  tooShortCount: number
  lowSignalCount: number
  dominantReason: AutoAnalysisUtteranceEligibility['reason']
  latestIgnored: TranscriptUtterance | null
  latestIgnoredReason: AutoAnalysisUtteranceEligibility['reason']
}

export const summarizeIgnoredAutoAnalysisUtterances = (
  utterances: TranscriptUtterance[],
  callLanguage: AssistantCallLanguage = 'auto'
): IgnoredAutoAnalysisSummary => {
  const ignoredUtterances = getIgnoredAutoAnalysisUtterances(
    utterances,
    callLanguage
  )
  const summary = {
    total: ignoredUtterances.length,
    unsupportedLanguageCount: 0,
    tooShortCount: 0,
    lowSignalCount: 0,
    dominantReason: null as AutoAnalysisUtteranceEligibility['reason'],
    latestIgnored: ignoredUtterances.at(-1) ?? null,
    latestIgnoredReason: null as AutoAnalysisUtteranceEligibility['reason']
  }

  for (const utterance of ignoredUtterances) {
    const reason = getAutoAnalysisUtteranceEligibility(
      utterance,
      callLanguage
    ).reason

    if (reason === 'unsupported-language') {
      summary.unsupportedLanguageCount += 1
    } else if (reason === 'too-short-transcript') {
      summary.tooShortCount += 1
    } else if (reason === 'low-signal-transcript') {
      summary.lowSignalCount += 1
    }
  }

  summary.latestIgnoredReason = summary.latestIgnored
    ? getAutoAnalysisUtteranceEligibility(summary.latestIgnored, callLanguage).reason
    : null

  const rankedReasons: Array<AutoAnalysisUtteranceEligibility['reason']> = [
    'unsupported-language',
    'low-signal-transcript',
    'too-short-transcript'
  ]
  summary.dominantReason =
    rankedReasons
      .map((reason) => ({
        reason,
        count:
          reason === 'unsupported-language'
            ? summary.unsupportedLanguageCount
            : reason === 'low-signal-transcript'
              ? summary.lowSignalCount
              : summary.tooShortCount
      }))
      .sort((left, right) => right.count - left.count)[0]?.count
      ? rankedReasons
          .map((reason) => ({
            reason,
            count:
              reason === 'unsupported-language'
                ? summary.unsupportedLanguageCount
                : reason === 'low-signal-transcript'
                  ? summary.lowSignalCount
                  : summary.tooShortCount
          }))
          .sort((left, right) => right.count - left.count)[0]?.reason ?? null
      : null

  return summary
}

export const getAutoAnalysisIgnoreReasonLabel = (
  reason: AutoAnalysisUtteranceEligibility['reason']
) => {
  if (reason === 'unsupported-language') {
    return 'background/non EN-FR'
  }

  if (reason === 'too-short-transcript') {
    return 'short noise'
  }

  if (reason === 'low-signal-transcript') {
    return 'ack noise'
  }

  return 'not ignored'
}

const normalizePayloadDetail = (value: string) => value.trim().replace(/\s+/g, ' ')
const noAnalyzePayloadPlaceholder = normalizePayloadDetail('No analyze payload captured yet.')

export const buildLiveTestCockpitItems = ({
  callLanguage,
  realtimeLabel,
  assistantStatus,
  autoTranscriptText,
  selectedPackLabel,
  selectedPackState = 'none',
  currentPayloadSummary = '',
  currentPayloadDetail = '',
  currentPayloadHasWarnings = false,
  transcriptUtterances,
  latestRelevantUtteranceId,
  lastAnalyzedUtteranceId,
  lastAnalyzePayloadSummary = '',
  lastAnalyzePayloadDetail = '',
  lastAnalyzePayloadHasWarnings = false,
  lastAnalyzeTranscriptText = '',
  cooldownRemainingSeconds = 0
}: {
  callLanguage: AssistantCallLanguage
  realtimeLabel: string
  assistantStatus: AssistantStatusLabelInfo
  autoTranscriptText: string
  selectedPackLabel: string
  selectedPackState?: 'included' | 'dropped' | 'none'
  currentPayloadSummary?: string
  currentPayloadDetail?: string
  currentPayloadHasWarnings?: boolean
  transcriptUtterances: TranscriptUtterance[]
  latestRelevantUtteranceId: string | undefined
  lastAnalyzedUtteranceId: string | null
  lastAnalyzePayloadSummary?: string
  lastAnalyzePayloadDetail?: string
  lastAnalyzePayloadHasWarnings?: boolean
  lastAnalyzeTranscriptText?: string
  cooldownRemainingSeconds?: number
}): LiveTestCockpitItem[] => {
  const eligibleCount = getAutoAnalysisTranscriptUtterances(
    transcriptUtterances,
    callLanguage
  ).length
  const ignoredSummary = summarizeIgnoredAutoAnalysisUtterances(
    transcriptUtterances,
    callLanguage
  )
  const lastIgnored = ignoredSummary.latestIgnored
  const lastIgnoredReason = ignoredSummary.latestIgnoredReason
    ? getAutoAnalysisIgnoreReasonLabel(ignoredSummary.latestIgnoredReason)
    : null
  const latestRelevantUtterance = latestRelevantUtteranceId
    ? transcriptUtterances.find((utterance) => utterance.id === latestRelevantUtteranceId)
    : undefined
  const freshness =
    latestRelevantUtteranceId && lastAnalyzedUtteranceId === latestRelevantUtteranceId
      ? 'fresh'
      : latestRelevantUtteranceId
        ? 'stale'
        : 'waiting'
  const assistantValue =
    cooldownRemainingSeconds > 0
      ? `${assistantStatus.label} / ${cooldownRemainingSeconds}s`
      : assistantStatus.label
  const normalizedCurrentPayloadDetail = normalizePayloadDetail(currentPayloadDetail)
  const normalizedLastPayloadDetail = normalizePayloadDetail(lastAnalyzePayloadDetail)
  const payloadDriftState =
    lastAnalyzePayloadSummary.trim().length === 0 &&
    (normalizedLastPayloadDetail.length === 0 ||
      normalizedLastPayloadDetail === noAnalyzePayloadPlaceholder)
      ? 'not_sent'
      : currentPayloadSummary.trim() === lastAnalyzePayloadSummary.trim() &&
          normalizedCurrentPayloadDetail === normalizedLastPayloadDetail
        ? 'same'
        : 'changed'
  const lastAnalyzeTranscriptPreview =
    lastAnalyzeTranscriptText.trim().length > 0
      ? `${lastAnalyzeTranscriptText
          .trim()
          .split('\n')
          .filter((line) => line.trim().length > 0).length} lines / ${
          lastAnalyzeTranscriptText.trim().length
        } chars`
      : `${eligibleCount} lines / pending`

  return [
    {
      id: 'listening',
      label: 'Listening',
      value: `${callLanguage.toUpperCase()} / ${realtimeLabel}`,
      detail: `${eligibleCount} eligible final other-speaker line${
        eligibleCount === 1 ? '' : 's'
      } in current scope`,
      tone: realtimeLabel.toLowerCase().includes('error') ? 'error' : 'info',
      title: 'Current call-language filter and realtime listening state.'
    },
    {
      id: 'scope',
      label: 'Scope',
      value: getListeningScopeLabel(callLanguage),
      tone: 'info',
      title:
        'Only final other-speaker lines inside this language scope can trigger automatic assistant analysis.'
    },
    {
      id: 'ignored',
      label: 'Ignored',
      value:
        ignoredSummary.total === 0
          ? '0'
          : `${ignoredSummary.total} / ${
              getAutoAnalysisIgnoreReasonLabel(
                ignoredSummary.dominantReason ?? ignoredSummary.latestIgnoredReason
              )
            }`,
      detail:
        ignoredSummary.total === 0
          ? 'No final other-speaker lines ignored yet.'
          : lastIgnored
            ? `${ignoredSummary.unsupportedLanguageCount} bg · ${ignoredSummary.tooShortCount} short · ${ignoredSummary.lowSignalCount} ack. Last: ${lastIgnored.text.trim().slice(0, 64)}${
                lastIgnored.text.trim().length > 64 ? '…' : ''
              }`
            : undefined,
      tone: ignoredSummary.total === 0 ? 'ok' : 'warning',
      title: 'Final other-speaker lines ignored before automatic assistant analysis.'
    },
    {
      id: 'boundary',
      label: 'Boundary',
      value:
        ignoredSummary.total === 0
          ? 'clean'
          : lastIgnoredReason ?? ignoredSummary.dominantReason ?? 'ignored',
      detail:
        ignoredSummary.total === 0
          ? 'No ignored EN/FR boundary hits yet.'
          : lastIgnored
            ? `Last ignored: ${lastIgnored.text.trim().slice(0, 72)}${
                lastIgnored.text.trim().length > 72 ? '…' : ''
              }`
            : 'Ignored lines stayed outside the live analyze boundary.',
      tone: ignoredSummary.total === 0 ? 'ok' : 'warning',
      title:
        'Latest boundary reason for speech that was heard locally but kept out of automatic assistant analysis.'
    },
    {
      id: 'sent',
      label: 'Last sent',
      value:
        lastAnalyzeTranscriptText.trim().length > 0
          ? lastAnalyzeTranscriptPreview
          : autoTranscriptText.trim().length === 0
            ? `${eligibleCount} lines`
            : `${eligibleCount} lines / ${autoTranscriptText.trim().length} chars`,
      detail:
        lastAnalyzeTranscriptText.trim().length > 0
          ? `Trigger: ${
              latestRelevantUtterance?.text.trim().slice(0, 56) ?? 'n/a'
            }${(latestRelevantUtterance?.text.trim().length ?? 0) > 56 ? '…' : ''} · Window: ${lastAnalyzeTranscriptText.trim().slice(0, 96)}${
              lastAnalyzeTranscriptText.trim().length > 96 ? '…' : ''
            }`
          : autoTranscriptText.trim().length > 0
            ? `Trigger: ${
                latestRelevantUtterance?.text.trim().slice(0, 56) ?? 'n/a'
              }${(latestRelevantUtterance?.text.trim().length ?? 0) > 56 ? '…' : ''} · Window: ${autoTranscriptText.trim().slice(0, 96)}${
                autoTranscriptText.trim().length > 96 ? '…' : ''
              }`
            : 'No eligible transcript window yet.',
      tone:
        lastAnalyzeTranscriptText.trim().length > 0
          ? 'ok'
          : autoTranscriptText.trim().length === 0
            ? 'warning'
            : 'ok',
      title:
        lastAnalyzeTranscriptText.trim().length > 0
          ? 'Transcript window that was sent in the most recent assistant analyze request.'
          : 'Eligible transcript window that automatic analysis can send.'
    },
    {
      id: 'context',
      label: 'Current payload',
      value:
        currentPayloadSummary.trim().length > 0
          ? currentPayloadSummary
          : selectedPackState === 'none'
            ? 'No pack'
            : selectedPackLabel,
      detail: currentPayloadDetail,
      tone:
        currentPayloadHasWarnings
          ? 'warning'
          : selectedPackState === 'included'
          ? 'ok'
          : selectedPackState === 'dropped'
            ? 'warning'
            : 'warning',
      title:
        'Current selected packs and draft that would be considered if analysis runs now.'
    },
    {
      id: 'payload',
      label: 'Last payload',
      value:
        lastAnalyzePayloadSummary.trim().length > 0
          ? lastAnalyzePayloadSummary
          : 'No analyze sent yet',
      detail: lastAnalyzePayloadDetail,
      tone:
        lastAnalyzePayloadSummary.trim().length === 0
          ? 'warning'
          : lastAnalyzePayloadHasWarnings
            ? 'warning'
            : 'ok',
      title:
        'Included and dropped context that was actually attached to the most recent assistant analyze request.'
    },
    {
      id: 'payload-drift',
      label: 'Payload drift',
      value:
        payloadDriftState === 'not_sent'
          ? 'not sent yet'
          : payloadDriftState === 'same'
            ? 'same as last analyze'
            : 'changed since last analyze',
      detail:
        payloadDriftState === 'not_sent'
          ? 'No assistant analyze request has been captured yet.'
          : payloadDriftState === 'same'
            ? 'Current session payload still matches the last assistant request.'
            : `Now: ${currentPayloadSummary || 'none'} · Last: ${
                lastAnalyzePayloadSummary || 'none'
              }`,
      tone:
        payloadDriftState === 'same'
          ? 'ok'
          : payloadDriftState === 'changed'
            ? 'warning'
            : 'info',
      title:
        'Whether the current selected context still matches the payload used by the last assistant analyze request.'
    },
    {
      id: 'assistant',
      label: 'Assistant',
      value: `${assistantValue} / ${freshness}`,
      detail:
        freshness === 'fresh'
          ? 'Visible suggestion matches the latest relevant line.'
          : freshness === 'stale'
            ? 'Visible suggestion is older than the latest relevant line.'
            : 'No matched assistant suggestion yet.',
      tone:
        freshness === 'stale'
          ? 'warning'
          : assistantStatus.classNameSuffix === 'ready'
          ? 'ok'
          : assistantStatus.classNameSuffix === 'error' ||
              assistantStatus.classNameSuffix === 'retry-blocked' ||
              assistantStatus.classNameSuffix === 'auth-missing'
            ? 'error'
            : 'info',
      title: 'Assistant status and whether the visible suggestion matches the latest relevant line.'
    }
  ]
}

export const decideAutoAnalysis = ({
  latestFinalUtterance,
  transcriptText,
  callLanguage = 'auto',
  allUtterances = [],
  lastAutoAnalyzedFingerprint,
  scheduledAutoAnalysisFingerprint,
  assistantState,
  selectedCounterpartyPackIds = [],
  selectedFinderOutreachDraftId = ''
}: {
  latestFinalUtterance: TranscriptUtterance | undefined
  transcriptText: string
  callLanguage?: AssistantCallLanguage
  allUtterances?: TranscriptUtterance[]
  lastAutoAnalyzedFingerprint: string | null
  scheduledAutoAnalysisFingerprint: string | null
  assistantState: AssistantState
  selectedCounterpartyPackIds?: string[]
  selectedFinderOutreachDraftId?: string
}): LiveLoopDecision => {
  if (!latestFinalUtterance) {
    return {
      shouldRun: false,
      reason: 'no-final',
      fingerprint: null
    }
  }

  const utteranceEligibility = getAutoAnalysisUtteranceEligibility(
    latestFinalUtterance,
    callLanguage
  )

  if (!utteranceEligibility.eligible) {
    return {
      shouldRun: false,
      reason: utteranceEligibility.reason ?? 'unsupported-language',
      fingerprint: null
    }
  }

  const previousEligibleUtterance = getPreviousEligibleUtterance(
    allUtterances,
    latestFinalUtterance,
    callLanguage
  )

  if (isRapidBoundaryDuplicate(latestFinalUtterance, previousEligibleUtterance ?? undefined)) {
    return {
      shouldRun: false,
      reason: 'duplicate-boundary-transcript',
      fingerprint: null
    }
  }

  const fingerprint = getAutoAnalysisFingerprint(
    latestFinalUtterance,
    transcriptText,
    selectedCounterpartyPackIds,
    selectedFinderOutreachDraftId
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
  callLanguage,
  allUtterances = [],
  lastAutoAnalyzedFingerprint,
  scheduledAutoAnalysisFingerprint,
  assistantState,
  analysisCooldownUntil,
  nowMs,
  selectedCounterpartyPackIds,
  selectedFinderOutreachDraftId
}: LiveLoopScheduleInput): LiveLoopSchedulePlan => {
  const decision = decideAutoAnalysis({
    latestFinalUtterance,
    transcriptText,
    callLanguage,
    allUtterances,
    lastAutoAnalyzedFingerprint,
    scheduledAutoAnalysisFingerprint,
    assistantState,
    selectedCounterpartyPackIds,
    selectedFinderOutreachDraftId
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
  const previousEligibleUtterance = latestFinalUtterance
    ? getPreviousEligibleUtterance(allUtterances, latestFinalUtterance, callLanguage)
    : null
  const rapidFollowUpDelay =
    latestFinalUtterance &&
    shouldDelayRapidEligibleFollowUp(
      latestFinalUtterance,
      previousEligibleUtterance
    )
      ? AUTO_ANALYSIS_RAPID_FOLLOW_UP_DELAY_MS
      : 0

  return {
    shouldRun: true,
    reason: decision.reason,
    fingerprint: decision.fingerprint,
    delayMs: AUTO_ANALYSIS_DEBOUNCE_MS + cooldownDelay + rapidFollowUpDelay
  }
}

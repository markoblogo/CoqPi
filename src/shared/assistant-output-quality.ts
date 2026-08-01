import type {
  AssistantAnalysisResult,
  AssistantAnswerLanguage
} from './app-types'

export type AssistantOutputQualityIssue = {
  field: string
  reason: string
}

export type AssistantOutputQualityExpectation = {
  answerLanguage: AssistantAnswerLanguage
  requiredTerms?: string[]
  forbiddenTerms?: string[]
  requiresClarifyingAnswer?: boolean
}

export type AssistantOutputQualityLevel =
  | 'not_ready'
  | 'needs_attention'
  | 'ready'

export type AssistantOutputQualitySummary = {
  level: AssistantOutputQualityLevel
  headline: string
  detail: string
  issueCount: number
  issues: AssistantOutputQualityIssue[]
}

export type AssistantOutputQualitySummaryInput = {
  result: AssistantAnalysisResult
  expectation: AssistantOutputQualityExpectation
  freshness: 'fresh' | 'stale' | 'waiting'
  selectedPackCount: number
  payloadWarningCount?: number
  ignoredFinalOtherCount?: number
}

const hasCyrillic = (value: string) => /[А-Яа-яЁё]/.test(value)
const hasLatin = (value: string) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)

const includesTerm = (value: string, term: string) =>
  value.toLowerCase().includes(term.toLowerCase())

const countSentenceLikeUnits = (value: string) =>
  value.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length

const combinedOutputText = (result: AssistantAnalysisResult) =>
  [
    result.meaningRu,
    result.detectedQuestion,
    result.intent,
    result.risk,
    result.openingPhrase ?? '',
    ...result.keywordsToRemember,
    ...result.suggestedAnswers.flatMap((answer) => [
      answer.text,
      answer.answerMeaningRu
    ])
  ].join('\n')

export const validateAssistantOutputQuality = (
  result: AssistantAnalysisResult,
  expectation: AssistantOutputQualityExpectation
): AssistantOutputQualityIssue[] => {
  const issues: AssistantOutputQualityIssue[] = []

  if (!result.meaningRu.trim() || result.meaningRu.length > 220) {
    issues.push({
      field: 'meaningRu',
      reason: 'Russian meaning must be present and short.'
    })
  }

  if (result.meaningRu.trim() && !hasCyrillic(result.meaningRu)) {
    issues.push({
      field: 'meaningRu',
      reason: 'Russian meaning must stay in Russian.'
    })
  }

  if (!result.detectedQuestion.trim() || result.detectedQuestion.length > 240) {
    issues.push({
      field: 'detectedQuestion',
      reason: 'Detected question must be present and concise.'
    })
  }

  if (
    result.suggestedAnswers.length < 2 ||
    result.suggestedAnswers.length > 3
  ) {
    issues.push({
      field: 'suggestedAnswers',
      reason: 'Expected 2-3 speakable suggested answers.'
    })
  }

  for (const [index, answer] of result.suggestedAnswers.entries()) {
    if (!answer.text.trim() || answer.text.length > 260) {
      issues.push({
        field: `suggestedAnswers.${index}.text`,
        reason: 'Suggested answer must be present and short.'
      })
    }

    if (answer.text.trim() && !hasLatin(answer.text)) {
      issues.push({
        field: `suggestedAnswers.${index}.text`,
        reason: `Suggested answer must be in ${expectation.answerLanguage}.`
      })
    }

    if (hasCyrillic(answer.text)) {
      issues.push({
        field: `suggestedAnswers.${index}.text`,
        reason: 'Suggested answer text must not contain Russian explanation.'
      })
    }

    if (countSentenceLikeUnits(answer.text) > 2) {
      issues.push({
        field: `suggestedAnswers.${index}.text`,
        reason: 'Suggested answer must stay within 1-2 spoken sentences.'
      })
    }

    if (
      !answer.answerMeaningRu.trim() ||
      answer.answerMeaningRu.length > 180 ||
      !hasCyrillic(answer.answerMeaningRu)
    ) {
      issues.push({
        field: `suggestedAnswers.${index}.answerMeaningRu`,
        reason: 'Each answer needs a short Russian meaning.'
      })
    }
  }

  if (
    result.keywordsToRemember.length < 3 ||
    result.keywordsToRemember.length > 8
  ) {
    issues.push({
      field: 'keywordsToRemember',
      reason: 'Expected 3-8 words or constructions to remember.'
    })
  }

  const outputText = combinedOutputText(result)

  for (const term of expectation.requiredTerms ?? []) {
    if (!includesTerm(outputText, term)) {
      issues.push({
        field: 'context',
        reason: `Expected selected-context term "${term}" to appear.`
      })
    }
  }

  for (const term of expectation.forbiddenTerms ?? []) {
    if (includesTerm(outputText, term)) {
      issues.push({
        field: 'context',
        reason: `Forbidden unselected-context term "${term}" appeared.`
      })
    }
  }

  if (
    expectation.requiresClarifyingAnswer &&
    !result.suggestedAnswers.some((answer) => answer.label === 'clarifying')
  ) {
    issues.push({
      field: 'suggestedAnswers',
      reason: 'Expected a clarifying answer for weak selected-context fit.'
    })
  }

  return issues
}

export const buildAssistantOutputQualitySummary = ({
  result,
  expectation,
  freshness,
  selectedPackCount,
  payloadWarningCount = 0,
  ignoredFinalOtherCount = 0
}: AssistantOutputQualitySummaryInput): AssistantOutputQualitySummary => {
  const hasAnyVisibleOutput =
    result.meaningRu.trim().length > 0 ||
    result.detectedQuestion.trim().length > 0 ||
    result.suggestedAnswers.length > 0

  if (!hasAnyVisibleOutput || freshness === 'waiting') {
    return {
      level: 'not_ready',
      headline: 'No communication probe yet',
      detail:
        'Run one mock or realtime utterance and wait for a fresh assistant answer.',
      issueCount: 0,
      issues: []
    }
  }

  const issues = validateAssistantOutputQuality(result, expectation)

  if (freshness !== 'fresh') {
    issues.unshift({
      field: 'freshness',
      reason: 'Visible assistant answer is stale against the latest relevant line.'
    })
  }

  if (selectedPackCount === 0) {
    issues.unshift({
      field: 'payload',
      reason: 'No selected context pack is currently included for this session.'
    })
  }

  if (payloadWarningCount > 0) {
    issues.push({
      field: 'payload',
      reason: `Current payload drops ${payloadWarningCount} selected context item${
        payloadWarningCount === 1 ? '' : 's'
      }.`
    })
  }

  if (ignoredFinalOtherCount > 0) {
    issues.push({
      field: 'scope',
      reason: `Ignored ${ignoredFinalOtherCount} final other-speaker line${
        ignoredFinalOtherCount === 1 ? '' : 's'
      } outside EN/FR or below threshold.`
    })
  }

  if (issues.length === 0) {
    return {
      level: 'ready',
      headline: 'Communication quality looks ready',
      detail:
        'Assistant answer is fresh, short, and structurally ready for a real-call probe.',
      issueCount: 0,
      issues: []
    }
  }

  return {
    level: 'needs_attention',
    headline: 'Communication quality needs review',
    detail: issues[0]?.reason ?? 'Review the latest assistant answer before a real call.',
    issueCount: issues.length,
    issues
  }
}

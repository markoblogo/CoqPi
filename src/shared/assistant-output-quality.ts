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
}

const hasCyrillic = (value: string) => /[А-Яа-яЁё]/.test(value)
const hasLatin = (value: string) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)

const includesTerm = (value: string, term: string) =>
  value.toLowerCase().includes(term.toLowerCase())

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

  return issues
}

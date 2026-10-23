export const BRIEF_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { meaningRu: { type: 'string' }, answer: { type: 'string' } },
  required: ['meaningRu', 'answer']
} as const

export const expandBriefAssistantOutput = (outputText: string): string => {
  const value: unknown = JSON.parse(outputText)
  if (!value || typeof value !== 'object' || !('answer' in value) ||
      !('meaningRu' in value) || typeof value.answer !== 'string' ||
      typeof value.meaningRu !== 'string' || !value.answer.trim() || !value.meaningRu.trim()) {
    throw new Error('Invalid compact assistant response')
  }
  return JSON.stringify({
    meaningRu: value.meaningRu, detectedQuestion: '', intent: '', risk: '',
    suggestedAnswers: [{ label: 'short', text: value.answer, answerMeaningRu: '' }],
    keywordsToRemember: [], openingPhrase: ''
  })
}
import { parse, Allow } from 'partial-json'

export const readBriefProgress = (text: string): {meaningRu: string; answer: string} => {
  try {
    const value: unknown = parse(text, Allow.STR | Allow.OBJ)
    if (!value || typeof value !== 'object') return {meaningRu:'', answer:''}
    return {
      meaningRu: 'meaningRu' in value && typeof value.meaningRu === 'string' ? value.meaningRu : '',
      answer: 'answer' in value && typeof value.answer === 'string' ? value.answer : ''
    }
  } catch { return {meaningRu:'', answer:''} }
}

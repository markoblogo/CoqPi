import type { AssistantCallLanguage } from './app-types'

export type TranscriptLanguageHint = 'en' | 'fr' | 'mixed' | 'unknown'

export interface ProcessedTranscript {
  text: string
  languageHint: TranscriptLanguageHint
  removedNoise: boolean
}

const frenchMarkers = /\b(?:bonjour|merci|vous|votre|pourquoi|comment|pouvez|êtes|dans|avec|et)\b/giu
const englishMarkers = /\b(?:the|your|you|why|how|could|would|with|and|about|role)\b/giu

export const processTranscriptForAssistant = (
  value: unknown,
  callLanguage: AssistantCallLanguage
): ProcessedTranscript => {
  const original = typeof value === 'string' ? value : ''
  const text = original
    .replace(/\[(?:inaudible|noise|music|silence)[^\]]*\]/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()

  if (callLanguage === 'en' || callLanguage === 'fr') {
    return { text, languageHint: callLanguage, removedNoise: text !== original.trim() }
  }

  const frenchCount = text.match(frenchMarkers)?.length ?? 0
  const englishCount = text.match(englishMarkers)?.length ?? 0
  const languageHint =
    frenchCount > 0 && englishCount > 0
      ? 'mixed'
      : frenchCount > 0
        ? 'fr'
        : englishCount > 0
          ? 'en'
          : 'unknown'

  return { text, languageHint, removedNoise: text !== original.trim() }
}

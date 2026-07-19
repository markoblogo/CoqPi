import type {
  CallLanguage,
  TranscriptLanguage,
  TranscriptSpeaker
} from '@shared/app-types'

export interface MockTranscriptLine {
  speaker: TranscriptSpeaker
  text: string
  language: TranscriptLanguage
}

const englishLines: MockTranscriptLine[] = [
  {
    speaker: 'other',
    language: 'en',
    text: 'Can you tell me about yourself?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'Why are you looking for a CDI role in France now?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How would you approach AI transformation in a traditional company?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'What would your first ninety days look like as an AI Product Manager?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How would you prioritize digital transformation work in a B2B SaaS environment?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How would you digitalize the workflows of an agro-commodities brokerage team?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How do you handle professional calls when English or French fluency drops under stress?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'What attracts you to a remote or hybrid CDI role instead of freelance work?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How would you position a GTM strategy for a market-intelligence workflow product?'
  }
]

const frenchLines: MockTranscriptLine[] = [
  {
    speaker: 'other',
    language: 'fr',
    text: 'Pouvez-vous me parler de votre parcours ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Pourquoi cherchez-vous un CDI en France ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment pourriez-vous piloter une transformation IA dans une entreprise traditionnelle ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment prioriseriez-vous les chantiers de digitalisation dans une equipe produit B2B SaaS ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment pourriez-vous digitaliser les workflows d une equipe de brokerage agro-commodities ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment collaborez-vous avec les equipes produit, marketing et operations ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment gerez-vous un entretien lorsque vous comprenez plus que vous ne pouvez exprimer oralement ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Pourquoi preferez-vous un poste remote ou hybride ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment presenteriez-vous une strategie go-to-market pour un outil interne assiste par IA ?'
  }
]

const mixedLines = [...englishLines, ...frenchLines]

const cycleIndexes: Record<'Auto' | 'English' | 'French', number> = {
  Auto: 0,
  English: 0,
  French: 0
}

const linePools: Record<CallLanguage, MockTranscriptLine[]> = {
  Auto: mixedLines,
  English: englishLines,
  French: frenchLines
}

export const getNextMockTranscriptLine = (language: CallLanguage) => {
  const lines = linePools[language]
  const nextIndex = cycleIndexes[language] % lines.length

  cycleIndexes[language] += 1

  return lines[nextIndex]
}

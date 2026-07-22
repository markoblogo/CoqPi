import type {
  CallLanguage,
  TranscriptLanguage,
  TranscriptSpeaker
} from './app-types'

export type MockTranscriptScenarioId =
  | 'default'
  | 'job_interview'
  | 'investor_call'
  | 'partner_call'
  | 'french_interview'
  | 'mixed_en_fr'

export interface MockTranscriptLine {
  speaker: TranscriptSpeaker
  text: string
  language: TranscriptLanguage
}

export interface MockTranscriptScenario {
  id: MockTranscriptScenarioId
  label: string
  description: string
  lines: MockTranscriptLine[]
}

const englishInterviewLines: MockTranscriptLine[] = [
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

const frenchInterviewLines: MockTranscriptLine[] = [
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

const investorLines: MockTranscriptLine[] = [
  {
    speaker: 'other',
    language: 'en',
    text: 'What problem does your agro-commodities ecosystem solve first?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'Who is the first paying customer and why would they switch now?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How do you plan to validate supply, demand, and liquidity at the same time?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'What traction can you show before raising a larger round?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Quel est le risque principal du projet et comment voulez-vous le reduire ?'
  }
]

const partnerLines: MockTranscriptLine[] = [
  {
    speaker: 'other',
    language: 'en',
    text: 'What exactly would you need from us during a pilot?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'How would responsibilities be split between your team and ours?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Quels resultats concrets pouvons-nous attendre apres le premier mois ?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Comment protegeriez-vous nos donnees et nos relations commerciales ?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'What would make this collaboration successful for both sides?'
  }
]

const mixedEnFrLines: MockTranscriptLine[] = [
  {
    speaker: 'other',
    language: 'en',
    text: 'Can you give us the short version of your background?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Pouvez-vous expliquer votre experience produit en termes simples ?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'What should we know about your work in agro-commodities?'
  },
  {
    speaker: 'other',
    language: 'fr',
    text: 'Pourquoi ce projet est-il important maintenant ?'
  },
  {
    speaker: 'other',
    language: 'en',
    text: 'What kind of follow-up would be useful after this call?'
  }
]

const defaultLines = [...englishInterviewLines, ...frenchInterviewLines]

export const mockTranscriptScenarios: MockTranscriptScenario[] = [
  {
    id: 'default',
    label: 'Default EN/FR',
    description: 'General English and French interview questions.',
    lines: defaultLines
  },
  {
    id: 'job_interview',
    label: 'Job interview',
    description: 'English product/AI/CDI interview questions.',
    lines: englishInterviewLines
  },
  {
    id: 'investor_call',
    label: 'Investor call',
    description: 'Investor questions for the agro-commodities ecosystem.',
    lines: investorLines
  },
  {
    id: 'partner_call',
    label: 'Partner call',
    description: 'Pilot and partnership negotiation questions.',
    lines: partnerLines
  },
  {
    id: 'french_interview',
    label: 'French interview',
    description: 'French interview and self-presentation questions.',
    lines: frenchInterviewLines
  },
  {
    id: 'mixed_en_fr',
    label: 'Mixed EN/FR',
    description: 'Alternating English and French call prompts.',
    lines: mixedEnFrLines
  }
]

export const getMockTranscriptScenario = (
  scenarioId: MockTranscriptScenarioId
) =>
  mockTranscriptScenarios.find((scenario) => scenario.id === scenarioId) ??
  mockTranscriptScenarios[0]

export const getMockTranscriptScenarioLines = (
  language: CallLanguage,
  scenarioId: MockTranscriptScenarioId
) => {
  const scenario = getMockTranscriptScenario(scenarioId)

  if (language === 'English') {
    return scenario.lines.filter((line) => line.language === 'en')
  }

  if (language === 'French') {
    return scenario.lines.filter((line) => line.language === 'fr')
  }

  return scenario.lines
}


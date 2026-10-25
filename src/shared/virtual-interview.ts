import type { AssistantAnalysisRequest } from './app-types'

export const virtualQuestions = {
  en: [
    'How would you introduce yourself for this product strategy role?',
    'How would you test whether small studios need our booking product?',
    'The launch is in six weeks. What would you prioritize, without reducing testing?',
    'A customer wants a feature outside the pilot scope. How would you respond?',
    'What would you ask us before agreeing to the next stage?'
  ],
  fr: [
    'Comment vous présenteriez-vous pour ce poste en stratégie produit ?',
    'Comment vérifieriez-vous que les petits studios ont besoin de notre outil de réservation ?',
    'Le lancement est dans six semaines. Que privilégieriez-vous, sans réduire les tests ?',
    'Un client demande une fonctionnalité hors du périmètre pilote. Comment répondriez-vous ?',
    'Quelles questions nous poseriez-vous avant de convenir de la prochaine étape ?'
  ]
} as const

export interface InterviewTurnTiming {
  question: string
  requestedAt: string
  questionAudioEndedAt?: string
  firstHintMs?: number
  fullHintMs?: number
  modelMs?: number
  speechEndedAt?: string
  sttFinalMs?: number
  answerFinalAt?: string
  answerStartedAt?: string
  answerEndedAt?: string
  expectedAnswer?: string
  input: 'voice' | 'typed'
  model?: string
  error?: string
}

export const virtualRequest = (language: 'en' | 'fr', question: string, streamId: string): AssistantAnalysisRequest => ({
  practiceScenario: 'atelier-pilot-v1',
  streamId,
  responseStyle: 'brief',
  transcriptText: question,
  latestIncomingUtterance: question,
  callLanguage: language,
  answerLanguage: language,
  mode: 'full',
  includeProfileContext: false,
  selectedCounterpartyPackIds: [],
  sessionContext: {
    company: 'Atelier Pilot (fictional)',
    role: 'Product strategy interview rehearsal',
    context: 'FICTIONAL EXERCISE ONLY. The candidate is practicing a product strategy interview with Atelier Pilot, a fictional booking tool for small studios. The team plans a six-week pilot. No past achievements, employers, budgets, qualifications or commitments are specified for the candidate. Answer with proposed approaches, not invented personal history. Do not use any real owner biography. The learner reads the proposed answer aloud.',
    goal: 'Practice a concise, natural interview response. Respect the latest question and its constraints.',
    notes: 'Synthetic practice; never promote these facts to the owner profile or personal answer bank.',
    selectedCounterpartyPackIds: [],
    selectedFinderOutreachDraftId: ''
  },
  recentWindowLabel: 'full',
  costMode: 'balanced',
  assistantContextMode: 'legacy'
})

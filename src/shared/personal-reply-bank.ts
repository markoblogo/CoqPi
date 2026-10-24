export interface PersonalReply {
  id: string
  language: 'en' | 'fr'
  questions: string[]
  answer: string
  evidence: string[]
  scopeHash: string
  approvedHash: string | null
}
export interface PersonalReplyBank {
  scopeHash: string
  ownerFacts: string
  entries: PersonalReply[]
}

// Only typography is normalized. Never discard words, numbers or constraints.
export const normalizeReplyQuestion = (question: string) => question.normalize('NFC')
  .toLocaleLowerCase().replace(/[’]/g, "'").trim().replace(/\s+/g, ' ').replace(/[?.!]+$/, '').trim()

import type { AssistantAnalysisRequest } from './app-types'
export interface RehearsalMaterial { label: string; text: string; locator?: string }
export interface RehearsalDraft {
  company: string; role: string; goal: string; language: 'en' | 'fr'; maxTurns: number; confirmed: boolean
  cv: RehearsalMaterial; vacancy: RehearsalMaterial; companyInfo: RehearsalMaterial
}
export interface RehearsalSnapshot extends RehearsalDraft {
  version: 1; id: string; hash: string; createdAt: string
  materialHashes: { cv: string; vacancy: string; companyInfo: string }
}
export type RehearsalSummary = Omit<RehearsalSnapshot, 'cv' | 'vacancy' | 'companyInfo'> & {
  materials: Array<{ kind: string; label: string; hash: string; characters: number }>
}
export type EvidenceSource = 'cv' | 'vacancy' | 'company' | 'answer' | 'question'
export interface RehearsalEvidence { source: EvidenceSource; quote: string }
export interface RehearsalQuestion { question: string; evidence: RehearsalEvidence[]; reason: string; model: string; latencyMs: number }
export interface RehearsalReportItem { text: string; evidence: RehearsalEvidence[] }
export interface RehearsalReport {
  strengths: RehearsalReportItem[]; claimsToCheck: RehearsalReportItem[]; languagePoints: RehearsalReportItem[]; nextSteps: RehearsalReportItem[]
  sessionId: string; snapshotId: string; snapshotHash: string; transcriptHash: string; createdAt: string; model: string; latencyMs: number
}
export const validateRehearsalDraft = (value: RehearsalDraft): RehearsalDraft => {
  if (!value || value.confirmed !== true) throw new Error('Please confirm the exact submitted CV and reviewed materials.')
  if (!['en', 'fr'].includes(value.language)) throw new Error('Choose English or French.')
  if (!Number.isInteger(value.maxTurns) || value.maxTurns < 3 || value.maxTurns > 10) throw new Error('Choose 3–10 questions.')
  const text = (input: unknown, name: string, minimum: number, maximum: number) => {
    if (typeof input !== 'string' || input.trim().length < minimum || input.trim().length > maximum || /^https?:\/\/\S+$/i.test(input.trim())) throw new Error(`${name}: provide ${minimum}–${maximum} characters of reviewed content, not just a link.`)
    return input.trim()
  }
  const material = (item: RehearsalMaterial, name: string, min: number, max: number): RehearsalMaterial => ({ label: text(item?.label, `${name} label`, 1, 200), text: text(item?.text, name, min, max), ...(typeof item?.locator === 'string' ? { locator: item.locator.slice(0, 2000) } : {}) })
  return { company: text(value.company, 'Company', 1, 200), role: text(value.role, 'Role', 1, 200), goal: text(value.goal, 'Goal', 1, 1000), language: value.language, maxTurns: value.maxTurns, confirmed: true,
    cv: material(value.cv, 'CV', 80, 30000), vacancy: material(value.vacancy, 'Vacancy', 80, 12000), companyInfo: material(value.companyInfo, 'Company information', 40, 8000) }
}
export const validateEvidence = (value: RehearsalEvidence, sources: Partial<Record<EvidenceSource, string>>): RehearsalEvidence => {
  if (!value || !['cv', 'vacancy', 'company', 'answer', 'question'].includes(value.source) || typeof value.quote !== 'string' || value.quote.length < 4 || value.quote.length > 400 || !sources[value.source]?.includes(value.quote)) throw new Error('Unsupported source evidence in interview response. Retry manually.')
  return { source: value.source, quote: value.quote }
}
export const personalHintRequest = (snapshotId: string, sessionId: string, language: 'en' | 'fr', question: string, streamId: string): AssistantAnalysisRequest => ({
  practiceScenario: 'personal-interview-v1', rehearsalId: snapshotId, rehearsalSessionId: sessionId,
  streamId, transcriptText: question, latestIncomingUtterance: question, responseStyle: 'brief', callLanguage: language, answerLanguage: language,
  includeProfileContext: false, selectedCounterpartyPackIds: [], assistantContextMode: 'legacy', mode: 'full', costMode: 'balanced', recentWindowLabel: 'full'
})

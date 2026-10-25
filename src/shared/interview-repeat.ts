import type { InterviewAudioRequest } from './interview-audio-review'

export interface RepeatTarget extends InterviewAudioRequest { findingIndex: number }
export interface RecommendationCheck {
  quality: 'supported' | 'unsupported' | 'uncertain' | 'not_checked'
  reason: string
  heard: string
}
export interface AttemptComparison {
  outcome: 'improved' | 'not_improved' | 'uncertain' | 'same_audio' | 'not_assessed'
  reason: string
  originalEvidence: string
  repeatEvidence: string
  originalHeard?: string
  repeatHeard?: string
}
export interface RepeatAttempt {
  version: 1
  id: string
  target: RepeatTarget
  targetHash: string
  audioSessionId: string
  createdAt: string
  language: 'en' | 'fr'
  example: string
  recorded?: boolean
  captureFailed?: boolean
  comparison?: AttemptComparison & {
    check: RecommendationCheck
    originalHash: string
    repeatHash: string
    comparedAt: string
    latencyMs: number
    model: string
    ownerConfirmed: boolean
  }
}
const json = (text: string) => JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
const str = (value: unknown, limit = 800) => typeof value === 'string' ? value.trim().slice(0, limit) : ''
export const parseRecommendationCheck = (text: string): RecommendationCheck => {
  const value = json(text)
  if (!value || !['supported', 'unsupported', 'uncertain'].includes(value.quality) || !str(value.reason)) throw new Error('Invalid recommendation check; no assessment saved.')
  return { quality: Number.isFinite(value.confidence) && value.confidence >= 0.85 && value.confidence <= 1 && str(value.heard) ? value.quality : 'uncertain', reason: str(value.reason), heard: str(value.heard, 250) }
}
export const parseAttemptComparison = (text: string): AttemptComparison => {
  const value = json(text)
  if (!value || !['improved', 'not_improved', 'uncertain'].includes(value.outcome) || !str(value.reason)) throw new Error('Invalid comparison; recordings preserved.')
  return { outcome: Number.isFinite(value.confidence) && value.confidence >= 0.85 && value.confidence <= 1 && str(value.originalEvidence) && str(value.repeatEvidence) && str(value.originalHeard) && str(value.repeatHeard) ? value.outcome : 'uncertain', reason: str(value.reason), originalEvidence: str(value.originalEvidence, 400), repeatEvidence: str(value.repeatEvidence, 400), originalHeard: str(value.originalHeard, 250), repeatHeard: str(value.repeatHeard, 250) }
}
export const consistentOriginalHearing = (checked: string, compared: string) => {
  const canonical = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return !!canonical(checked) && canonical(checked) === canonical(compared)
}

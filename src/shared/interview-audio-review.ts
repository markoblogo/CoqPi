export interface AudioFinding {
  word: string
  heard: string
  explanation: string
  correction: string
  example: string
  startMs: number
  endMs: number
  confidence: number
  decision: 'pending' | 'confirmed' | 'dismissed'
}

export interface InterviewAudioReview {
  version: 1
  sessionId: string
  turnIndex: number
  language: 'en' | 'fr'
  status: 'reviewed' | 'not_assessed'
  summary: string
  findings: AudioFinding[]
  mode: 'read' | 'paraphrase'
  audioHash: string
  startOffsetMs: number
  endOffsetMs: number
  reviewedAt: string
  model: string
  latencyMs: number
}

export interface InterviewAudioRequest { sessionId: string; turnIndex: number }
export interface InterviewReviewRequest extends InterviewAudioRequest { consent: true; mode: 'read' | 'paraphrase' }

export const parseAudioFeedback = (text: string, durationMs: number): Pick<InterviewAudioReview, 'status' | 'summary' | 'findings'> => {
  const value = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  if (!value || !['reviewed', 'not_assessed'].includes(value.status) || typeof value.summary !== 'string' || !Array.isArray(value.findings)) throw new Error('Invalid audio review response. Retry manually.')
  const findings: AudioFinding[] = []
  if (value.status === 'reviewed') for (const item of value.findings) {
    if (!item || !['word', 'heard', 'explanation', 'correction', 'example'].every(key => typeof item[key] === 'string' && item[key].trim()) ||
      !Number.isFinite(item.confidence) || item.confidence < 0.8 || item.confidence > 1 ||
      !Number.isFinite(item.startMs) || !Number.isFinite(item.endMs) || item.startMs < 0 || item.endMs <= item.startMs || item.endMs > durationMs) continue
    findings.push({ word: item.word.slice(0, 100), heard: item.heard.slice(0, 100), explanation: item.explanation.slice(0, 700), correction: item.correction.slice(0, 500), example: item.example.slice(0, 300), startMs: item.startMs, endMs: item.endMs, confidence: item.confidence, decision: 'pending' })
    if (findings.length === 3) break
  }
  return { status: value.status, summary: value.summary.slice(0, 1000), findings }
}

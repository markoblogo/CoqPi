import type {
  MonitorLiveCopilotRequest,
  TranscriptUtterance
} from './app-types'

export const MONITOR_LIVE_COPILOT_DEBOUNCE_MS = 900
export const MONITOR_LIVE_COPILOT_MAX_SEGMENTS = 12
export const MONITOR_LIVE_COPILOT_MAX_CHARS = 8_000

const cleanText = (value: unknown, limit: number) =>
  String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, limit)

export const buildMonitorLiveCopilotRequest = (input: {
  sequence: number
  utterances: TranscriptUtterance[]
  clientName?: string
}): MonitorLiveCopilotRequest => {
  const eligible = input.utterances
    .filter(utterance => utterance.isFinal && utterance.speaker === 'other')
    .slice(-MONITOR_LIVE_COPILOT_MAX_SEGMENTS)

  let remaining = MONITOR_LIVE_COPILOT_MAX_CHARS
  const reversed = eligible.reverse().flatMap(utterance => {
    if (remaining <= 0) return []
    const text = cleanText(utterance.text, Math.min(4_000, remaining))
    if (!text) return []
    remaining -= text.length
    return [{
      id: cleanText(utterance.id, 120),
      timestamp: cleanText(utterance.timestampStart, 40),
      speaker: 'OTHER' as const,
      text
    }]
  })

  return {
    sequence: Math.max(0, Math.trunc(input.sequence)),
    segments: reversed.reverse(),
    ...(cleanText(input.clientName, 240)
      ? { clientName: cleanText(input.clientName, 240) }
      : {})
  }
}

export const buildMonitorLiveCopilotFingerprint = (
  request: MonitorLiveCopilotRequest
) => request.segments.map(segment => `${segment.id}:${segment.text}`).join('|')

export const shouldApplyMonitorLiveCopilotResponse = (
  responseSequence: number,
  latestSequence: number
) => responseSequence === latestSequence

export const parseMonitorLiveCopilotSetup = (value: string) => {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Paste the CoqPi setup copied from a Monitor client card.')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Monitor setup is invalid.')
  }
  const candidate = parsed as Record<string, unknown>
  const monitorBaseUrl = cleanText(candidate.monitorBaseUrl, 500)
  const monitorCompanyId = cleanText(candidate.companyId, 180)
  const monitorClientName = cleanText(candidate.clientName, 240)
  if (!monitorBaseUrl || !monitorCompanyId) {
    throw new Error('Monitor setup must include its URL and client ID.')
  }
  return { monitorBaseUrl, monitorCompanyId, monitorClientName }
}

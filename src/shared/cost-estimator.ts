import type { AssistantCostMode } from './app-types'

export const COST_GUARDRAILS = {
  realtimeWarnMinutes: 30,
  assistantWarnCount: 30,
  assistantWarnChars: 8000,
  assistantHardCapChars: 12000
} as const

export const PROFILE_CONTEXT_CHARS_LIMIT_BY_MODE = {
  economy: 1800,
  balanced: 4000,
  quality: 7000
} as const

export const APPROXIMATE_COST_MODEL = {
  economy: {
    transcriptPer1kChars: 0.002,
    profileContextPer1kChars: 0.001,
    realtimePerMinute: 0.003
  },
  balanced: {
    transcriptPer1kChars: 0.004,
    profileContextPer1kChars: 0.002,
    realtimePerMinute: 0.005
  },
  quality: {
    transcriptPer1kChars: 0.008,
    profileContextPer1kChars: 0.004,
    realtimePerMinute: 0.009
  }
} as const satisfies Record<
  AssistantCostMode,
  {
    transcriptPer1kChars: number
    profileContextPer1kChars: number
    realtimePerMinute: number
  }
>

export const estimateAssistantRequestCost = (
  transcriptChars: number,
  profileChars: number,
  costMode: AssistantCostMode
) => {
  const pricing = APPROXIMATE_COST_MODEL[costMode]

  return (
    (Math.max(0, transcriptChars) / 1000) * pricing.transcriptPer1kChars +
    (Math.max(0, profileChars) / 1000) * pricing.profileContextPer1kChars
  )
}

export const estimateSessionCost = (
  realtimeMinutes: number,
  transcriptChars: number,
  profileChars: number,
  costMode: AssistantCostMode
) => {
  const pricing = APPROXIMATE_COST_MODEL[costMode]

  return (
    Math.max(0, realtimeMinutes) * pricing.realtimePerMinute +
    estimateAssistantRequestCost(transcriptChars, profileChars, costMode)
  )
}

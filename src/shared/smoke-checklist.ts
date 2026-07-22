export type SmokeChecklistStepId =
  | 'api_key'
  | 'mock_line'
  | 'auto_window'
  | 'assistant_answer'
  | 'context_pack'
  | 'live_mic'

export type SmokeChecklistMark = 'open' | 'done' | 'blocked'

export type SmokeChecklistReadiness = {
  apiKeyAvailable: boolean
  mockModeEnabled: boolean
  transcriptCount: number
  autoWindowChars: number
  assistantLabel: string
  assistantFreshness: 'fresh' | 'stale' | 'waiting'
  selectedPackCount: number
  realtimeReady: boolean
}

export type SmokeChecklistStep = {
  id: SmokeChecklistStepId
  title: string
  action: string
  expected: string
}

export type SmokeChecklistItem = SmokeChecklistStep & {
  status: SmokeChecklistMark | 'ready' | 'waiting'
  readiness: string
}

export type SmokeChecklistSummary = {
  doneCount: number
  totalCount: number
  activeStepId: SmokeChecklistStepId
  activeTitle: string
  progressLabel: string
  items: SmokeChecklistItem[]
}

export const smokeChecklistSteps: SmokeChecklistStep[] = [
  {
    id: 'api_key',
    title: 'Key and setup',
    action: 'Open Settings and confirm the OpenAI key is available.',
    expected: 'Top bar shows Key: ok.'
  },
  {
    id: 'mock_line',
    title: 'Mock line',
    action: 'Enable Mock Transcript Mode, choose a scenario, and add one line.',
    expected: 'Transcript gets one final EN/FR line.'
  },
  {
    id: 'auto_window',
    title: 'Auto window',
    action: 'Check the Live test cockpit after the mock line.',
    expected: 'Auto window shows at least one eligible line.'
  },
  {
    id: 'assistant_answer',
    title: 'Assistant answer',
    action: 'Run Analyze 2m or wait for auto-analysis.',
    expected: 'Assist/Answers show a fresh result.'
  },
  {
    id: 'context_pack',
    title: 'Context pack',
    action: 'Select the pack for this call in Prepare or Context.',
    expected: 'Live cockpit shows an active pack context.'
  },
  {
    id: 'live_mic',
    title: 'Live mic',
    action: 'Start realtime listening and say one short EN/FR sentence.',
    expected: 'Realtime status becomes listening and transcript updates.'
  }
]

const getReadiness = (
  stepId: SmokeChecklistStepId,
  readiness: SmokeChecklistReadiness
) => {
  if (stepId === 'api_key') {
    return readiness.apiKeyAvailable ? 'ready' : 'needs API key'
  }

  if (stepId === 'mock_line') {
    if (!readiness.mockModeEnabled) {
      return 'enable mock mode'
    }

    return readiness.transcriptCount > 0 ? 'line present' : 'ready'
  }

  if (stepId === 'auto_window') {
    return readiness.autoWindowChars > 0 ? 'ready' : 'waiting for eligible line'
  }

  if (stepId === 'assistant_answer') {
    if (readiness.assistantFreshness === 'fresh') {
      return `${readiness.assistantLabel} / fresh`
    }

    return `${readiness.assistantLabel} / ${readiness.assistantFreshness}`
  }

  if (stepId === 'context_pack') {
    return readiness.selectedPackCount > 0
      ? `${readiness.selectedPackCount} selected`
      : 'no pack selected'
  }

  return readiness.realtimeReady ? 'ready' : 'mic/key not ready'
}

const getAutoStatus = (
  stepId: SmokeChecklistStepId,
  readiness: SmokeChecklistReadiness
): 'ready' | 'waiting' => {
  if (stepId === 'api_key') {
    return readiness.apiKeyAvailable ? 'ready' : 'waiting'
  }

  if (stepId === 'mock_line') {
    return readiness.mockModeEnabled ? 'ready' : 'waiting'
  }

  if (stepId === 'auto_window') {
    return readiness.autoWindowChars > 0 ? 'ready' : 'waiting'
  }

  if (stepId === 'assistant_answer') {
    return readiness.assistantFreshness === 'fresh' ? 'ready' : 'waiting'
  }

  if (stepId === 'context_pack') {
    return readiness.selectedPackCount > 0 ? 'ready' : 'waiting'
  }

  return readiness.realtimeReady ? 'ready' : 'waiting'
}

export const buildSmokeChecklistSummary = (
  readiness: SmokeChecklistReadiness,
  marks: Partial<Record<SmokeChecklistStepId, SmokeChecklistMark>> = {}
): SmokeChecklistSummary => {
  const items = smokeChecklistSteps.map((step) => {
    const mark = marks[step.id]

    return {
      ...step,
      status: mark && mark !== 'open' ? mark : getAutoStatus(step.id, readiness),
      readiness: getReadiness(step.id, readiness)
    }
  })
  const doneCount = items.filter((item) => item.status === 'done').length
  const activeItem =
    items.find((item) => item.status !== 'done') ?? items[items.length - 1]

  return {
    doneCount,
    totalCount: items.length,
    activeStepId: activeItem.id,
    activeTitle: activeItem.title,
    progressLabel: `${doneCount}/${items.length}`,
    items
  }
}

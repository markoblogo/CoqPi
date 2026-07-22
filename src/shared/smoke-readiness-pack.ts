import type { CounterpartyPackQualityLevel } from './context-pack-quality'

export type SmokeReadinessGateStatus = 'ready' | 'waiting' | 'blocked'

export type SmokeReadinessGate = {
  id: 'setup' | 'context' | 'mock_path' | 'assistant' | 'real_mic'
  label: string
  status: SmokeReadinessGateStatus
  detail: string
}

export type SmokeReadinessScenarioStep = {
  id: 'select_pack' | 'mock_transcript' | 'assistant_answer' | 'real_mic'
  title: string
  action: string
  status: SmokeReadinessGateStatus
}

export type SmokeReadinessPack = {
  status: 'needs_prep' | 'ready_for_mock' | 'ready_for_real_mic'
  headline: string
  nextAction: string
  gates: SmokeReadinessGate[]
  scenario: SmokeReadinessScenarioStep[]
}

export type SmokeReadinessPackInput = {
  apiKeyAvailable: boolean
  selectedPackCount: number
  selectedPackLabel: string
  selectedPackQualityLevel: CounterpartyPackQualityLevel | 'none'
  weakFieldCount: number
  mockModeEnabled: boolean
  transcriptCount: number
  autoWindowChars: number
  assistantFreshness: 'fresh' | 'stale' | 'waiting'
  realtimeReady: boolean
}

const isPackQualityUsable = (
  qualityLevel: CounterpartyPackQualityLevel | 'none'
) => qualityLevel === 'strong' || qualityLevel === 'usable'

export const buildSmokeReadinessPack = (
  input: SmokeReadinessPackInput
): SmokeReadinessPack => {
  const setupReady = input.apiKeyAvailable
  const contextReady =
    input.selectedPackCount > 0 &&
    isPackQualityUsable(input.selectedPackQualityLevel) &&
    input.weakFieldCount === 0
  const mockPathReady =
    input.mockModeEnabled &&
    input.transcriptCount > 0 &&
    input.autoWindowChars > 0
  const assistantReady = input.assistantFreshness === 'fresh'
  const realMicReady = input.realtimeReady

  const gates: SmokeReadinessGate[] = [
    {
      id: 'setup',
      label: 'Setup',
      status: setupReady ? 'ready' : 'waiting',
      detail: setupReady ? 'OpenAI key available' : 'Add or unlock OpenAI key'
    },
    {
      id: 'context',
      label: 'Context',
      status:
        input.selectedPackCount === 0 ||
        input.selectedPackQualityLevel === 'blocked'
          ? 'blocked'
          : contextReady
            ? 'ready'
            : 'waiting',
      detail:
        input.selectedPackCount === 0
          ? 'Select one pack before testing'
          : `${input.selectedPackLabel} · ${input.selectedPackQualityLevel}`
    },
    {
      id: 'mock_path',
      label: 'Mock path',
      status: mockPathReady ? 'ready' : 'waiting',
      detail: mockPathReady
        ? 'Mock transcript can feed assistant'
        : 'Enable mock mode and add one EN/FR line'
    },
    {
      id: 'assistant',
      label: 'Assistant',
      status: assistantReady ? 'ready' : 'waiting',
      detail: assistantReady
        ? 'Fresh assistant answer exists'
        : 'Run Analyze after mock transcript'
    },
    {
      id: 'real_mic',
      label: 'Real mic',
      status: realMicReady ? 'ready' : 'waiting',
      detail: realMicReady ? 'Mic/key ready' : 'Real mic smoke remains pending'
    }
  ]

  const readyForMock = setupReady && contextReady
  const readyForRealMic = readyForMock && mockPathReady && assistantReady

  const status = readyForRealMic
    ? 'ready_for_real_mic'
    : readyForMock
      ? 'ready_for_mock'
      : 'needs_prep'

  const nextAction =
    status === 'ready_for_real_mic'
      ? 'When ready, start realtime and say one short EN/FR sentence.'
      : status === 'ready_for_mock'
        ? 'Run mock transcript, then Analyze 2m.'
        : gates.find((gate) => gate.status !== 'ready')?.detail ??
          'Prepare context before smoke.'

  return {
    status,
    headline:
      status === 'ready_for_real_mic'
        ? 'Ready for a short real mic smoke'
        : status === 'ready_for_mock'
          ? 'Ready for mock assistant smoke'
          : 'Prep needs attention before smoke',
    nextAction,
    gates,
    scenario: [
      {
        id: 'select_pack',
        title: 'Select pack',
        action: 'Choose the one counterparty pack for this test session.',
        status: contextReady ? 'ready' : 'waiting'
      },
      {
        id: 'mock_transcript',
        title: 'Mock transcript',
        action: 'Enable Mock Transcript Mode and add one line.',
        status: mockPathReady ? 'ready' : 'waiting'
      },
      {
        id: 'assistant_answer',
        title: 'Assistant answer',
        action: 'Run Analyze 2m and check the fresh answer.',
        status: assistantReady ? 'ready' : 'waiting'
      },
      {
        id: 'real_mic',
        title: 'Real mic smoke',
        action: 'Start realtime and say one short EN/FR sentence.',
        status: readyForRealMic && realMicReady ? 'ready' : 'waiting'
      }
    ]
  }
}

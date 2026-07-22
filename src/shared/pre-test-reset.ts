export type PreTestResetPlan = {
  label: string
  clears: string[]
  preserves: string[]
}

export const preTestResetPlan: PreTestResetPlan = {
  label: 'Reset for test',
  clears: [
    'transcript',
    'assistant result',
    'assistant errors',
    'mock playback',
    'smoke checklist marks',
    'cost notice',
    'session counters',
    'realtime timer'
  ],
  preserves: [
    'profile context',
    'session context',
    'selected counterparty packs',
    'OpenAI key',
    'audio device'
  ]
}

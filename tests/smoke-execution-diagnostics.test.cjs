const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSmokeExecutionDiagnostics
} = require('../dist-electron/shared/smoke-execution-diagnostics.js')

const makeInput = (overrides = {}) => ({
  audioPermissionStatus: 'granted',
  hasSelectedAudioDevice: true,
  audioLevelStatus: 'active',
  realtimeStatus: 'listening',
  realtimeHealthLabel: 'Receiving transcript',
  realtimeElapsedSeconds: 12,
  realtimeError: null,
  lastSanitizedRealtimeError: null,
  transcriptCount: 1,
  eligibleTranscriptCount: 1,
  ignoredTranscriptCount: 0,
  lastIgnoredReasonLabel: null,
  lastIgnoredText: null,
  assistantFreshness: 'fresh',
  assistantError: null,
  assistantErrorCode: null,
  assistantStatusLabel: 'Ready',
  assistantQualityLevel: 'ready',
  assistantQualityDetail: 'Fresh and concise.',
  selectedPackCount: 1,
  currentPayloadWarningCount: 0,
  lastAnalyzePayloadWarningCount: 0,
  realtimeEventCounters: {
    total: 8,
    delta: 3,
    completed: 2,
    failed: 0,
    genericError: 0
  },
  realtimeLifecycleLog: ['22:10:03 - data channel open'],
  realtimeEventTypes: ['conversation.item.input_audio_transcription.completed'],
  ...overrides
})

test('smoke execution diagnostics reports realtime startup failure first', () => {
  const diagnostics = buildSmokeExecutionDiagnostics(
    makeInput({
      realtimeStatus: 'error',
      realtimeHealthLabel: 'Error',
      realtimeError: 'Unable to start realtime transcription.',
      lastSanitizedRealtimeError: 'backend SDP answer requested -> provider timeout',
      transcriptCount: 0,
      eligibleTranscriptCount: 0,
      assistantFreshness: 'waiting'
    })
  )

  assert.equal(diagnostics.status, 'blocked')
  assert.equal(diagnostics.firstFailure?.stage, 'realtime')
  assert.match(diagnostics.summary, /provider timeout/)
  assert.match(diagnostics.notePrefill.broken, /provider timeout/)
  assert.match(diagnostics.notePrefill.nextFix, /Review the lifecycle trace/)
})

test('smoke execution diagnostics reports ignored transcript boundary before assistant', () => {
  const diagnostics = buildSmokeExecutionDiagnostics(
    makeInput({
      transcriptCount: 1,
      eligibleTranscriptCount: 0,
      ignoredTranscriptCount: 1,
      lastIgnoredReasonLabel: 'low signal',
      lastIgnoredText: 'Okay, thanks.',
      assistantFreshness: 'waiting'
    })
  )

  assert.equal(diagnostics.status, 'attention')
  assert.equal(diagnostics.firstFailure?.stage, 'transcript')
  assert.match(diagnostics.summary, /Okay, thanks/)
  assert.match(diagnostics.notePrefill.nextFix, /Use one clear EN\/FR sentence/)
})

test('smoke execution diagnostics reports ready state when live path is healthy', () => {
  const diagnostics = buildSmokeExecutionDiagnostics(makeInput())

  assert.equal(diagnostics.status, 'ready')
  assert.equal(diagnostics.firstFailure, null)
  assert.match(diagnostics.headline, /looks healthy/)
  assert.match(diagnostics.notePrefill.worked, /assistant returned a fresh suggestion/)
  assert.equal(diagnostics.notePrefill.broken, '')
})

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildLiveTestCockpitItems,
  buildAutoAnalysisSchedule,
  getAutoAnalysisTranscriptUtterances,
  getAutoAnalysisIgnoreReasonLabel
} = require('../dist-electron/shared/live-loop.js')

const {
  buildSmokeExecutionDiagnostics
} = require('../dist-electron/shared/smoke-execution-diagnostics.js')

const makeUtterance = ({ id, language, text, timestampStart, timestampEnd, source = 'mock' }) => ({
  id,
  speaker: 'other',
  text,
  isFinal: true,
  source,
  language,
  timestampStart,
  timestampEnd
})

test('pass2 live smoke readiness blocks non-scope noise and keeps payload on latest selected pack', () => {
  const noiseRu = makeUtterance({
    id: 'u-noise-1',
    language: 'ru',
    text: 'Сделай мне пожалуйста чай, спасибо',
    timestampStart: '2026-08-03T10:00:00.000Z',
    timestampEnd: '2026-08-03T10:00:00.100Z'
  })
  const noiseAck = makeUtterance({
    id: 'u-noise-2',
    language: 'en',
    text: 'Okay, thanks.',
    timestampStart: '2026-08-03T10:00:01.000Z',
    timestampEnd: '2026-08-03T10:00:01.080Z'
  })
  const eligible = makeUtterance({
    id: 'u-live-1',
    language: 'en',
    text: 'Can you tell me how you built the product roadmap and shipped it across teams?',
    timestampStart: '2026-08-03T10:00:02.000Z',
    timestampEnd: '2026-08-03T10:00:02.450Z'
  })

  const transcriptWindow = getAutoAnalysisTranscriptUtterances(
    [noiseRu, noiseAck, eligible],
    'auto'
  )

  assert.equal(transcriptWindow.length, 1)
  assert.equal(transcriptWindow[0].id, 'u-live-1')

  const ignoredReason = getAutoAnalysisIgnoreReasonLabel('unsupported-language')
  const ignoredReason2 = getAutoAnalysisIgnoreReasonLabel('low-signal-transcript')
  assert.equal(ignoredReason, 'background/non EN-FR')
  assert.equal(ignoredReason2, 'ack noise')

  const planWithPackA = buildAutoAnalysisSchedule({
    latestFinalUtterance: eligible,
    transcriptText: transcriptWindow.map((utterance) => utterance.text).join('\n'),
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now() + 80,
    selectedCounterpartyPackIds: ['finder:job:pack-a'],
    selectedFinderOutreachDraftId: 'draft-a'
  })

  assert.equal(planWithPackA.shouldRun, true)
  assert.equal(planWithPackA.fingerprint.includes('::packs:finder:job:pack-a'), true)
  assert.equal(planWithPackA.fingerprint.includes('::draft:draft-a'), true)

  const planWithPackB = buildAutoAnalysisSchedule({
    latestFinalUtterance: eligible,
    transcriptText: transcriptWindow.map((utterance) => utterance.text).join('\n'),
    lastAutoAnalyzedFingerprint: planWithPackA.fingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now() + 80,
    selectedCounterpartyPackIds: ['finder:job:pack-b'],
    selectedFinderOutreachDraftId: 'draft-b'
  })

  assert.equal(planWithPackB.shouldRun, true)
  assert.equal(planWithPackB.fingerprint.includes('::packs:finder:job:pack-b'), true)
  assert.equal(planWithPackB.fingerprint.includes('::draft:draft-b'), true)
  assert.equal(planWithPackB.fingerprint.includes('finder:job:pack-a'), false)

  const cockpit = buildLiveTestCockpitItems({
    callLanguage: 'auto',
    realtimeLabel: 'listening',
    assistantStatus: {
      label: 'Ready',
      classNameSuffix: 'ready'
    },
    autoTranscriptText: transcriptWindow.map((utterance) => utterance.text).join('\n'),
    selectedPackLabel: 'Pack B',
    selectedPackState: 'included',
    currentPayloadSummary: 'included packs 1 · dropped 1 · draft included · profile 120 chars',
    currentPayloadDetail: 'in Pack B · draft draft-b · drop Pack A: selected candidate replaced',
    currentPayloadHasWarnings: true,
    transcriptUtterances: [noiseRu, noiseAck, eligible],
    latestRelevantUtteranceId: eligible.id,
    lastAnalyzedUtteranceId: eligible.id,
    lastAnalyzePayloadSummary: 'included packs 1 · dropped 0 · draft included · profile 120 chars',
    lastAnalyzePayloadDetail: 'in Pack A · draft draft-a',
    lastAnalyzePayloadHasWarnings: false,
    lastAnalyzeTranscriptText: transcriptWindow.map((utterance) => utterance.text).join('\n'),
    cooldownRemainingSeconds: 0
  })
  const cockpitItems = Object.fromEntries(cockpit.map((item) => [item.id, item]))

  assert.equal(cockpitItems['payload-drift'].value, 'changed since last analyze')
  assert.equal(cockpitItems['payload-drift'].tone, 'warning')
  assert.equal(cockpitItems.assistant.value, 'Ready / fresh')
  assert.equal(cockpitItems.assistant.tone, 'ok')
  assert.equal(cockpitItems.sent.value.includes('1 lines'), true)
})

test('pass2 smoke diagnostics captures noise-first failures and payload mismatch readiness', () => {
  const diagnostics = buildSmokeExecutionDiagnostics({
    audioPermissionStatus: 'granted',
    hasSelectedAudioDevice: true,
    audioLevelStatus: 'active',
    realtimeStatus: 'listening',
    realtimeHealthLabel: 'Receiving transcript',
    realtimeElapsedSeconds: 11,
    realtimeError: null,
    lastSanitizedRealtimeError: null,
    transcriptCount: 3,
    eligibleTranscriptCount: 0,
    ignoredTranscriptCount: 2,
    ignoredUnsupportedLanguageCount: 1,
    ignoredLowSignalCount: 1,
    lastIgnoredReasonLabel: 'background/non EN-FR',
    lastIgnoredText: 'Сделай мне пожалуйста чай, спасибо',
    assistantFreshness: 'stale',
    assistantError: null,
    assistantErrorCode: null,
    assistantStatusLabel: 'Ready',
    assistantQualityLevel: 'ready',
    assistantQualityDetail: 'Assistant was fresh for previous pack before switch.',
    selectedPackCount: 1,
    currentPayloadSummaryLabel: 'included packs 1 · dropped 1 · draft included · profile 120 chars',
    lastAnalyzePayloadSummaryLabel: 'included packs 1 · dropped 0 · draft included · profile 120 chars',
    currentPayloadWarningCount: 1,
    lastAnalyzePayloadWarningCount: 0,
    realtimeEventCounters: {
      total: 11,
      delta: 4,
      completed: 9,
      failed: 0,
      genericError: 0
    },
    realtimeLifecycleLog: ['10:01:00 transcript.started', '10:01:01 transcript.completed'],
    realtimeEventTypes: [
      'conversation.item.input_audio_transcription.completed'
    ]
  })

  assert.equal(diagnostics.status, 'attention')
  assert.equal(diagnostics.firstFailure?.stage, 'transcript')
  assert.match(diagnostics.firstFailure?.title ?? '', /Speech was captured but ignored before analysis/)
  assert.match(diagnostics.trace.find((item) => item.id === 'payload')?.detail ?? '', /current included packs 1 · dropped 1/)
  assert.equal(diagnostics.trace.find((item) => item.id === 'payload')?.tone, 'warning')
  assert.match(diagnostics.notePrefill.broken, /background|short/i)
})

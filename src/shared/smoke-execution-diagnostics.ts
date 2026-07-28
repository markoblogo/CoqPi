import type {
  AssistantAnalysisError,
  AudioInputPermissionStatus,
  AudioLevelStatus,
  RealtimeConnectionStatus
} from './app-types'

export type SmokeExecutionDiagnosticsStatus = 'ready' | 'attention' | 'blocked'

export type SmokeExecutionFailureStage =
  | 'setup'
  | 'realtime'
  | 'transcript'
  | 'assistant'
  | 'quality'

export type SmokeExecutionFailure = {
  stage: SmokeExecutionFailureStage
  title: string
  detail: string
  recovery: string
}

export type SmokeExecutionTraceTone = 'ok' | 'info' | 'warning' | 'error'

export type SmokeExecutionTraceItem = {
  id: string
  label: string
  detail: string
  tone: SmokeExecutionTraceTone
}

export type SmokeExecutionDiagnostics = {
  status: SmokeExecutionDiagnosticsStatus
  headline: string
  summary: string
  firstFailure: SmokeExecutionFailure | null
  trace: SmokeExecutionTraceItem[]
  notePrefill: {
    worked: string
    broken: string
    nextFix: string
  }
}

export type SmokeExecutionDiagnosticsInput = {
  audioPermissionStatus: AudioInputPermissionStatus
  hasSelectedAudioDevice: boolean
  audioLevelStatus: AudioLevelStatus
  realtimeStatus: RealtimeConnectionStatus
  realtimeHealthLabel: string
  realtimeElapsedSeconds: number
  realtimeError: string | null
  lastSanitizedRealtimeError: string | null
  transcriptCount: number
  eligibleTranscriptCount: number
  ignoredTranscriptCount: number
  lastIgnoredReasonLabel?: string | null
  lastIgnoredText?: string | null
  assistantFreshness: 'fresh' | 'stale' | 'waiting'
  assistantError: string | null
  assistantErrorCode: AssistantAnalysisError['code'] | null
  assistantStatusLabel: string
  assistantQualityLevel: 'not_ready' | 'needs_attention' | 'ready'
  assistantQualityDetail: string
  selectedPackCount: number
  currentPayloadWarningCount: number
  lastAnalyzePayloadWarningCount: number
  realtimeEventCounters: {
    total: number
    delta: number
    completed: number
    failed: number
    genericError: number
  }
  realtimeLifecycleLog: string[]
  realtimeEventTypes: string[]
}

const joinWorkedSummary = (parts: string[]) =>
  parts.filter(Boolean).slice(0, 5).join('; ')

export const buildSmokeExecutionDiagnostics = (
  input: SmokeExecutionDiagnosticsInput
): SmokeExecutionDiagnostics => {
  const workedParts: string[] = []

  if (input.audioPermissionStatus === 'granted' && input.hasSelectedAudioDevice) {
    workedParts.push('mic permission and input device are ready')
  }

  if (
    input.realtimeStatus === 'connected' ||
    input.realtimeStatus === 'listening' ||
    input.realtimeStatus === 'stopped' ||
    input.realtimeStatus === 'error'
  ) {
    workedParts.push(`realtime path reached ${input.realtimeStatus}`)
  }

  if (input.transcriptCount > 0) {
    workedParts.push(`${input.transcriptCount} transcript line(s) captured`)
  }

  if (input.eligibleTranscriptCount > 0) {
    workedParts.push(`${input.eligibleTranscriptCount} eligible EN/FR line(s) reached auto-analysis`)
  }

  if (input.assistantFreshness === 'fresh') {
    workedParts.push('assistant returned a fresh suggestion')
  }

  let firstFailure: SmokeExecutionFailure | null = null

  if (input.audioPermissionStatus === 'denied') {
    firstFailure = {
      stage: 'setup',
      title: 'Microphone permission is denied',
      detail: 'Realtime smoke cannot start until microphone access is granted.',
      recovery: 'Allow microphone access in macOS settings, then retry Start.'
    }
  } else if (!input.hasSelectedAudioDevice) {
    firstFailure = {
      stage: 'setup',
      title: 'No input device is selected',
      detail: 'Realtime smoke has no active microphone source.',
      recovery: 'Choose an input device in Settings / Debug before starting realtime.'
    }
  } else if (input.realtimeStatus === 'error') {
    firstFailure = {
      stage: 'realtime',
      title: 'Realtime path failed before a stable transcript',
      detail:
        input.lastSanitizedRealtimeError ||
        input.realtimeError ||
        'Realtime connection entered error state.',
      recovery: 'Review the lifecycle trace and retry Start after fixing the first error.'
    }
  } else if (
    input.realtimeElapsedSeconds >= 8 &&
    input.transcriptCount === 0 &&
    (input.audioLevelStatus === 'silent' || input.audioLevelStatus === 'low')
  ) {
    firstFailure = {
      stage: 'transcript',
      title: 'Speech signal did not reach the mic path',
      detail:
        'Realtime is running, but the local audio level stayed silent/low and no transcript arrived.',
      recovery: 'Check the selected microphone, speak closer, and retry a short EN/FR sentence.'
    }
  } else if (
    input.realtimeElapsedSeconds >= 8 &&
    input.transcriptCount === 0 &&
    (input.audioLevelStatus === 'active' || input.audioLevelStatus === 'loud')
  ) {
    firstFailure = {
      stage: 'transcript',
      title: 'Audio signal was present but no transcript arrived',
      detail:
        'The local audio meter reacted, but realtime did not produce transcript lines yet.',
      recovery: 'Inspect lifecycle/event trace for transport or realtime event gaps, then retry.'
    }
  } else if (
    input.ignoredTranscriptCount > 0 &&
    input.eligibleTranscriptCount === 0
  ) {
    firstFailure = {
      stage: 'transcript',
      title: 'Speech was captured but ignored before analysis',
      detail: input.lastIgnoredText
        ? `Last ignored line (${input.lastIgnoredReasonLabel ?? 'ignored'}): ${input.lastIgnoredText}`
        : `Ignored transcript lines: ${input.ignoredTranscriptCount} (${input.lastIgnoredReasonLabel ?? 'ignored'}).`,
      recovery:
        'Use one clear EN/FR sentence with enough signal and avoid short acknowledgements or background speech.'
    }
  } else if (input.assistantErrorCode || input.assistantError) {
    firstFailure = {
      stage: 'assistant',
      title: 'Transcript reached assistant path but analysis failed',
      detail:
        input.assistantError ||
        `Assistant status stopped at ${input.assistantStatusLabel}.`,
      recovery: 'Retry after the shown provider/budget issue is cleared.'
    }
  } else if (input.assistantFreshness === 'stale') {
    firstFailure = {
      stage: 'assistant',
      title: 'Assistant suggestion is stale',
      detail: 'The visible answer does not match the latest relevant transcript line.',
      recovery: 'Wait for the next analyze cycle or trigger a manual retry on the latest line.'
    }
  } else if (input.assistantQualityLevel === 'needs_attention') {
    firstFailure = {
      stage: 'quality',
      title: 'Assistant answer quality is not ready for a real call',
      detail: input.assistantQualityDetail,
      recovery: 'Fix the selected pack/payload issue or rerun the probe until the answer is fresh and concise.'
    }
  } else if (
    input.selectedPackCount === 0 ||
    input.currentPayloadWarningCount > 0 ||
    input.lastAnalyzePayloadWarningCount > 0
  ) {
    firstFailure = {
      stage: 'quality',
      title: 'Session context is not fully clean',
      detail:
        input.selectedPackCount === 0
          ? 'No selected pack is active for the current smoke session.'
          : 'Current or last analyze payload still dropped selected context items.',
      recovery: 'Open Prepare, review dropped packs/drafts, and rerun the smoke probe.'
    }
  }

  const status: SmokeExecutionDiagnosticsStatus = firstFailure
    ? firstFailure.stage === 'setup' ||
      firstFailure.stage === 'realtime' ||
      firstFailure.stage === 'assistant'
      ? 'blocked'
      : 'attention'
    : 'ready'

  const trace: SmokeExecutionTraceItem[] = []

  trace.push({
    id: 'realtime-status',
    label: 'Realtime',
    detail: `${input.realtimeStatus} · ${input.realtimeHealthLabel}`,
    tone:
      status === 'blocked' && firstFailure?.stage === 'realtime'
        ? 'error'
        : input.realtimeStatus === 'listening' ||
            input.realtimeStatus === 'connected'
          ? 'ok'
          : 'info'
  })
  trace.push({
    id: 'events',
    label: 'Events',
    detail: `${input.realtimeEventCounters.total} total · ${input.realtimeEventCounters.completed} completed · ${
      input.realtimeEventCounters.failed + input.realtimeEventCounters.genericError
    } errors`,
    tone:
      input.realtimeEventCounters.failed + input.realtimeEventCounters.genericError > 0
        ? 'warning'
        : 'info'
  })
  trace.push({
    id: 'transcript',
    label: 'Transcript',
    detail: `${input.transcriptCount} total · ${input.eligibleTranscriptCount} eligible · ${input.ignoredTranscriptCount} ignored`,
    tone:
      input.eligibleTranscriptCount > 0
        ? 'ok'
        : input.ignoredTranscriptCount > 0
          ? 'warning'
          : 'info'
  })

  const latestLifecycle = input.realtimeLifecycleLog.at(-1)
  if (latestLifecycle) {
    trace.push({
      id: 'lifecycle',
      label: 'Latest lifecycle',
      detail: latestLifecycle,
      tone: 'info'
    })
  }

  const latestEventType = input.realtimeEventTypes.at(-1)
  if (latestEventType) {
    trace.push({
      id: 'event-type',
      label: 'Latest event',
      detail: latestEventType,
      tone: 'info'
    })
  }

  if (firstFailure) {
    trace.push({
      id: 'failure',
      label: 'First failure',
      detail: firstFailure.title,
      tone: status === 'blocked' ? 'error' : 'warning'
    })
  }

  const worked = joinWorkedSummary(workedParts) || 'not recorded'
  const broken = firstFailure?.detail || ''
  const nextFix = firstFailure?.recovery || ''

  return {
    status,
    headline:
      status === 'ready'
        ? 'Real smoke execution looks healthy'
        : firstFailure?.title ?? 'Real smoke execution needs review',
    summary:
      status === 'ready'
        ? 'Mic, transcript, assistant path, and selected context look ready for a short live probe.'
        : firstFailure?.detail ?? 'Review the first failed stage before continuing.',
    firstFailure,
    trace,
    notePrefill: {
      worked,
      broken,
      nextFix
    }
  }
}

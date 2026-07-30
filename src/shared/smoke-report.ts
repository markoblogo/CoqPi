import type {
  SmokeFixQueueItem,
  SmokeTestNote
} from './app-types'

const formatValue = (value: string | undefined, fallback = 'not recorded') =>
  value?.trim() || fallback

export const buildSmokeReportText = (
  note: SmokeTestNote,
  fixQueue: SmokeFixQueueItem[]
) => {
  const firstFix = fixQueue[0]?.title || note.nextFix
  const snapshot = note.executionSnapshot
  const lines = [
    '# CoqPi smoke report',
    '',
    `Date: ${note.createdAt}`,
    `Session: ${formatValue(note.sessionLabel)}`,
    `Selected pack: ${formatValue(note.selectedPackLabel)}`,
    `Execution status: ${formatValue(snapshot?.status)}`,
    `First failure: ${formatValue(
      snapshot?.firstFailureStage && snapshot?.firstFailureTitle
        ? `${snapshot.firstFailureStage} · ${snapshot.firstFailureTitle}`
        : snapshot?.firstFailureTitle || snapshot?.firstFailureStage
    )}`,
    `Realtime: ${formatValue(snapshot?.realtimeStatusLabel)}`,
    `Assistant: ${formatValue(snapshot?.assistantStatusLabel)}`,
    `Payload: ${formatValue(snapshot?.payloadSummaryLabel)}`,
    `Trace: ${formatValue(snapshot?.traceSummary)}`,
    '',
    'Worked:',
    formatValue(note.worked),
    '',
    'Broken:',
    formatValue(note.broken),
    '',
    'Next fix:',
    formatValue(note.nextFix),
    '',
    'First queued fix:',
    formatValue(firstFix)
  ]

  return lines.join('\n')
}

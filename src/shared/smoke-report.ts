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
  const lines = [
    '# CoqPi smoke report',
    '',
    `Date: ${note.createdAt}`,
    `Session: ${formatValue(note.sessionLabel)}`,
    `Selected pack: ${formatValue(note.selectedPackLabel)}`,
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

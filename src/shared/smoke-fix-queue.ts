import type {
  SmokeFixQueueItem,
  SmokeTestNote
} from './app-types'

const normalizeFixTitle = (value: string) =>
  value.trim().replace(/\s+/g, ' ')

const queueKey = (value: string) => normalizeFixTitle(value).toLowerCase()

export const buildSmokeFixQueue = (
  notes: SmokeTestNote[],
  limit = 5
): SmokeFixQueueItem[] => {
  const seen = new Set<string>()
  const items: SmokeFixQueueItem[] = []

  for (const note of notes) {
    const title = normalizeFixTitle(note.nextFix)
    const key = queueKey(title)

    if (!title || seen.has(key)) {
      continue
    }

    seen.add(key)
    items.push({
      id: `smoke-fix:${note.id}`,
      title,
      sourceNoteId: note.id,
      createdAt: note.createdAt,
      sessionLabel: note.sessionLabel,
      selectedPackLabel: note.selectedPackLabel
    })

    if (items.length >= limit) {
      break
    }
  }

  return items
}

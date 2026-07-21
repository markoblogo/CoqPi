import type { CounterpartyFinderPayloadPreviewCandidate } from './app-types'
import type { CounterpartyFinderPayloadPreviewResult } from './app-types'

export type CounterpartyFinderPreviewItem =
  CounterpartyFinderPayloadPreviewCandidate & {
    selected: boolean
  }

export type FinderPreviewSelectionStats = {
  total: number
  nonDuplicate: number
  selected: number
  duplicate: number
  areAllSelected: boolean
}

export const createFinderPreviewItems = (
  preview: CounterpartyFinderPayloadPreviewResult
): CounterpartyFinderPreviewItem[] =>
  preview.candidates.map((candidate) => ({
    ...candidate,
    selected: !candidate.duplicate
  }))

export const getFinderPreviewSelectionStats = (
  items: readonly CounterpartyFinderPreviewItem[]
): FinderPreviewSelectionStats => {
  const nonDuplicateItems = items.filter((item) => !item.duplicate)
  const selectedItems = nonDuplicateItems.filter((item) => item.selected)

  return {
    total: items.length,
    nonDuplicate: nonDuplicateItems.length,
    selected: selectedItems.length,
    duplicate: items.length - nonDuplicateItems.length,
    areAllSelected:
      nonDuplicateItems.length > 0 &&
      selectedItems.length === nonDuplicateItems.length
  }
}

export const toggleSelectAllFinderCandidates = (
  items: readonly CounterpartyFinderPreviewItem[],
  areAllSelected: boolean
): CounterpartyFinderPreviewItem[] =>
  items.length === 0
    ? []
    : items.map((item) => ({
        ...item,
        selected: item.duplicate ? false : !areAllSelected
      }))


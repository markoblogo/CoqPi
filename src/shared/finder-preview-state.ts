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

export type FinderPreviewControls = {
  selectableCount: number
  selectedCount: number
  duplicateCount: number
  canToggleSelectAll: boolean
  canImportSelected: boolean
  toggleLabel: 'Select all' | 'Deselect all'
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

export const getFinderPreviewControls = (
  items: readonly CounterpartyFinderPreviewItem[],
  isSaving = false
): FinderPreviewControls => {
  const stats = getFinderPreviewSelectionStats(items)

  return {
    selectableCount: stats.nonDuplicate,
    selectedCount: stats.selected,
    duplicateCount: stats.duplicate,
    canToggleSelectAll: !isSaving && stats.nonDuplicate > 0,
    canImportSelected: !isSaving && stats.selected > 0,
    toggleLabel: stats.areAllSelected ? 'Deselect all' : 'Select all'
  }
}

export const setFinderPreviewItemSelected = (
  items: readonly CounterpartyFinderPreviewItem[],
  index: number,
  selected: boolean
): CounterpartyFinderPreviewItem[] =>
  items.map((item) =>
    item.index === index
      ? { ...item, selected: item.duplicate ? false : selected }
      : item
  )

export const buildFinderPreviewImportNotice = ({
  selectedCount,
  duplicateCount,
  errorCount
}: {
  selectedCount: number
  duplicateCount: number
  errorCount: number
}) => {
  const base = `Imported ${selectedCount} selected counterparty pack${
    selectedCount === 1 ? '' : 's'
  }.`

  const duplicateSuffix =
    duplicateCount > 0
      ? ` ${duplicateCount} duplicate/recorded entr${
          duplicateCount === 1 ? 'y' : 'ies'
        } skipped.`
      : ''
  const errorSuffix =
    errorCount > 0
      ? ` ${errorCount} invalid entr${
          errorCount === 1 ? 'y' : 'ies'
        } skipped.`
      : ''

  return `${base}${duplicateSuffix}${errorSuffix}`.trim()
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

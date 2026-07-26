import type { CounterpartyFinderPayloadPreviewCandidate } from './app-types'
import type { CounterpartyFinderPayloadPreviewResult } from './app-types'
import {
  getFinderPreviewImportDecision,
  reviewFinderPreviewCandidateQuality,
  type FinderPreviewQualityReview
} from './finder-search-module'

export type CounterpartyFinderPreviewItem =
  CounterpartyFinderPayloadPreviewCandidate & {
    selected: boolean
    weakConfirmed: boolean
    qualityReview: FinderPreviewQualityReview
    canAutoSelect: boolean
  }

export type FinderPreviewSelectionStats = {
  total: number
  nonDuplicate: number
  selected: number
  duplicate: number
  importableCount: number
  areAllSelected: boolean
  pendingWeakConfirmations: number
}

export type FinderPreviewControls = {
  selectableCount: number
  selectedCount: number
  importableCount: number
  duplicateCount: number
  canToggleSelectAll: boolean
  canImportSelected: boolean
  toggleLabel: 'Select all' | 'Deselect all'
}

export const getFinderPreviewItemCanImport = (
  item: CounterpartyFinderPreviewItem,
  overrides?: { selected?: boolean; confirmed?: boolean }
): boolean => {
  const selected = overrides?.selected ?? item.selected
  const confirmed = overrides?.confirmed ?? item.weakConfirmed

  return getFinderPreviewImportDecision({
    review: item.qualityReview,
    selected,
    confirmed
  }).canImport
}

const buildFinderCandidateDefaults = (
  candidate: CounterpartyFinderPayloadPreviewCandidate
) => {
  const qualityReview = reviewFinderPreviewCandidateQuality(candidate.draft)
  const selectedByInput = candidate.draft.selected !== false
  const canAutoSelect = getFinderPreviewImportDecision({
    review: qualityReview,
    selected: selectedByInput,
    confirmed: false
  }).canAutoSelect

  return {
    ...candidate,
    selected:
      !candidate.duplicate && selectedByInput && canAutoSelect,
    weakConfirmed: false,
    qualityReview,
    canAutoSelect
  }
}

export const createFinderPreviewItems = (
  preview: CounterpartyFinderPayloadPreviewResult
): CounterpartyFinderPreviewItem[] =>
  preview.candidates.map((candidate) => buildFinderCandidateDefaults(candidate))

export const getFinderPreviewSelectionStats = (
  items: readonly CounterpartyFinderPreviewItem[]
): FinderPreviewSelectionStats => {
  const nonDuplicateItems = items.filter((item) => !item.duplicate)
  const selectedItems = nonDuplicateItems.filter((item) => item.selected)
  const pendingWeakConfirmations = nonDuplicateItems.filter(
    (item) =>
      item.qualityReview.level === 'weak' &&
      item.selected &&
      !item.weakConfirmed
  ).length
  const importableCount = nonDuplicateItems.filter((item) =>
    getFinderPreviewItemCanImport(item)
  ).length

  return {
    total: items.length,
    nonDuplicate: nonDuplicateItems.length,
    selected: selectedItems.length,
    duplicate: items.length - nonDuplicateItems.length,
    importableCount,
    pendingWeakConfirmations,
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
    importableCount: stats.importableCount,
    duplicateCount: stats.duplicate,
    canToggleSelectAll: !isSaving && stats.nonDuplicate > 0,
    canImportSelected: !isSaving && stats.importableCount > 0,
    toggleLabel: stats.areAllSelected ? 'Deselect all' : 'Select all'
  }
}

export const clearFinderPreviewWeakConfirmations = (
  items: readonly CounterpartyFinderPreviewItem[]
): CounterpartyFinderPreviewItem[] =>
  items.map((item) => ({
    ...item,
    weakConfirmed: item.duplicate || !item.canAutoSelect ? false : item.weakConfirmed
  }))

export const setFinderPreviewItemSelected = (
  items: readonly CounterpartyFinderPreviewItem[],
  index: number,
  selected: boolean
): CounterpartyFinderPreviewItem[] =>
  items.map((item) =>
    item.index === index
      ? {
          ...item,
          selected: item.duplicate ? false : selected,
          weakConfirmed: item.duplicate ? false : selected ? item.weakConfirmed : false
        }
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
        selected: item.duplicate
          ? false
          : !areAllSelected
            ? item.canAutoSelect
            : false,
        weakConfirmed: item.duplicate
          ? false
          : !areAllSelected
            ? item.canAutoSelect
              ? item.weakConfirmed
              : false
            : false
      }))

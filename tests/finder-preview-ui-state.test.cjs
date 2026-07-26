const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
const {
  buildFinderPreviewImportNotice,
  createFinderPreviewItems,
  getFinderPreviewItemCanImport,
  getFinderPreviewControls,
  getFinderPreviewSelectionStats,
  setFinderPreviewItemSelected,
  toggleSelectAllFinderCandidates: toggleSelectAllFinderCandidatesModel
} = require('../dist-electron/shared/finder-preview-state.js')

const withCoreDirectory = async (operation) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-finder-ui-state-'))
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const coreDirectory = path.join(directory, 'core')
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = coreDirectory
  await fs.mkdir(coreDirectory, { recursive: true })
  await fs.writeFile(path.join(coreDirectory, 'coqpi-ingress.events.jsonl'), '')

  try {
    await operation()
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('finder preview UI state keeps stable select defaults after clear/edit reopen', async () => {
  await withCoreDirectory(async () => {
    await contextSourceService.ingestCounterpartyFinderPayload(
      JSON.stringify({
        kind: 'job',
        sourceId: 'finder:job:seed-001',
        partnerName: 'Seed Company',
        title: 'Seed role',
        summary: 'Baseline seed pack already imported.'
      })
    )

    const firstPayload = JSON.stringify([
      {
        kind: 'job',
        sourceId: 'finder:job:seed-001',
        partnerName: 'Seed Company',
        title: 'Seed role',
        summary: 'Duplicate candidate must be pre-marked.'
      },
      {
        kind: 'partner',
        sourceId: 'finder:partner:new-001',
        partnerName: 'Nova Works',
        title: 'Potential partner',
        summary: 'Potential partner from search result.',
        links: ['https://nova.example'],
        whyRelevant: 'Relevant for long-term partner workflow.',
        nextAction: 'Prepare a short outreach message.',
        context: 'Contact: maria@nova.example'
      }
    ])

    const firstPreview = await contextSourceService.previewCounterpartyFinderPayload(firstPayload)
    let uiItems = createFinderPreviewItems(firstPreview)
    const firstStats = getFinderPreviewSelectionStats(uiItems)

    assert.equal(firstPreview.requestedCount, 2)
    assert.equal(firstPreview.duplicateCount, 1)
    assert.equal(firstStats.total, 2)
    assert.equal(firstStats.nonDuplicate, 1)
    assert.equal(firstStats.selected, 1)
    assert.equal(firstStats.areAllSelected, true)

    uiItems = toggleSelectAllFinderCandidatesModel(
      uiItems,
      firstStats.areAllSelected
    )

    const afterDeselect = getFinderPreviewSelectionStats(uiItems)
    assert.equal(afterDeselect.selected, 0)
    assert.equal(afterDeselect.areAllSelected, false)
    assert.equal(uiItems[0].selected, false)
    assert.equal(uiItems[1].selected, false)

    // Simulate clear and reopen with edited payload.
    uiItems = []

    const editedPayload = JSON.stringify([
      {
        kind: 'job',
        sourceId: 'finder:job:seed-001',
        partnerName: 'Seed Company',
        title: 'Seed role',
        summary: 'Duplicate remains pre-marked.'
      },
      {
        kind: 'investor',
        sourceId: 'finder:investor:new-002',
        partnerName: 'Green Fund',
        title: 'Investor',
        summary: 'A new investor candidate from edited input.',
        links: ['https://green.example'],
        whyRelevant: 'Relevant for capital and pilot support.',
        nextAction: 'Prepare an intro version in Russian and English.',
        context: 'Contact: investor@green.example'
      }
    ])

    const reopenedPreview = await contextSourceService.previewCounterpartyFinderPayload(editedPayload)
    const reopenedItems = createFinderPreviewItems(reopenedPreview)
    const reopenedStats = getFinderPreviewSelectionStats(reopenedItems)

    uiItems = reopenedItems

    assert.equal(reopenedPreview.duplicateCount, 1)
    assert.equal(reopenedStats.total, 2)
    assert.equal(reopenedStats.nonDuplicate, 1)
    assert.equal(reopenedStats.selected, 1)
    assert.equal(reopenedStats.areAllSelected, true)
    assert.equal(uiItems[1].selected, true)

    // Ensure a second reopen still initializes duplicate/non-duplicate defaults consistently.
    const secondReopen = await contextSourceService.previewCounterpartyFinderPayload(editedPayload)
    const repeatedItems = createFinderPreviewItems(secondReopen)
    const repeatedStats = getFinderPreviewSelectionStats(repeatedItems)

    assert.equal(repeatedStats.total, 2)
    assert.equal(repeatedStats.nonDuplicate, 1)
    assert.equal(repeatedStats.selected, 1)
    assert.equal(repeatedStats.areAllSelected, true)
  })
})

test('finder preview UI controls and partial import summary stay consistent across select/deselect', async () => {
  await withCoreDirectory(async () => {
    await contextSourceService.ingestCounterpartyFinderPayload(
      JSON.stringify({
        kind: 'job',
        sourceId: 'finder:job:seed-001',
        partnerName: 'Seed Company',
        title: 'Seed role',
        summary: 'Already imported baseline pack.'
      })
    )

    const payload = JSON.stringify([
      {
        kind: 'job',
        sourceId: 'finder:job:seed-001',
        partnerName: 'Seed Company',
        title: 'Seed role',
        summary: 'Duplicate candidate.'
      },
      {
        kind: 'partner',
        sourceId: 'finder:partner:new-001',
        partnerName: 'Nova Works',
        title: 'Potential partner',
        summary: 'Importable partner candidate.',
        links: ['https://nova.example/jobs/partner'],
        context: 'Contact: contact@nova.example',
        whyRelevant: 'Potentially useful partner in Paris operation.',
        nextAction: 'Prepare short intro with clear proposal.'
      },
      {
        kind: 'investor',
        sourceId: 'finder:investor:new-002',
        partnerName: 'Green Fund',
        title: 'Investor',
        summary: 'Importable investor candidate.',
        links: ['https://green.example/fund'],
        context: 'Contact: invest@green.example',
        whyRelevant: 'Investor with strategic appetite in agri AI.',
        nextAction: 'Prepare a crisp 30-second opener.'
      },
      {
        kind: 'job',
        sourceId: '',
        partnerName: 'Broken',
        title: 'Invalid',
        summary: 'Missing source'
      }
    ])

    const preview = await contextSourceService.previewCounterpartyFinderPayload(payload)
    let items = createFinderPreviewItems(preview)
    let controls = getFinderPreviewControls(items, false)

    assert.equal(preview.requestedCount, 4)
    assert.equal(preview.validCount, 3)
    assert.equal(preview.duplicateCount, 1)
    assert.equal(preview.errors.length, 1)
    assert.equal(controls.selectableCount, 2)
    assert.equal(controls.selectedCount, 2)
    assert.equal(controls.importableCount, 2)
    assert.equal(controls.canToggleSelectAll, true)
    assert.equal(controls.canImportSelected, true)
    assert.equal(controls.toggleLabel, 'Deselect all')

    items = setFinderPreviewItemSelected(items, 1, false)
    controls = getFinderPreviewControls(items, false)
    assert.equal(controls.selectedCount, 1)
    assert.equal(controls.importableCount, 1)
    assert.equal(controls.toggleLabel, 'Select all')

    items = toggleSelectAllFinderCandidatesModel(
      items,
      getFinderPreviewSelectionStats(items).areAllSelected
    )
    controls = getFinderPreviewControls(items, false)
    assert.equal(controls.selectedCount, 2)
    assert.equal(controls.importableCount, 2)
    assert.equal(controls.toggleLabel, 'Deselect all')

    const selectedDrafts = items
      .filter((item) => item.selected && !item.duplicate)
      .map((item) => item.draft)
    const importResult =
      await contextSourceService.addCounterpartyContextPacks(selectedDrafts)
    const importedPacks = importResult.manifest.counterpartyPacks

    assert.equal(importedPacks.length, 3)

    const notice = buildFinderPreviewImportNotice({
      selectedCount: selectedDrafts.length,
      duplicateCount: preview.duplicateCount,
      errorCount: preview.errors.length
    })

    assert.match(notice, /Imported 2 selected counterparty packs\./)
    assert.match(notice, /1 duplicate\/recorded entry skipped\./)
    assert.match(notice, /1 invalid entry skipped\./)

    const reopenedPreview =
      await contextSourceService.previewCounterpartyFinderPayload(payload)
    const reopenedItems = createFinderPreviewItems(reopenedPreview)
    const reopenedControls = getFinderPreviewControls(reopenedItems, false)

    assert.equal(reopenedPreview.duplicateCount, 3)
    assert.equal(reopenedControls.selectableCount, 0)
    assert.equal(reopenedControls.selectedCount, 0)
    assert.equal(reopenedControls.canToggleSelectAll, false)
    assert.equal(reopenedControls.canImportSelected, false)
    assert.equal(reopenedControls.toggleLabel, 'Select all')
  })
})

test('finder preview gating blocks weak candidates until confirmed', async () => {
  await withCoreDirectory(async () => {
    const weakPayload = JSON.stringify([
      {
        kind: 'job',
        sourceId: 'finder:job:weak-001',
        partnerName: 'Sparse Co',
        title: 'Unclear role',
        summary: 'Short summary only.'
      },
      {
        kind: 'partner',
        sourceId: 'finder:partner:ready-001',
        partnerName: 'Clear Corp',
        title: 'Strategic partner',
        summary: 'Clear partner profile with full context for outreach.',
        links: ['https://clear.example'],
        context: 'Contact: hello@clear.example',
        whyRelevant: 'Strong fit for practical collaboration.',
        nextAction: 'Prepare short intro with relevant proof points.'
      }
    ])

    const preview = await contextSourceService.previewCounterpartyFinderPayload(
      weakPayload
    )
    const items = createFinderPreviewItems(preview)

    assert.equal(items.length, 2)

    const weakItem = items.find((item) => item.draft.sourceId.endsWith('weak-001'))
    const readyItem = items.find((item) => item.draft.sourceId.endsWith('ready-001'))

    assert.equal(weakItem?.selected, false)
    assert.equal(readyItem?.selected, true)
    assert.equal(
      getFinderPreviewItemCanImport(weakItem),
      false
    )
    assert.equal(
      getFinderPreviewItemCanImport(readyItem),
      true
    )

    const selectedWithoutConfirm = items.filter((item) =>
      getFinderPreviewItemCanImport(item)
    )
    assert.equal(selectedWithoutConfirm.length, 1)

    const weakConfirmed = items.map((item) =>
      item.draft.sourceId === 'finder:job:weak-001'
        ? { ...item, selected: true, weakConfirmed: true }
        : item
    )
    const selectedWithConfirm = weakConfirmed.filter((item) =>
      getFinderPreviewItemCanImport(item)
    )

    assert.equal(selectedWithConfirm.length, 2)
  })
})

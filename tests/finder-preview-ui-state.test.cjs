const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
const {
  buildFinderPreviewImportNotice,
  createFinderPreviewItems,
  createFinderOwnerSourcePreviewItems,
  getFinderPreviewItemCanImport,
  getFinderPreviewControls,
  getFinderPreviewSelectionStats,
  selectFinderPreviewItemsByTier,
  setFinderPreviewItemSelected,
  toggleSelectAllFinderCandidates: toggleSelectAllFinderCandidatesModel
} = require('../dist-electron/shared/finder-preview-state.js')
const { getFinderPreviewImportDecision } =
  require('../dist-electron/shared/finder-search-module.js')

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

test('finder owner-source preview applies ready/usable/weak decision tiers with batch selection semantics', () => {
  const ownerPreview = {
    jobId: 'job-owner-01',
    mode: 'owner_paste_v0',
    requestedCount: 3,
    validCount: 3,
    duplicateCount: 0,
    detectedFormats: [
      { format: 'url', count: 2 },
      { format: 'freeform_text', count: 1 }
    ],
    candidates: [
      {
        index: 0,
        duplicate: false,
        detectedFormat: 'url',
        draft: {
          sourceId: 'owner:ready:001',
          partnerName: 'Clear Labs',
          title: 'Lead Engineer',
          summary: 'Product leadership role with measurable impact.',
          context:
            'Contact: head@clearlabs.com. Shared interest in AI-enabled operations.',
          links: ['https://clearlabs.example/careers'],
          whyRelevant: 'Very good fit and same stack.',
          missingInfo: 'Clarify salary range and start date.',
          nextAction: 'Prepare a tailored first message.',
          score: 92,
          fitScore: 92
        }
      },
      {
        index: 1,
        duplicate: false,
        detectedFormat: 'url',
        draft: {
          sourceId: 'owner:usable:001',
          partnerName: 'PartnerHub',
          title: 'Strategic partner outreach',
          summary: 'Strong potential for pilot collaboration.',
          context:
            'Contact: team@partnerhub.example. They requested initial intro.',
          links: ['https://partnerhub.example'],
          whyRelevant: '',
          missingInfo: 'Add why relevant.',
          nextAction: 'Prepare intro with shared goals.',
          score: 78,
          fitScore: 78
        }
      },
      {
        index: 2,
        duplicate: false,
        detectedFormat: 'freeform_text',
        draft: {
          sourceId: 'owner:weak:001',
          partnerName: 'Sparse Node',
          title: '',
          summary: 'Short note only.',
          context: 'Some conversation context.',
          links: [],
          whyRelevant: '',
          missingInfo: '',
          nextAction: '',
          score: 50,
          fitScore: 50
        }
      }
    ],
    errors: [],
    reason: 'owner-preview test'
  }

  const items = createFinderOwnerSourcePreviewItems(ownerPreview, 'partner')

  assert.equal(items.length, 3)

  const readyItem = items.find((item) => item.draft.sourceId === 'owner:ready:001')
  const usableItem = items.find((item) => item.draft.sourceId === 'owner:usable:001')
  const weakItem = items.find((item) => item.draft.sourceId === 'owner:weak:001')

  assert.equal(readyItem?.selected, true)
  assert.equal(usableItem?.selected, true)
  assert.equal(weakItem?.selected, false)

  assert.equal(
    getFinderPreviewItemCanImport({
      ...readyItem,
      selected: true,
      weakConfirmed: false
    }),
    true
  )
  assert.equal(
    getFinderPreviewItemCanImport({
      ...usableItem,
      selected: true,
      weakConfirmed: false
    }),
    true
  )
  assert.equal(
    getFinderPreviewItemCanImport({
      ...weakItem,
      selected: true,
      weakConfirmed: false
    }),
    false
  )

  assert.equal(
    getFinderPreviewItemCanImport({
      ...weakItem,
      selected: true,
      weakConfirmed: true
    }),
    true
  )

  const readyDecision = (item) =>
    getFinderPreviewImportDecision({
      review: item.qualityReview,
      selected: item.selected,
      confirmed: item.weakConfirmed
    })

  const selectReadyItems = items.map((item) =>
    readyDecision(item).tier === 'ready'
      ? { ...item, selected: true }
      : { ...item, selected: false }
  )
  const selectUsableItems = items.map((item) =>
    readyDecision(item).tier === 'usable'
      ? { ...item, selected: true }
      : { ...item, selected: false }
  )
  const selectWeakItems = items.map((item) =>
    readyDecision(item).tier === 'weak'
      ? { ...item, selected: true, weakConfirmed: false }
      : { ...item, selected: false }
  )
  const selectWeakItemsWithConfirm = selectWeakItems.map((item) =>
    item.qualityReview.level === 'weak'
      ? { ...item, weakConfirmed: true }
      : item
  )

  assert.equal(selectReadyItems.filter((item) => item.selected).length, 1)
  assert.equal(selectUsableItems.filter((item) => item.selected).length, 1)
  assert.equal(selectWeakItems.filter((item) => item.selected).length, 1)
  assert.equal(
    selectUsableItems.filter((item) => getFinderPreviewItemCanImport(item)).length,
    1
  )
  assert.equal(
    selectWeakItems.filter((item) => getFinderPreviewItemCanImport(item)).length,
    0
  )
  assert.equal(
    selectWeakItemsWithConfirm.filter((item) =>
      getFinderPreviewItemCanImport(item)
    ).length,
    1
  )
})

test('finder owner-source weak confirmation preserves weak import gate', () => {
  const ownerPreview = {
    jobId: 'job-owner-02',
    mode: 'owner_paste_v0',
    requestedCount: 2,
    validCount: 2,
    duplicateCount: 0,
    detectedFormats: [
      { format: 'url', count: 1 },
      { format: 'url', count: 1 }
    ],
    candidates: [
      {
        index: 0,
        duplicate: false,
        detectedFormat: 'url',
        draft: {
          sourceId: 'owner:ready-002',
          partnerName: 'Clear Labs',
          title: 'Lead Engineer',
          summary: 'Product leadership role with measurable impact.',
          context:
            'Contact: head@clearlabs.com. Shared interest in AI-enabled operations.',
          links: ['https://clearlabs.example/careers'],
          whyRelevant: 'Very good fit and same stack.',
          missingInfo: 'Clarify salary range and start date.',
          nextAction: 'Prepare a tailored first message.',
          score: 92,
          fitScore: 92
        }
      },
      {
        index: 1,
        duplicate: false,
        detectedFormat: 'url',
        draft: {
          sourceId: 'owner:weak-002',
          partnerName: 'Sparse Node',
          title: '',
          summary: 'Short note only.',
          context: 'Some conversation context.',
          links: [],
          whyRelevant: '',
          missingInfo: '',
          nextAction: '',
          score: 50,
          fitScore: 50
        }
      }
    ],
    errors: [],
    reason: 'owner-preview weak confirm test'
  }

  const items = createFinderOwnerSourcePreviewItems(ownerPreview, 'partner')
  assert.equal(items[0].qualityReview.level, 'ready')
  assert.equal(items[1].qualityReview.level, 'weak')

  assert.equal(
    getFinderPreviewItemCanImport({
      ...items[1],
      selected: true,
      weakConfirmed: false
    }),
    false
  )
  assert.equal(
    getFinderPreviewItemCanImport({
      ...items[1],
      selected: true,
      weakConfirmed: true
    }),
    true
  )

  const confirmedWeak = items.map((item) =>
    item.qualityReview.level === 'weak'
      ? { ...item, selected: true, weakConfirmed: true }
      : item
  )
  const importable = confirmedWeak.filter((item) => getFinderPreviewItemCanImport(item))
  assert.equal(importable.length, 2)
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
    assert.equal(getFinderPreviewSelectionStats(items).blockedSelectedCount, 0)
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

    const selectedWeak = selectFinderPreviewItemsByTier(items, 'weak')
    const blockedStats = getFinderPreviewSelectionStats(selectedWeak)
    const blockedControls = getFinderPreviewControls(selectedWeak, false)

    assert.equal(blockedStats.weakCount, 1)
    assert.equal(blockedStats.blockedSelectedCount, 1)
    assert.equal(blockedStats.pendingWeakConfirmations, 1)
    assert.equal(blockedControls.canImportSelected, false)

    const weakConfirmed = selectedWeak.map((item) =>
      item.draft.sourceId === 'finder:job:weak-001'
        ? { ...item, selected: true, weakConfirmed: true }
        : item
    )
    const selectedWithConfirm = weakConfirmed.filter((item) =>
      getFinderPreviewItemCanImport(item)
    )

    const confirmedStats = getFinderPreviewSelectionStats(weakConfirmed)
    const confirmedControls = getFinderPreviewControls(weakConfirmed, false)

    assert.equal(selectedWithConfirm.length, 1)
    assert.equal(confirmedStats.blockedSelectedCount, 0)
    assert.equal(confirmedControls.canImportSelected, true)
  })
})

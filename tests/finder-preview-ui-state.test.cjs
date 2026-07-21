const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
const {
  createFinderPreviewItems,
  getFinderPreviewSelectionStats,
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
        summary: 'Potential partner from search result.'
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
        summary: 'A new investor candidate from edited input.'
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

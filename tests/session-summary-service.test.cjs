const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-session-summary-userdata')
  }
}

const withSessionSummaryWorkspace = async (run) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'coqpi-session-summary-')
  )
  const previousCoreDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const originalModuleLoad = Module._load

  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const service = require('../dist-electron/backend/services/session-summary-service.js')
    await run(service)
  } finally {
    Module._load = originalModuleLoad

    if (previousCoreDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousCoreDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('session summary service saves append-only owner-confirmed summaries', async () => {
  await withSessionSummaryWorkspace(async (service) => {
    const first = await service.saveSessionSummary({
      sourceId: 'finder:job:northfield',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary: 'First intro call completed.',
      confirmedOutcomes: ['They want a sharper product story'],
      followUps: ['Send short follow-up this week'],
      risks: ['Do not overclaim people management'],
      sessionLabel: 'Northfield intro call',
      selectedCounterpartyPackIds: ['pack-a'],
      selectedFinderOutreachDraftId: 'draft-a'
    })
    const second = await service.saveSessionSummary({
      sourceId: 'finder:job:northfield',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary: 'Second note.',
      followUps: ['Prepare final round examples']
    })

    const all = await service.getSessionSummaries()
    const filtered = await service.getSessionSummaries({
      sourceId: 'finder:job:northfield'
    })

    assert.match(first.id, /^[0-9a-f-]+$/)
    assert.equal(all.summaries.length, 2)
    assert.equal(all.summaries[0].id, second.id)
    assert.equal(filtered.summaries.length, 2)
    assert.deepEqual(first.confirmedOutcomes, ['They want a sharper product story'])
    assert.deepEqual(first.selectedCounterpartyPackIds, ['pack-a'])
  })
})

test('session summary service rejects empty payload and trims fields', async () => {
  await withSessionSummaryWorkspace(async (service) => {
    await assert.rejects(
      () =>
        service.saveSessionSummary({
          sourceId: 'finder:job:test',
          partnerName: 'Test',
          title: 'Role',
          summary: ' ',
          confirmedOutcomes: [],
          followUps: [],
          risks: []
        }),
      /Add at least a summary, outcome, follow-up, or risk/
    )

    const summary = await service.saveSessionSummary({
      sourceId: 'finder:job:test',
      partnerName: ' Test Partner ',
      title: ' Role ',
      summary: ` ${'a'.repeat(1400)} `,
      followUps: ['x', 'x', 'y']
    })

    assert.equal(summary.summary.length, 1200)
    assert.equal(summary.partnerName, 'Test Partner')
    assert.deepEqual(summary.followUps, ['x', 'y'])
  })
})

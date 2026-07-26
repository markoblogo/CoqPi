const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const {
  createContextPackDraftFromFinderResult
} = require('../dist-electron/shared/finder-search-module.js')
const {
  buildSessionSelectionSurface
} = require('../dist-electron/shared/session-selection-surface.js')
const {
  buildLiveTestCockpitItems,
  getAssistantStatusLabel
} = require('../dist-electron/shared/live-loop.js')
const {
  getSessionContextWithImportedCounterpartyPacks,
  getSessionContextWithCounterpartyPacks
} = require('../dist-electron/shared/session-pack-selection.js')

const mockElectron = {
  app: {
    getPath: () => path.join(os.tmpdir(), 'coqpi-test-userdata')
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(String(value)),
    decryptString: (value) => value.toString()
  }
}

const withElectronMock = async (run) => {
  const originalModuleLoad = Module._load

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
    const sessionContextService = require('../dist-electron/backend/services/session-context-service.js')
    const finderSearchService = require('../dist-electron/backend/services/finder-search-service.js')
    const finderSessionIngressService = require('../dist-electron/backend/services/finder-session-ingress-service.js')

    return await run({
      contextSourceService,
      sessionContextService,
      finderSearchService,
      finderSessionIngressService
    })
  } finally {
    Module._load = originalModuleLoad
  }
}

const withLocalKnowledgeWorkspace = async (run) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'coqpi-selection-surface-')
  )
  const previousCoreDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const coreDirectory = path.join(directory, 'core')
  const sessionsDirectory = path.join(directory, 'sessions')
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = coreDirectory
  process.env.COQPI_SESSIONS_DIR = sessionsDirectory

  await fs.mkdir(coreDirectory, { recursive: true })
  await fs.mkdir(sessionsDirectory, { recursive: true })
  await fs.writeFile(path.join(coreDirectory, 'coqpi-ingress.events.jsonl'), '')

  try {
    await run()
  } finally {
    if (previousCoreDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousCoreDirectory
    }

    if (previousSessionsDirectory === undefined) {
      delete process.env.COQPI_SESSIONS_DIR
    } else {
      process.env.COQPI_SESSIONS_DIR = previousSessionsDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

const makeCockpitContextValue = (surface) => {
  const byId = Object.fromEntries(
    buildLiveTestCockpitItems({
      callLanguage: 'en',
      realtimeLabel: 'listening',
      assistantStatus: getAssistantStatusLabel('done', 'u-1', 'u-1', null),
      autoTranscriptText: 'I have experience with product management.',
      selectedPackLabel: surface.activePackSummary.label,
      selectedPackState: surface.activePackSummary.state,
      selectedPackCount: surface.activePackSummary.includedCount,
      transcriptUtterances: [],
      latestRelevantUtteranceId: undefined,
      lastAnalyzedUtteranceId: null
    }).map((item) => [item.id, item])
  )

  return byId.context.value
}

const buildImportedSelectionSurface = async (services) => {
  const afterJob = await services.finderSearchService.addFinderSearchJob({
    kind: 'job',
    label: 'France product roles',
    query: 'senior product manager france agtech'
  })
  const job = afterJob.store.jobs[0]
  const afterCandidate = await services.finderSearchService.addFinderCandidateResult(
    job.id,
    {
      sourceId: 'finder:job:surface-001',
      partnerName: 'Northfield Labs',
      title: 'Senior Product Lead',
      summary: 'Interview candidate sourced from Finder job.',
      links: ['https://example.com/jobs/northfield-product-lead'],
      fitScore: 88,
      whyRelevant: 'Strong overlap with product leadership and AI workflows.',
      missingInfo: 'Need compensation range.',
      nextAction: 'Prepare tailored interview story.'
    }
  )

  const candidate = afterCandidate.store.results[0]
  const finderDraft = createContextPackDraftFromFinderResult(candidate)
  const importResult =
    await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
      finderDraft
    ])
  const packs = importResult.manifest.counterpartyPacks ?? []
  const importedPack = packs[0]
  const nextContext = getSessionContextWithImportedCounterpartyPacks(
    {
      company: candidate.partnerName,
      role: candidate.title,
      context: 'Finder import handoff',
      goal: 'Use the imported Finder pack in the next assistant analysis.',
      notes: 'No manual selected pack edits after import.',
      selectedCounterpartyPackIds: [],
      selectedFinderOutreachDraftId: ''
    },
    packs,
    [finderDraft]
  )
  const saved = await services.sessionContextService.saveSessionContext(nextContext)

  return {
    importedPack,
    context: saved.context,
    packs
  }
}

const buildOwnerSourceSelectionSurface = async (services) => {
  const afterJob = await services.finderSearchService.addFinderSearchJob({
    kind: 'job',
    label: 'France product roles',
    query: 'senior product manager france agtech',
    goal: 'Prepare interview context'
  })
  const job = afterJob.store.jobs[0]
  const preview = await services.finderSearchService.previewFinderOwnerPastedSource(
    job.id,
    [
      'Company: Northfield Labs',
      'Role: Senior Product Manager',
      'Location: Paris, France',
      'Website: https://northfield.example/careers',
      'Contact: hiring@northfield.example',
      'Why relevant: Product management role in French agtech market.'
    ].join('\n')
  )
  const payload =
    await services.finderSessionIngressService.ingestFinderOwnerSourceCandidatesToSession(
      job.id,
      preview.candidates.map((candidate) => candidate.draft)
    )

  return {
    session: payload.session.context,
    packs: payload.manifest.counterpartyPacks ?? [],
    store: payload.store
  }
}

test('finder import selection surface stays synchronized when selected pack becomes disabled', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const imported = await buildImportedSelectionSurface(services)

      const initialSurface = buildSessionSelectionSurface({
        activeContext: imported.context,
        draftContext: imported.context,
        availablePacks: imported.packs,
        includeProfileContext: true,
        profileChars: 321
      })

      assert.equal(initialSurface.activePackSummary.state, 'included')
      assert.equal(
        initialSurface.activePackSummary.label,
        'Packs: Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        initialSurface.activePrepPreview.selectedPackLabel,
        'Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        makeCockpitContextValue(initialSurface),
        'Packs: Northfield Labs · Senior Product Lead'
      )

      const disabledManifest =
        await services.contextSourceService.setCounterpartyContextPackSelected(
          imported.importedPack.id,
          false
        )
      const disabledPacks = disabledManifest.manifest.counterpartyPacks ?? []
      const droppedAudit = buildSessionSelectionSurface({
        activeContext: imported.context,
        draftContext: imported.context,
        availablePacks: disabledPacks,
        includeProfileContext: true,
        profileChars: 321
      }).activePayloadInspector.droppedPacks
      const prunedContext = getSessionContextWithCounterpartyPacks(
        imported.context,
        disabledPacks
      )

      const disabledSurface = buildSessionSelectionSurface({
        activeContext: prunedContext,
        draftContext: prunedContext,
        availablePacks: disabledPacks,
        activeAuditedDroppedPacks: droppedAudit,
        draftAuditedDroppedPacks: droppedAudit,
        includeProfileContext: true,
        profileChars: 321
      })

      assert.deepEqual(prunedContext.selectedCounterpartyPackIds, [])
      assert.equal(disabledSurface.activePackSummary.state, 'dropped')
      assert.equal(
        disabledSurface.activePackSummary.label,
        'Dropped: Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        disabledSurface.activePrepPreview.selectedPackLabel,
        'Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        disabledSurface.activePrepPreview.selectedPackQualityLabel,
        'dropped from assistant payload'
      )
      assert.deepEqual(
        disabledSurface.activePayloadInspector.droppedPacks.map((pack) => pack.id),
        [imported.importedPack.id]
      )
      assert.match(
        disabledSurface.activePayloadInspector.droppedPacks[0].reason,
        /not selected/
      )
      assert.equal(
        makeCockpitContextValue(disabledSurface),
        'Dropped: Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        disabledSurface.draftPackSummary.label,
        disabledSurface.activePackSummary.label
      )
      assert.equal(
        disabledSurface.draftPrepPreview.selectedPackQualityLabel,
        disabledSurface.activePrepPreview.selectedPackQualityLabel
      )
    })
  })
})

test('finder import selection surface stays synchronized when selected pack is removed', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const imported = await buildImportedSelectionSurface(services)

      await services.contextSourceService.removeCounterpartyContextPack(
        imported.importedPack.id
      )
      const removedPacks = []
      const droppedAudit = buildSessionSelectionSurface({
        activeContext: imported.context,
        draftContext: imported.context,
        availablePacks: removedPacks,
        includeProfileContext: true,
        profileChars: 321
      }).activePayloadInspector.droppedPacks
      const prunedContext = getSessionContextWithCounterpartyPacks(
        imported.context,
        removedPacks
      )
      const removedSurface = buildSessionSelectionSurface({
        activeContext: prunedContext,
        draftContext: prunedContext,
        availablePacks: removedPacks,
        activeAuditedDroppedPacks: droppedAudit,
        draftAuditedDroppedPacks: droppedAudit,
        includeProfileContext: true,
        profileChars: 321
      })

      assert.deepEqual(prunedContext.selectedCounterpartyPackIds, [])
      assert.equal(removedSurface.activePackSummary.state, 'dropped')
      assert.equal(
        removedSurface.activePackSummary.label,
        `Dropped: ${imported.importedPack.id}`
      )
      assert.equal(
        removedSurface.activePrepPreview.selectedPackLabel,
        imported.importedPack.id
      )
      assert.deepEqual(
        removedSurface.activePayloadInspector.droppedPacks.map((pack) => pack.id),
        [imported.importedPack.id]
      )
      assert.match(
        removedSurface.activePayloadInspector.droppedPacks[0].reason,
        /missing/
      )
      assert.equal(
        makeCockpitContextValue(removedSurface),
        `Dropped: ${imported.importedPack.id}`
      )
    })
  })
})

test('owner source ingress flows into prepare/live selection surface without manual pack edits', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const imported = await buildOwnerSourceSelectionSurface(services)

      const surface = buildSessionSelectionSurface({
        activeContext: imported.session,
        draftContext: imported.session,
        availablePacks: imported.packs,
        availableOutreachDrafts: imported.store.outreachDrafts,
        includeProfileContext: true,
        profileChars: 321
      })

      assert.equal(surface.activePackSummary.state, 'included')
      assert.equal(
        surface.activePrepPreview.selectedPackLabel,
        'Northfield Labs · Senior Product Manager'
      )
      assert.equal(surface.activePrepPreview.selectedPackCount, 1)
      assert.match(
        surface.activePrepPreview.assistantPayloadLabel,
        /packs 1/
      )
      assert.equal(surface.activePayloadInspector.includedPacks.length, 1)
      assert.match(
        surface.activePayloadInspector.includedPacks[0].sourceId,
        /^coqpi:source-adapter:job:[a-f0-9-]+:[a-f0-9]+$/
      )
      assert.equal(
        makeCockpitContextValue(surface),
        'Packs: Northfield Labs · Senior Product Manager'
      )
    })
  })
})

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
  buildInitialLoadState
} = require('../dist-electron/shared/initial-load-state.js')
const {
  buildSessionSelectionSurface
} = require('../dist-electron/shared/session-selection-surface.js')
const {
  buildLiveTestCockpitItems,
  getAssistantStatusLabel
} = require('../dist-electron/shared/live-loop.js')
const {
  getSessionContextWithImportedCounterpartyPacks
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

    return await run({
      contextSourceService,
      sessionContextService,
      finderSearchService
    })
  } finally {
    Module._load = originalModuleLoad
  }
}

const withLocalKnowledgeWorkspace = async (run) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'coqpi-initial-load-state-')
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

const defaultStatus = {
  hasEnvFile: false,
  hasOpenAIKey: false,
  hasStoredKey: false,
  effectiveKeyAvailable: false
}

const defaultProfile = {
  content: 'Owner profile context'
}

const defaultSettingsPayload = {
  settings: {
    costMode: 'balanced',
    defaultCallLanguage: 'Auto',
    defaultAnswerLanguage: 'English',
    includeProfileContextByDefault: true,
    saveTranscriptByDefault: false
  },
  meta: {
    appVersion: '0.1.0',
    productName: 'CoqPi',
    safeStorageAvailable: true
  }
}

const defaultKeyState = {
  hasStoredKey: false,
  hasEnvKey: false,
  effectiveKeyAvailable: false
}

const defaultSmokeNotesPayload = {
  notes: []
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

const buildFinderImportedSession = async (services, sourceId) => {
  const afterJob = await services.finderSearchService.addFinderSearchJob({
    kind: 'job',
    label: 'France product roles',
    query: 'senior product manager france agtech'
  })
  const job = afterJob.store.jobs[0]
  const afterCandidate = await services.finderSearchService.addFinderCandidateResult(
    job.id,
    {
      sourceId,
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

  await services.sessionContextService.saveSessionContext(nextContext)

  return importedPack
}

const buildLoadedSurface = (initialLoadState, finderSearchStore) =>
  buildSessionSelectionSurface({
    activeContext: initialLoadState.sessionContext,
    draftContext: initialLoadState.sessionContextDraft,
    availablePacks: initialLoadState.counterpartyPacks,
    availableOutreachDrafts: finderSearchStore.outreachDrafts,
    activeAuditedDroppedPacks: initialLoadState.activeSessionDroppedPackAudit,
    draftAuditedDroppedPacks: initialLoadState.draftSessionDroppedPackAudit,
    includeProfileContext: initialLoadState.includeProfileContext,
    profileChars: initialLoadState.profileContext.length
  })

test('initial load restores dropped disabled selected pack consistently across Live and Prepare surfaces', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const importedPack = await buildFinderImportedSession(
        services,
        'finder:job:startup-disabled-001'
      )

      await services.contextSourceService.setCounterpartyContextPackSelected(
        importedPack.id,
        false
      )

      const session = await services.sessionContextService.getSessionContext()
      const contextSourcePayload = await services.contextSourceService.getContextSourceManifest()
      const finderSearchPayload = await services.finderSearchService.getFinderSearchStore()
      const initialLoadState = buildInitialLoadState({
        status: defaultStatus,
        profile: defaultProfile,
        session,
        contextSourcePayload,
        settingsPayload: defaultSettingsPayload,
        keyState: defaultKeyState,
        smokeNotePayload: defaultSmokeNotesPayload,
        finderSearchPayload
      })
      const surface = buildLoadedSurface(
        initialLoadState,
        finderSearchPayload.store
      )

      assert.deepEqual(initialLoadState.sessionContext.selectedCounterpartyPackIds, [])
      assert.equal(
        initialLoadState.sessionRecoveryNotice,
        'Restored session without 1 pack: Northfield Labs · Senior Product Lead. Open Prepare to review or replace the dropped pack.'
      )
      assert.deepEqual(
        initialLoadState.activeSessionDroppedPackAudit.map((pack) => pack.id),
        [importedPack.id]
      )
      assert.deepEqual(
        session.persistedContext.selectedCounterpartyPackIds,
        [importedPack.id]
      )
      assert.equal(surface.activePackSummary.state, 'dropped')
      assert.equal(
        surface.activePackSummary.label,
        'Dropped: Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        surface.activePrepPreview.selectedPackQualityLabel,
        'dropped from assistant payload'
      )
      assert.equal(
        makeCockpitContextValue(surface),
        'Dropped: Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        initialLoadState.controlPatch.callLanguage,
        defaultSettingsPayload.settings.defaultCallLanguage
      )
    })
  })
})

test('initial load restores dropped removed selected pack consistently across Live and Prepare surfaces', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const importedPack = await buildFinderImportedSession(
        services,
        'finder:job:startup-removed-001'
      )

      await services.contextSourceService.removeCounterpartyContextPack(
        importedPack.id
      )

      const session = await services.sessionContextService.getSessionContext()
      const contextSourcePayload = await services.contextSourceService.getContextSourceManifest()
      const finderSearchPayload = await services.finderSearchService.getFinderSearchStore()
      const initialLoadState = buildInitialLoadState({
        status: defaultStatus,
        profile: defaultProfile,
        session,
        contextSourcePayload,
        settingsPayload: defaultSettingsPayload,
        keyState: defaultKeyState,
        smokeNotePayload: defaultSmokeNotesPayload,
        finderSearchPayload
      })
      const surface = buildLoadedSurface(
        initialLoadState,
        finderSearchPayload.store
      )

      assert.deepEqual(initialLoadState.sessionContext.selectedCounterpartyPackIds, [])
      assert.equal(
        initialLoadState.sessionRecoveryNotice,
        `Restored session without 1 pack: ${importedPack.id}. Open Prepare to review or replace the dropped pack.`
      )
      assert.deepEqual(
        initialLoadState.activeSessionDroppedPackAudit.map((pack) => pack.id),
        [importedPack.id]
      )
      assert.deepEqual(
        session.persistedContext.selectedCounterpartyPackIds,
        [importedPack.id]
      )
      assert.equal(surface.activePackSummary.state, 'dropped')
      assert.equal(
        surface.activePackSummary.label,
        `Dropped: ${importedPack.id}`
      )
      assert.equal(surface.activePrepPreview.selectedPackLabel, importedPack.id)
      assert.equal(
        makeCockpitContextValue(surface),
        `Dropped: ${importedPack.id}`
      )
      assert.equal(initialLoadState.draftSessionDroppedPackAudit.length, 1)
    })
  })
})

test('initial load keeps startup notice silent when restored session has no dropped packs', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      await buildFinderImportedSession(
        services,
        'finder:job:startup-clean-001'
      )

      const session = await services.sessionContextService.getSessionContext()
      const contextSourcePayload =
        await services.contextSourceService.getContextSourceManifest()
      const finderSearchPayload =
        await services.finderSearchService.getFinderSearchStore()
      const initialLoadState = buildInitialLoadState({
        status: defaultStatus,
        profile: defaultProfile,
        session,
        contextSourcePayload,
        settingsPayload: defaultSettingsPayload,
        keyState: defaultKeyState,
        smokeNotePayload: defaultSmokeNotesPayload,
        finderSearchPayload
      })
      const surface = buildLoadedSurface(
        initialLoadState,
        finderSearchPayload.store
      )

      assert.equal(initialLoadState.sessionRecoveryNotice, null)
      assert.deepEqual(initialLoadState.activeSessionDroppedPackAudit, [])
      assert.equal(surface.activePackSummary.state, 'included')
      assert.equal(
        surface.activePackSummary.label,
        'Packs: Northfield Labs · Senior Product Lead'
      )
      assert.equal(
        makeCockpitContextValue(surface),
        'Packs: Northfield Labs · Senior Product Lead'
      )
    })
  })
})

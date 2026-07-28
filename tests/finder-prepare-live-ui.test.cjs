const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const {
  createFinderPreviewItems,
  setFinderPreviewItemSelected
} = require('../dist-electron/shared/finder-preview-state.js')
const {
  buildSessionSelectionSurface
} = require('../dist-electron/shared/session-selection-surface.js')
const {
  createContextPackDraftFromFinderResult
} = require('../dist-electron/shared/finder-search-module.js')
const {
  getSessionContextWithCounterpartyPacks,
  getSessionContextWithImportedCounterpartyPacks
} = require('../dist-electron/shared/session-pack-selection.js')

const mockElectron = {
  app: {
    getPath: () => path.join(os.tmpdir(), 'coqpi-finder-prepare-live-userdata')
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(String(value)),
    decryptString: (value) => value.toString()
  }
}

const makeRequest = (overrides = {}) => ({
  transcriptText:
    'I would like to discuss this role and the next steps in more detail.',
  callLanguage: 'en',
  answerLanguage: 'en',
  mode: 'full',
  includeProfileContext: false,
  recentWindowLabel: '30s',
  costMode: 'balanced',
  ...overrides
})

const makeOllamaResponse = (payload) => ({
  ok: true,
  text: async () => JSON.stringify(payload),
  json: async () => payload
})

const withElectronMock = async (run) => {
  const originalModuleLoad = Module._load

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const assistantService = require('../dist-electron/backend/services/assistant-service.js')
    const assistantProviderProfile = require('../dist-electron/backend/services/assistant-provider-profile.js')
    const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
    const sessionContextService = require('../dist-electron/backend/services/session-context-service.js')
    const finderSearchService = require('../dist-electron/backend/services/finder-search-service.js')
    const finderSessionIngressService = require('../dist-electron/backend/services/finder-session-ingress-service.js')
    const profileService = require('../dist-electron/backend/services/profile-service.js')
    const secretStorageService = require('../dist-electron/backend/services/secret-storage-service.js')
    const governanceService = require('../dist-electron/backend/services/governance-service.js')

    return await run({
      assistantService,
      assistantProviderProfile,
      contextSourceService,
      sessionContextService,
      finderSearchService,
      finderSessionIngressService,
      profileService,
      secretStorageService,
      governanceService
    })
  } finally {
    Module._load = originalModuleLoad
  }
}

const withPatchedModules = async (patches, run) => {
  const originals = []

  for (const [moduleExports, key, value] of patches) {
    originals.push([moduleExports, key, moduleExports[key]])
    moduleExports[key] = value
  }

  const previousFetch = global.fetch

  try {
    return await run()
  } finally {
    for (const [moduleExports, key, originalValue] of originals) {
      moduleExports[key] = originalValue
    }

    global.fetch = previousFetch
  }
}

const withStubbedProviderRoute = async ({
  beforeAnalyze,
  onSelectedPackIds,
  fetchHandler,
  requestOverrides
}) =>
  withElectronMock(async (services) => {
    process.env.COQPI_ASSISTANT_PROVIDER_TIMEOUT_MS = '120'
    process.env.COQPI_ASSISTANT_REQUEST_BUDGET_MS = '150'
    const previousProviderProfile = process.env.COQPI_ASSISTANT_PROVIDER_PROFILE
    const previousOllamaBaseUrl = process.env.OLLAMA_BASE_URL
    const originalGetPersonalInterviewRetrieval =
      services.contextSourceService.getPersonalInterviewRetrieval.bind(
        services.contextSourceService
      )
    process.env.COQPI_ASSISTANT_PROVIDER_PROFILE = 'ollama:0'
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

    try {
      return await withPatchedModules(
        [
          [
            services.assistantProviderProfile,
            'getOrderedEnabledProviderProfiles',
            () => [
              {
                provider: 'ollama',
                priority: 0,
                model: 'llama3.1',
                baseUrl: 'http://127.0.0.1:11434',
                enabled: true,
                isTextOnly: true,
                failoverEnabled: true
              }
            ]
          ],
          [services.profileService, 'getProfileContext', async () => ({ content: '' })],
          [
            services.contextSourceService,
            'getPersonalInterviewRetrieval',
            async (
              transcriptText,
              answerLanguage,
              retrievalKinds,
              selectedPackIds,
              retrievalProvider
            ) => {
              onSelectedPackIds?.(selectedPackIds)

              return originalGetPersonalInterviewRetrieval(
                transcriptText,
                answerLanguage,
                retrievalKinds,
                selectedPackIds,
                retrievalProvider
              )
            }
          ],
          [services.secretStorageService, 'resolveOpenAIApiKey', async () => 'test-key'],
          [
            services.governanceService,
            'runGovernedProviderAction',
            async (_action, execute) => execute()
          ]
        ],
        async () => {
          global.fetch = fetchHandler

          if (beforeAnalyze) {
            await beforeAnalyze(services)
          }

          return services.assistantService.analyzeRecentTranscript(
            makeRequest(requestOverrides)
          )
        }
      )
    } finally {
      if (previousProviderProfile === undefined) {
        delete process.env.COQPI_ASSISTANT_PROVIDER_PROFILE
      } else {
        process.env.COQPI_ASSISTANT_PROVIDER_PROFILE = previousProviderProfile
      }

      if (previousOllamaBaseUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL
      } else {
        process.env.OLLAMA_BASE_URL = previousOllamaBaseUrl
      }
    }
  })

const withLocalKnowledgeWorkspace = async (run) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'coqpi-finder-prepare-live-')
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

test('finder preview import flows into prepare surface and live analyze without manual selected-id workarounds', async () => {
  const observed = {
    selectedPackIdsFromRetrieval: undefined,
    capturedPrompt: '',
    prepareSelectedPackLabel: '',
    prepareIncludedSourceId: '',
    importedResultCount: 0
  }
  let expectedSelectedPackIds = []
  let expectedSourceId = ''

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      beforeAnalyze: async (services) => {
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'France product roles',
          query: 'senior product manager france agtech',
          goal: 'Prepare interview context'
        })
        const job = afterJob.store.jobs[0]
        const preview =
          await services.finderSearchService.previewFinderOwnerPastedSource(
            job.id,
            [
              'Company: Northfield Labs',
              'Role: Senior Product Manager',
              'Location: Paris, France',
              'Website: https://northfield.example/careers',
              'Contact: hiring@northfield.example',
              'Why relevant: Product leadership role in French agtech market.',
              '',
              'Company: Side Company',
              'Role: Product Operations Manager',
              'Location: Berlin, Germany',
              'Website: https://side.example/jobs/ops',
              'Contact: hiring@side.example',
              'Why relevant: Secondary option that should stay out of this session.'
            ].join('\n')
          )

        let previewItems = createFinderPreviewItems(preview)
        previewItems = setFinderPreviewItemSelected(previewItems, 1, false)

        const selectedDrafts = previewItems
          .filter((item) => item.selected && !item.duplicate)
          .map((item) => item.draft)

        const ingress =
          await services.finderSessionIngressService.ingestFinderOwnerSourceCandidatesToSession(
            job.id,
            selectedDrafts
          )

        observed.importedResultCount = ingress.store.results.length
        expectedSelectedPackIds = ingress.session.context.selectedCounterpartyPackIds
        expectedSourceId = ingress.manifest.counterpartyPacks?.[0]?.sourceId ?? ''

        const surface = buildSessionSelectionSurface({
          activeContext: ingress.session.context,
          draftContext: ingress.session.context,
          availablePacks: ingress.manifest.counterpartyPacks ?? [],
          availableOutreachDrafts: ingress.store.outreachDrafts,
          includeProfileContext: false,
          profileChars: 0
        })

        observed.prepareSelectedPackLabel =
          surface.activePrepPreview.selectedPackLabel
        observed.prepareIncludedSourceId =
          surface.activePayloadInspector.includedPacks[0]?.sourceId ?? ''
      },
      onSelectedPackIds: (selectedPackIds) => {
        observed.selectedPackIdsFromRetrieval = [...(selectedPackIds ?? [])]
      },
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        observed.capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu:
                'Finder preview/import path передал выбранный pack в live analyze.',
              detectedQuestion: 'Which imported context is active now?',
              intent: 'finder prepare live path verification',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I prepared using the selected company context for this role.',
                  answerMeaningRu:
                    'Я подготовился к этой роли на основе выбранного контекста компании.'
                }
              ],
              keywordsToRemember: ['selected context', 'company'],
              openingPhrase: 'Sure.'
            })
          }
        })
      }
    })
  })

  assert.equal(observed.importedResultCount, 1)
  assert.deepEqual(observed.selectedPackIdsFromRetrieval, expectedSelectedPackIds)
  assert.equal(
    observed.prepareSelectedPackLabel,
    'Northfield Labs · Senior Product Manager'
  )
  assert.equal(observed.prepareIncludedSourceId, expectedSourceId)
  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /Senior Product Manager/)
  assert.match(observed.capturedPrompt, /French agtech market/)
  assert.equal(observed.capturedPrompt.includes(expectedSourceId), true)
  assert.equal(observed.capturedPrompt.includes('Side Company'), false)
  assert.equal(
    observed.capturedPrompt.includes('Product Operations Manager'),
    false
  )
})

test('finder queue import now updates session payload and assistant selected pack set', async () => {
  const observed = {
    selectedPackIdsFromRetrieval: undefined,
    capturedPrompt: '',
    importSourceId: '',
    notImportSourceId: ''
  }
  let expectedSelectedPackIds = []

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      beforeAnalyze: async (services) => {
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'partner',
          label: 'Finder queue demo',
          query: 'local partner shortlist france',
          goal: 'Prepare interview calls'
        })
        const job = afterJob.store.jobs[0]

        const importReady = await services.finderSearchService.addFinderCandidateResult(
          job.id,
          {
            sourceId: 'finder:partner:coqpi-queue-ready',
            partnerName: 'Northfield Labs',
            title: 'Partner outreach lead',
            summary: 'High relevance partner in French agri ecosystem.',
            links: ['https://northfield.example'],
            fitScore: 86,
            whyRelevant: 'Strong operational overlap for first outreach.',
            nextAction: 'Build intro call context.'
          }
        )
        const shouldSkip = await services.finderSearchService.addFinderCandidateResult(
          job.id,
          {
            sourceId: 'finder:partner:coqpi-queue-skip',
            partnerName: 'Sideline Venture',
            title: 'Secondary follow-up',
            summary: 'Sparse evidence, not ready for immediate queue import.',
            fitScore: 42,
            nextAction: ''
          }
        )

        const importReadyResult = importReady.store.results.find(
          (result) =>
            result.sourceId === 'finder:partner:coqpi-queue-ready'
        )
        const skipResult = shouldSkip.store.results.find(
          (result) =>
            result.sourceId === 'finder:partner:coqpi-queue-skip'
        )

        if (!importReadyResult || !skipResult) {
          throw new Error('Finder queue fixture not loaded.')
        }

        observed.importSourceId = importReadyResult.sourceId
        observed.notImportSourceId = skipResult.sourceId

        const payload = await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
          createContextPackDraftFromFinderResult(importReadyResult)
        ])

        const session = await services.sessionContextService.getSessionContext()
        const nextContext = getSessionContextWithImportedCounterpartyPacks(
          session.context,
          payload.manifest.counterpartyPacks ?? [],
          [createContextPackDraftFromFinderResult(importReadyResult)]
        )

        expectedSelectedPackIds = nextContext.selectedCounterpartyPackIds

        await services.sessionContextService.saveSessionContext(nextContext)
      },
      onSelectedPackIds: (selectedPackIds) => {
        observed.selectedPackIdsFromRetrieval = [...(selectedPackIds ?? [])]
      },
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        observed.capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu:
                'Finder queue import now selected pack for live prompt.',
              detectedQuestion: 'Which queue target is selected for outreach?',
              intent: 'finder queue import test',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I will focus on the selected partner from queue.',
                  answerMeaningRu:
                    'Я фокусируюсь на выбранном партнере из очереди.'
                }
              ],
              keywordsToRemember: ['queue', 'partner', 'import'],
              openingPhrase: 'Understood.'
            })
          }
        })
      }
    })
  })

  assert.equal(observed.selectedPackIdsFromRetrieval.length, 1)
  assert.deepEqual(observed.selectedPackIdsFromRetrieval, expectedSelectedPackIds)
  assert.equal(observed.capturedPrompt.includes(observed.importSourceId), true)
  assert.equal(observed.capturedPrompt.includes(observed.notImportSourceId), false)
  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /Partner outreach lead/)
  assert.equal(observed.capturedPrompt.includes('Sideline Venture'), false)
})

test('full App-style finder import -> prepare selection -> live analyze keeps only chosen pack in prompt', async () => {
  const observed = {
    prepareSelectedPackLabel: '',
    prepareIncludedSourceId: '',
    savedSelectedCounterpartyPackIds: undefined,
    reloadedSelectedCounterpartyPackIds: undefined,
    retrievalSelectedCounterpartyPackIds: undefined,
    capturedPrompt: ''
  }
  let expectedSelectedPackIds = []
  let expectedIncludedSourceId = ''
  let expectedExcludedSourceId = ''

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      beforeAnalyze: async (services) => {
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'Finder full app path',
          query: 'product roles france',
          goal: 'Prove finder import to live assistant path.'
        })
        const job = afterJob.store.jobs[0]
        const preview =
          await services.finderSearchService.previewFinderOwnerPastedSource(
            job.id,
            [
              'Company: Northfield Labs',
              'Role: Senior Product Manager',
              'Location: Paris, France',
              'Website: https://northfield.example/careers',
              'Contact: hiring@northfield.example',
              'Why relevant: Strong fit for product leadership in agtech.',
              '',
              'Company: Secondwind Systems',
              'Role: Product Operations Lead',
              'Location: Lyon, France',
              'Website: https://secondwind.example/jobs',
              'Contact: jobs@secondwind.example',
              'Why relevant: Useful backup option but should stay out of the chosen session.'
            ].join('\n')
          )

        const finderPayload =
          await services.finderSearchService.ingestFinderOwnerPastedSourceCandidates(
            job.id,
            preview.candidates.map((candidate) => candidate.draft)
          )
        const finderResults = finderPayload.store.results.filter(
          (result) => result.jobId === job.id
        )

        const drafts = finderResults.map((result) =>
          createContextPackDraftFromFinderResult(result)
        )
        const manifestPayload =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts(
            drafts
          )
        const nextPacks = manifestPayload.manifest.counterpartyPacks ?? []

        const chosenPack = nextPacks.find(
          (pack) => pack.partnerName === 'Northfield Labs'
        )
        const excludedPack = nextPacks.find(
          (pack) => pack.partnerName === 'Secondwind Systems'
        )

        if (!chosenPack || !excludedPack) {
          throw new Error('Expected imported finder packs were not created.')
        }

        expectedSelectedPackIds = [chosenPack.id]
        expectedIncludedSourceId = chosenPack.sourceId
        expectedExcludedSourceId = excludedPack.sourceId

        await services.contextSourceService.setCounterpartyContextPackSelected(
          chosenPack.id,
          true
        )
        await services.contextSourceService.setCounterpartyContextPackSelected(
          excludedPack.id,
          false
        )

        const currentSession =
          (await services.sessionContextService.getSessionContext()).context
        const nextContext = getSessionContextWithCounterpartyPacks(
          {
            ...currentSession,
            company: 'Northfield Labs',
            role: 'Senior Product Manager',
            context: 'Prepare selected one imported finder pack.',
            goal: 'Keep only the chosen pack in the live assistant request.',
            notes: 'Second candidate remains imported but unselected for this session.',
            selectedCounterpartyPackIds: [chosenPack.id]
          },
          nextPacks
        )
        const saved =
          await services.sessionContextService.saveSessionContext(nextContext)
        observed.savedSelectedCounterpartyPackIds =
          saved.context.selectedCounterpartyPackIds

        const reloaded = await services.sessionContextService.getSessionContext()
        observed.reloadedSelectedCounterpartyPackIds =
          reloaded.context.selectedCounterpartyPackIds

        const reloadedManifest =
          await services.contextSourceService.getContextSourceManifest()
        const surface = buildSessionSelectionSurface({
          activeContext: reloaded.context,
          draftContext: reloaded.context,
          availablePacks: reloadedManifest.manifest.counterpartyPacks ?? [],
          availableFinderResults: finderPayload.store.results,
          availableOutreachDrafts: finderPayload.store.outreachDrafts,
          includeProfileContext: false,
          profileChars: 0
        })

        observed.prepareSelectedPackLabel =
          surface.activePrepPreview.selectedPackLabel
        observed.prepareIncludedSourceId =
          surface.activePayloadInspector.includedPacks[0]?.sourceId ?? ''
      },
      onSelectedPackIds: (selectedPackIds) => {
        observed.retrievalSelectedCounterpartyPackIds = [
          ...(selectedPackIds ?? [])
        ]
      },
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        observed.capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu:
                'Полный finder -> prepare -> live путь удержал только выбранный pack.',
              detectedQuestion: 'Which imported candidate context is active now?',
              intent: 'full finder app path check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I prepared using the selected Northfield Labs context.',
                  answerMeaningRu:
                    'Я подготовился по выбранному контексту Northfield Labs.'
                }
              ],
              keywordsToRemember: ['selected pack', 'Northfield Labs'],
              openingPhrase: 'Yes.'
            })
          }
        })
      }
    })
  })

  assert.deepEqual(
    observed.savedSelectedCounterpartyPackIds,
    expectedSelectedPackIds
  )
  assert.deepEqual(
    observed.reloadedSelectedCounterpartyPackIds,
    expectedSelectedPackIds
  )
  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    expectedSelectedPackIds
  )
  assert.equal(
    observed.prepareSelectedPackLabel,
    'Northfield Labs · Senior Product Manager'
  )
  assert.equal(observed.prepareIncludedSourceId, expectedIncludedSourceId)
  assert.equal(observed.capturedPrompt.includes(expectedIncludedSourceId), true)
  assert.equal(observed.capturedPrompt.includes(expectedExcludedSourceId), false)
  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /Senior Product Manager/)
  assert.equal(observed.capturedPrompt.includes('Secondwind Systems'), false)
  assert.equal(observed.capturedPrompt.includes('Product Operations Lead'), false)
})

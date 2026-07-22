const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const { buildAutoAnalysisSchedule } = require('../dist-electron/shared/live-loop.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
    const assistantService = require('../dist-electron/backend/services/assistant-service.js')
    const assistantProviderProfile = require('../dist-electron/backend/services/assistant-provider-profile.js')
    const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
    const sessionContextService = require('../dist-electron/backend/services/session-context-service.js')
    const profileService = require('../dist-electron/backend/services/profile-service.js')
    const secretStorageService = require('../dist-electron/backend/services/secret-storage-service.js')
    const governanceService = require('../dist-electron/backend/services/governance-service.js')

    return await run({
      assistantService,
      assistantProviderProfile,
      contextSourceService,
      sessionContextService,
      profileService,
      secretStorageService,
      governanceService
    })
  } finally {
    Module._load = originalModuleLoad
  }
}

const makeRequest = (overrides = {}) => ({
  transcriptText:
    'I am interested in this role and would like to discuss the next steps.',
  callLanguage: 'en',
  answerLanguage: 'en',
  mode: 'full',
  includeProfileContext: false,
  recentWindowLabel: '30s',
  costMode: 'balanced',
  ...overrides
})

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

const makeOllamaResponse = (payload) => ({
  ok: true,
  text: async () => JSON.stringify(payload),
  json: async () => payload
})

const withStubbedProviderRoute = ({
  profileCount,
  fetchHandler,
  requestOverrides,
  beforeAnalyze,
  onRetrievalCall,
  onSelectedPackIds,
  onAnalyzeRequest,
  onProviderProfiles
}) =>
  withElectronMock(async (services) => {
    process.env.COQPI_ASSISTANT_PROVIDER_TIMEOUT_MS = '120'
    process.env.COQPI_ASSISTANT_REQUEST_BUDGET_MS = '150'
    const previousProviderProfile = process.env.COQPI_ASSISTANT_PROVIDER_PROFILE
    const previousOllamaBaseUrl = process.env.OLLAMA_BASE_URL
    process.env.COQPI_ASSISTANT_PROVIDER_PROFILE = 'ollama:0'
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

    const profiles = Array.from({ length: profileCount }).map((_, index) => ({
      provider: 'ollama',
      priority: index * 10,
      model: 'llama3.1',
      baseUrl: 'http://127.0.0.1:11434',
      enabled: true,
      isTextOnly: true,
      failoverEnabled: true
    }))

    try {
      return withPatchedModules(
      [
        [
          services.assistantProviderProfile,
          'getOrderedEnabledProviderProfiles',
          () => {
            onProviderProfiles?.(profiles)
            return profiles
          }
        ],
        [services.profileService, 'getProfileContext', async () => ({ content: '' })],
        [
          services.contextSourceService,
          'getPersonalInterviewRetrieval',
          async (_transcriptText, _answerLanguage, retrievalKinds, selectedPackIds) => {
            onRetrievalCall?.(retrievalKinds)
            onSelectedPackIds?.(selectedPackIds)
            return ''
          }
        ],
        [
          services.secretStorageService,
          'resolveOpenAIApiKey',
          async () => 'test-key'
        ],
        [
          services.governanceService,
          'runGovernedProviderAction',
          async (_action, execute) => execute()
        ]
      ],
        async () => {
        const fetchDescriptor = Object.getOwnPropertyDescriptor(global, 'fetch')
        if (fetchDescriptor && fetchDescriptor.configurable) {
          Object.defineProperty(global, 'fetch', {
            ...fetchDescriptor,
            value: fetchHandler
          })
        } else {
          global.fetch = fetchHandler
        }

        if (beforeAnalyze) {
          await beforeAnalyze(services)
        }

        const resolvedOverrides =
          typeof requestOverrides === 'function'
            ? requestOverrides(services)
            : requestOverrides
        const request = makeRequest(resolvedOverrides)
        onAnalyzeRequest?.(request)
        return services.assistantService.analyzeRecentTranscript(request)
      })
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
    path.join(os.tmpdir(), 'coqpi-analyze-session-relay-')
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

test('selected pack changes during cooldown replace scheduled analyzeRecentTranscript request', async () => {
  const capturedRequests = []
  const analysisResult = {
    meaningRu: 'кратко',
    detectedQuestion: 'What experience do you have?',
    intent: 'understand fit',
    risk: 'low',
    suggestedAnswers: [],
    keywordsToRemember: ['fit', 'role'],
    openingPhrase: 'Great.'
  }
  const now = Date.now()
  const latestFinalUtterance = {
    id: 'u-42',
    speaker: 'other',
    text: 'I have experience in this role.',
    isFinal: true,
    timestampStart: new Date().toISOString(),
    timestampEnd: new Date().toISOString(),
    source: 'realtime',
    language: 'en'
  }
  const analysisText = latestFinalUtterance.text

  const firstPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: now + 80,
    nowMs: now,
    selectedCounterpartyPackIds: ['pack-A']
  })

  const secondPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: firstPlan.fingerprint,
    assistantState: 'idle',
    analysisCooldownUntil: now + 80,
    nowMs: now + 50,
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(firstPlan.shouldRun, true)
  assert.equal(secondPlan.shouldRun, true)
  assert.equal(firstPlan.fingerprint !== secondPlan.fingerprint, true)

  let scheduledTimer = null
  let scheduledFingerprint = null
  let runningAnalysisPromise = Promise.resolve()

  const executeRequest = async (selectedCounterpartyPackIds) => {
    await withStubbedProviderRoute({
      profileCount: 1,
      requestOverrides: {
        selectedCounterpartyPackIds
      },
      onAnalyzeRequest: (request) => {
        capturedRequests.push(request)
      },
      fetchHandler: async () =>
        makeOllamaResponse({
          message: {
            content: JSON.stringify(analysisResult)
          }
        })
    })
    scheduledFingerprint = null
  }

  const scheduleRequest = (selectedCounterpartyPackIds) => {
    const plan = buildAutoAnalysisSchedule({
      latestFinalUtterance,
      transcriptText: analysisText,
      lastAutoAnalyzedFingerprint: null,
      scheduledAutoAnalysisFingerprint: scheduledFingerprint,
      assistantState: 'idle',
      analysisCooldownUntil: now + 80,
      selectedCounterpartyPackIds
    })

    if (!plan.shouldRun || plan.fingerprint === null) {
      return false
    }

    if (scheduledTimer !== null) {
      clearTimeout(scheduledTimer)
    }

    scheduledFingerprint = plan.fingerprint
    scheduledTimer = setTimeout(() => {
      runningAnalysisPromise = executeRequest(selectedCounterpartyPackIds)
    }, plan.delayMs ?? 0)
    return true
  }

  const firstScheduled = scheduleRequest(['pack-A'])
  assert.equal(firstScheduled, true)
  assert.equal(scheduledFingerprint, firstPlan.fingerprint)

  // Still in cooldown window; new pack selection should invalidate previous plan.
  await sleep(40)

  const secondScheduled = scheduleRequest(['pack-B'])
  assert.equal(secondScheduled, true)
  assert.equal(scheduledFingerprint, secondPlan.fingerprint)
  assert.notEqual(firstPlan.fingerprint, scheduledFingerprint)

  await sleep((secondPlan.delayMs ?? 0) + 120)
  await runningAnalysisPromise
  if (scheduledTimer !== null) {
    clearTimeout(scheduledTimer)
  }

  assert.equal(capturedRequests.length, 1)
  assert.deepEqual(capturedRequests[0].selectedCounterpartyPackIds, ['pack-B'])
})

test('analyzeRecentTranscript passes retrieval kinds to context source service', async () => {
  const observed = { retrievalKinds: undefined }

  await withStubbedProviderRoute({
    profileCount: 1,
    requestOverrides: {
      retrievalKinds: ['job', 'partner']
    },
    onRetrievalCall: (retrievalKinds) => {
      observed.retrievalKinds = retrievalKinds
    },
    fetchHandler: async () =>
      makeOllamaResponse({
        message: {
          content: JSON.stringify({
            meaningRu: 'кратко',
            detectedQuestion: 'What experience do you have?',
            intent: 'understand fit',
            risk: 'low',
            suggestedAnswers: [],
            keywordsToRemember: ['fit', 'role'],
            openingPhrase: 'Great.'
          })
        }
      })
  })

  assert.deepEqual(observed.retrievalKinds?.sort(), ['job', 'partner'])
})

test('analyzeRecentTranscript passes selected counterparty pack ids to context source service', async () => {
  const observed = { selectedCounterpartyPackIds: undefined }
  let selectedCounterpartyPackIds = []

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const imported = await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
          {
            kind: 'job',
            sourceId: 'finder:job:selected-pass-001',
            partnerName: 'Selected Pass One',
            title: 'Selected role one',
            summary: 'First selected pack for assistant path.'
          },
          {
            kind: 'partner',
            sourceId: 'finder:partner:selected-pass-002',
            partnerName: 'Selected Pass Two',
            title: 'Selected partner two',
            summary: 'Second selected pack for assistant path.'
          }
        ])

        selectedCounterpartyPackIds = imported.manifest.counterpartyPacks.map(
          (pack) => pack.id
        )
      },
      requestOverrides: () => ({
        selectedCounterpartyPackIds
      }),
      onSelectedPackIds: (selectedPackIds) => {
        observed.selectedCounterpartyPackIds = selectedPackIds
      },
      fetchHandler: async () =>
        makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'кратко',
              detectedQuestion: 'What experience do you have?',
              intent: 'understand fit',
              risk: 'low',
              suggestedAnswers: [],
              keywordsToRemember: ['fit', 'role'],
              openingPhrase: 'Great.'
            })
          }
        })
    })
  })

  assert.deepEqual(observed.selectedCounterpartyPackIds, selectedCounterpartyPackIds)
})

test('finder-imported pack selection persists through session reload and is sent with analyze', async () => {
  const observed = {
    requestSelectedCounterpartyPackIds: undefined,
    contextSelectedCounterpartyPackIds: undefined,
    retrievalSelectedCounterpartyPackIds: undefined
  }
  let activeSessionContext = {
    company: '',
    role: '',
    context: '',
    goal: '',
    notes: '',
    selectedCounterpartyPackIds: []
  }

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const imported = await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts(
          [
            {
              kind: 'job',
              sourceId: 'finder:job:fr-relance-007',
              partnerName: 'Agri Relay',
              title: 'Agri PM',
              summary: 'Short summary for persistence verification.'
            }
          ]
        )

        const importedId =
          imported.manifest.counterpartyPacks?.[0]?.id

        await services.sessionContextService.saveSessionContext({
          company: 'Acme Holdings',
          role: 'Product Lead',
          context: 'Hiring interview preparation',
          goal: 'Prepare a 15-minute call',
          notes: 'Focus on EN interview context.',
          selectedCounterpartyPackIds: importedId ? [importedId] : []
        })

        const reloadedSession =
          await services.sessionContextService.getSessionContext()

        activeSessionContext = reloadedSession.context
        observed.contextSelectedCounterpartyPackIds =
          activeSessionContext.selectedCounterpartyPackIds
      },
      requestOverrides: () => ({
        sessionContext: activeSessionContext,
        selectedCounterpartyPackIds:
          activeSessionContext.selectedCounterpartyPackIds
      }),
      onAnalyzeRequest: (request) => {
        observed.requestSelectedCounterpartyPackIds =
          request.selectedCounterpartyPackIds
      },
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.retrievalSelectedCounterpartyPackIds = [
          ...(selectedCounterpartyPackIds ?? [])
        ]
      },
      fetchHandler: async () =>
        makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Кандидат рассказал о релевантной позиции.',
              detectedQuestion: 'What is your experience with PM?',
              intent: 'understand fit',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I have led product teams end-to-end.',
                  answerMeaningRu: 'Я руководил продуктовой командой.'
                }
              ],
              keywordsToRemember: ['interview', 'pm'],
              openingPhrase: 'Good point.'
            })
          }
        })
    })
  })

  assert.deepEqual(
    observed.requestSelectedCounterpartyPackIds,
    observed.contextSelectedCounterpartyPackIds
  )
  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    observed.contextSelectedCounterpartyPackIds
  )
})

test('finder batch import payload survives session persistence and flows into selected pack ids for analysis', async () => {
  const observed = {
    requestSelectedCounterpartyPackIds: undefined,
    contextSelectedCounterpartyPackIds: undefined,
    retrievalSelectedCounterpartyPackIds: undefined
  }
  let activeSessionContext = {
    company: '',
    role: '',
    context: '',
    goal: '',
    notes: '',
    selectedCounterpartyPackIds: []
  }

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const imported = await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
          {
            kind: 'job',
            sourceId: 'finder:job:batch-demo-011',
            partnerName: 'Northfield Labs',
            title: 'Head of Product',
            summary: 'Batch import candidate for interview workflow.'
          },
          {
            kind: 'investor',
            sourceId: 'finder:investor:seed-fund-011',
            partnerName: 'Agri Ventures',
            title: 'Seed investor',
            summary: 'Potential investment partner for pilot funding.'
          },
          {
            kind: 'partner',
            sourceId: 'finder:partner:ops-011',
            partnerName: 'Pilot Partner',
            title: 'Potential implementation partner',
            summary: 'Potential pilot partner for workflow integration.'
          }
        ])

        const importedIds = (imported.manifest.counterpartyPacks ?? [])
          .slice(0, 2)
          .map((pack) => pack.id)

        await services.sessionContextService.saveSessionContext({
          company: 'Acme Holdings',
          role: 'Product Lead',
          context: 'Hiring + partner outreach interview',
          goal: 'Keep context short and relevant',
          notes: 'Prefer one-line follow up from me.',
          selectedCounterpartyPackIds: importedIds
        })

        const reloadedSession =
          await services.sessionContextService.getSessionContext()

        activeSessionContext = reloadedSession.context
        observed.contextSelectedCounterpartyPackIds =
          activeSessionContext.selectedCounterpartyPackIds
      },
      requestOverrides: () => ({
        sessionContext: activeSessionContext,
        selectedCounterpartyPackIds:
          activeSessionContext.selectedCounterpartyPackIds
      }),
      onAnalyzeRequest: (request) => {
        observed.requestSelectedCounterpartyPackIds =
          request.selectedCounterpartyPackIds
      },
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.retrievalSelectedCounterpartyPackIds = [
          ...(selectedCounterpartyPackIds ?? [])
        ]
      },
      fetchHandler: async () =>
        makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Нужно связать вакансии, партнёров и инвесторов по сценарию.',
              detectedQuestion: 'What scope and timeline do you recommend?',
              intent: 'understand strategy',
              risk: 'medium',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I would propose a two-week pilot.',
                  answerMeaningRu: 'Предлагаю запуск на две недели.'
                }
              ],
              keywordsToRemember: ['pilot', 'timeline'],
              openingPhrase: 'Great point.'
            })
          }
        })
    })
  })

  assert.deepEqual(
    observed.requestSelectedCounterpartyPackIds,
    observed.contextSelectedCounterpartyPackIds
  )
  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    observed.contextSelectedCounterpartyPackIds
  )
})

test('analyzeRecentTranscript resolves selected pack ids from persisted session when omitted from request', async () => {
  const observed = {
    requestSelectedCounterpartyPackIds: undefined,
    retrievalSelectedCounterpartyPackIds: undefined,
    contextSelectedCounterpartyPackIds: undefined
  }

  let selectedPackIds = []

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:session-default-999',
              partnerName: 'Default Session',
              title: 'Session fallback check',
              summary: 'Packet must be recovered from saved session context.'
            },
            {
              kind: 'partner',
              sourceId: 'finder:partner:fallback-999',
              partnerName: 'Fallback Partner',
              title: 'Fallback channel',
              summary: 'Should remain deselected in session unless chosen.'
            }
          ])

        const importedJob = importResult.manifest.counterpartyPacks?.find(
          (pack) => pack.sourceId === 'finder:job:session-default-999'
        )

        selectedPackIds = importedJob ? [importedJob.id] : []

        await services.sessionContextService.saveSessionContext({
          company: 'Acme Holdings',
          role: 'Founder',
          context: 'Hiring session',
          goal: 'Validate fallback to persisted selection',
          notes: 'No live request should be needed for session-selected packs.',
          selectedCounterpartyPackIds: selectedPackIds
        })
      },
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      onAnalyzeRequest: (request) => {
        observed.requestSelectedCounterpartyPackIds =
          request.selectedCounterpartyPackIds
        observed.contextSelectedCounterpartyPackIds =
          request.sessionContext?.selectedCounterpartyPackIds
      },
      onSelectedPackIds: (selectedPackIdsFromRetrieval) => {
        observed.retrievalSelectedCounterpartyPackIds = [
          ...(selectedPackIdsFromRetrieval ?? [])
        ]
      },
      fetchHandler: async () =>
        makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Подборка подтянулась из сохранённого сеанса.',
              detectedQuestion: 'Which candidate pack was selected?',
              intent: 'selection check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'The saved session pack is now active.',
                  answerMeaningRu: 'Выбранный в сессии пакет уже активен.'
                }
              ],
              keywordsToRemember: ['session', 'fallback'],
              openingPhrase: 'Great one.'
            })
          }
        })
    })
  })

  assert.deepEqual(
    observed.requestSelectedCounterpartyPackIds,
    undefined
  )
  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    selectedPackIds
  )
})

test('analyzeRecentTranscript filters persisted selected pack ids through retrieval-ready contract', async () => {
  const observed = {
    retrievalSelectedCounterpartyPackIds: undefined
  }
  let expectedSelectedPackIds = []

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:contract-route-001',
              partnerName: 'Allowed Job',
              title: 'Allowed session route',
              summary: 'Only this pack should route into assistant retrieval.'
            },
            {
              kind: 'partner',
              sourceId: 'finder:partner:contract-route-002',
              partnerName: 'Blocked Partner',
              title: 'Blocked session route',
              summary: 'This pack is stored but not explicitly selected.',
              selected: false
            }
          ])

        const packs = importResult.manifest.counterpartyPacks ?? []
        const allowedPack = packs.find(
          (pack) => pack.sourceId === 'finder:job:contract-route-001'
        )
        const blockedPack = packs.find(
          (pack) => pack.sourceId === 'finder:partner:contract-route-002'
        )

        expectedSelectedPackIds = allowedPack ? [allowedPack.id] : []

        await services.sessionContextService.saveSessionContext({
          company: 'Acme Holdings',
          role: 'Founder',
          context: 'Routing contract session',
          goal: 'Do not leak unselected packs into analysis.',
          notes: 'Session stores duplicate, missing, and unselected IDs.',
          selectedCounterpartyPackIds: [
            allowedPack?.id,
            allowedPack?.id,
            blockedPack?.id,
            'missing-pack-id'
          ].filter(Boolean)
        })
      },
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      onSelectedPackIds: (selectedPackIdsFromRetrieval) => {
        observed.retrievalSelectedCounterpartyPackIds = [
          ...(selectedPackIdsFromRetrieval ?? [])
        ]
      },
      fetchHandler: async () =>
        makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Маршрутизация контекста ограничена выбранным пакетом.',
              detectedQuestion: 'Which pack is active?',
              intent: 'routing check',
              risk: 'low',
              suggestedAnswers: [],
              keywordsToRemember: ['selected', 'context'],
              openingPhrase: 'Understood.'
            })
          }
        })
    })
  })

  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    expectedSelectedPackIds
  )
})

test('session context save and reload prune stale selected counterparty pack ids', async () => {
  const observed = {
    savedSelectedCounterpartyPackIds: undefined,
    reloadedSelectedCounterpartyPackIds: undefined
  }
  let expectedSelectedPackIds = []

  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const importResult =
        await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
          {
            kind: 'job',
            sourceId: 'finder:job:session-prune-001',
            partnerName: 'Allowed Session Pack',
            title: 'Allowed session pack',
            summary: 'This selected pack should remain in saved session.'
          },
          {
            kind: 'investor',
            sourceId: 'finder:investor:session-prune-002',
            partnerName: 'Blocked Session Pack',
            title: 'Blocked session pack',
            summary: 'This unselected pack should be removed from session.',
            selected: false
          }
        ])

      const allowedPack = importResult.manifest.counterpartyPacks.find(
        (pack) => pack.sourceId === 'finder:job:session-prune-001'
      )
      const blockedPack = importResult.manifest.counterpartyPacks.find(
        (pack) => pack.sourceId === 'finder:investor:session-prune-002'
      )

      expectedSelectedPackIds = allowedPack ? [allowedPack.id] : []

      const saved = await services.sessionContextService.saveSessionContext({
        company: 'Acme Holdings',
        role: 'Founder',
        context: 'Session pruning contract',
        goal: 'Keep only active selected packs.',
        notes: 'Duplicate, missing and unselected IDs must not persist.',
        selectedCounterpartyPackIds: [
          allowedPack?.id,
          allowedPack?.id,
          blockedPack?.id,
          'missing-pack-id',
          ''
        ].filter(Boolean)
      })

      const reloaded = await services.sessionContextService.getSessionContext()
      observed.savedSelectedCounterpartyPackIds =
        saved.context.selectedCounterpartyPackIds
      observed.reloadedSelectedCounterpartyPackIds =
        reloaded.context.selectedCounterpartyPackIds
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
})

test('analyzeRecentTranscript returns structured result on valid Ollama JSON', async () => {
  const response = {
    meaningRu: 'Кандидат объясняет интерес к роли и следующий шаг.',
    detectedQuestion: 'What interests you about this role?',
    intent: 'understand fit',
    risk: 'low',
    suggestedAnswers: [
      {
        label: 'short',
        text: 'I am very interested in the challenge and growth.',
        answerMeaningRu: 'Мне очень интересно.'
      }
    ],
    keywordsToRemember: ['fit', 'challenge', 'growth'],
    openingPhrase: 'Great question.'
  }

  const result = await withStubbedProviderRoute({
    profileCount: 1,
    fetchHandler: async () =>
      makeOllamaResponse({ message: { content: JSON.stringify(response) } })
  })

  assert.equal(result.meaningRu, response.meaningRu)
  assert.equal(result.detectedQuestion, response.detectedQuestion)
  assert.equal(result.suggestedAnswers[0].label, 'short')
})

test('analyzeRecentTranscript surfaces timeout from provider call path', async () => {
  process.env.COQPI_ASSISTANT_REQUEST_BUDGET_MS = '500'

  await assert.rejects(
    () =>
      withStubbedProviderRoute({
        profileCount: 1,
        fetchHandler: () =>
          new Promise(() => {
            // never resolves, triggers analysis timeout branch
          })
      }),
    /timed out after 120ms/
  )
})

test('analyzeRecentTranscript fails fast with budget exhausted after retries', async () => {
  process.env.COQPI_ASSISTANT_REQUEST_BUDGET_MS = '150'

  await assert.rejects(
    () =>
      withStubbedProviderRoute({
        profileCount: 3,
        fetchHandler: () =>
          new Promise(() => {
            // never resolves, each provider consumes remaining budget
          })
      }),
    /budget exhausted while routing/
  )
})

test('manual recovery succeeds after non-retryable first-pass analysis block', async () => {
  const answerResult = {
    meaningRu: 'Короткий тезис ответа по запросу собеседования.',
    detectedQuestion: 'Could you summarize your project impact?',
    intent: 'assess fit',
    risk: 'low',
    suggestedAnswers: [
      {
        label: 'short',
        text: 'I improved delivery and reduced cycle time by 20%.',
        answerMeaningRu: 'Я улучшил delivery и сократил цикл на 20%.'
      }
    ],
    keywordsToRemember: ['project', 'impact'],
    openingPhrase: 'Good point.'
  }

  let calls = 0

  const fetchHandler = async () => {
    calls += 1

    if (calls === 1) {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'unauthorized',
        json: async () => ({ error: 'Unauthorized' })
      }
    }

    return makeOllamaResponse({
      message: {
        content: JSON.stringify(answerResult)
      }
    })
  }

  await assert.rejects(
    () =>
      withStubbedProviderRoute({
        profileCount: 1,
        fetchHandler
      }),
    /Ollama API request failed: 401 Unauthorized/
  )

  const recovered = await withStubbedProviderRoute({
    profileCount: 1,
    fetchHandler
  })

  assert.equal(calls, 2)
  assert.equal(recovered.meaningRu, answerResult.meaningRu)
  assert.equal(recovered.detectedQuestion, answerResult.detectedQuestion)
  assert.equal(recovered.suggestedAnswers[0].label, 'short')
})

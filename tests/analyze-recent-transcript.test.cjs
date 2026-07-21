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
  onAnalyzeRequest
}) =>
  withElectronMock(async (services) => {
    process.env.COQPI_ASSISTANT_PROVIDER_TIMEOUT_MS = '120'
    process.env.COQPI_ASSISTANT_REQUEST_BUDGET_MS = '150'

    const profiles = Array.from({ length: profileCount }).map((_, index) => ({
      provider: 'ollama',
      priority: index * 10,
      model: 'llama3.1',
      baseUrl: 'http://127.0.0.1:11434',
      enabled: true,
      isTextOnly: true,
      failoverEnabled: true
    }))

    return withPatchedModules(
      [
        [
          services.assistantProviderProfile,
          'getOrderedEnabledProviderProfiles',
          () => profiles
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
        global.fetch = fetchHandler
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
      }
    )
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
      void executeRequest(selectedCounterpartyPackIds)
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

  await withStubbedProviderRoute({
    profileCount: 1,
    requestOverrides: {
      selectedCounterpartyPackIds: ['pack-1', 'pack-2']
    },
    onSelectedPackIds: (selectedCounterpartyPackIds) => {
      observed.selectedCounterpartyPackIds = selectedCounterpartyPackIds
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

  assert.deepEqual(observed.selectedCounterpartyPackIds, ['pack-1', 'pack-2'])
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

const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const { buildAutoAnalysisSchedule } = require('../dist-electron/shared/live-loop.js')
const {
  buildSessionPayloadInspector
} = require('../dist-electron/shared/session-payload-inspector.js')
const {
  buildSessionSelectionSurface
} = require('../dist-electron/shared/session-selection-surface.js')
const {
  getSessionContextWithImportedCounterpartyPacks
} = require('../dist-electron/shared/session-pack-selection.js')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const {
  createContextPackDraftFromFinderResult
} = require('../dist-electron/shared/finder-search-module.js')

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
    const finderSearchService = require('../dist-electron/backend/services/finder-search-service.js')
    const finderSessionIngressService = require('../dist-electron/backend/services/finder-session-ingress-service.js')
    const sessionSummaryService = require('../dist-electron/backend/services/session-summary-service.js')
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
      sessionSummaryService,
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
    const originalGetPersonalInterviewRetrieval =
      services.contextSourceService.getPersonalInterviewRetrieval.bind(
        services.contextSourceService
      )

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
          async (
            transcriptText,
            answerLanguage,
            retrievalKinds,
            selectedPackIds,
            retrievalProvider
          ) => {
            onRetrievalCall?.(retrievalKinds)
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
            ? await requestOverrides(services)
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

test('analyzeRecentTranscript assistant prompt matches session payload inspector included/dropped', async () => {
  const observed = {
    capturedPrompt: '',
    capturedSelectedPackIds: undefined,
    requestContext: null
  }

  let preparedPacks = []
  let preparedDraft = null
  let requestedPackIds = []

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:payload-audit-keep',
              partnerName: 'Payload Audit Co',
              title: 'Interview lead',
              summary: 'Candidate pack that should stay in payload.'
            },
            {
              kind: 'partner',
              sourceId: 'finder:partner:payload-audit-drop',
              partnerName: 'Payload Audit Drop',
              title: 'Partner pack that must be dropped',
              summary: 'Should not go to assistant payload.',
              selected: false
            }
          ])

        preparedPacks = importResult.manifest.counterpartyPacks

        const keepPack = preparedPacks.find(
          (pack) => pack.sourceId === 'finder:job:payload-audit-keep'
        )

        const dropPack = preparedPacks.find(
          (pack) => pack.sourceId === 'finder:partner:payload-audit-drop'
        )

        requestedPackIds = [
          keepPack?.id,
          dropPack?.id,
          'missing-payload-pack-id'
        ].filter(Boolean)

        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'Payload audit job',
          query: 'senior product lead france'
        })
        const job = afterJob.store.jobs[0]
        const afterCandidate =
          await services.finderSearchService.addFinderCandidateResult(job.id, {
            sourceId: 'finder:job:payload-audit-candidate',
            partnerName: 'Payload Audit Co',
            title: 'Interview lead',
            summary: 'Source for outreach draft',
            fitScore: 89,
            whyRelevant: 'Context-ready draft for prompt confirmation',
            missingInfo: 'Nothing critical',
            nextAction: 'Use the prepared draft text in the first reply.'
          })

        const candidate = afterCandidate.store.results[0]
        const afterDraft = await services.finderSearchService.saveFinderOutreachDraft(
          candidate.id
        )

        preparedDraft = afterDraft.store.outreachDrafts[0]
      },
      requestOverrides: async (services) => {
        const sessionContext = {
          company: 'PayloadAudit Corp',
          role: 'Senior Product Lead',
          context: 'Payload audit check',
          goal: 'Keep prompt in selected-only scope.',
          notes: 'No silent pack leakage.',
          selectedCounterpartyPackIds: requestedPackIds,
          selectedFinderOutreachDraftId: preparedDraft?.id ?? ''
        }

        const persisted = await services.sessionContextService.saveSessionContext(
          sessionContext
        )

        observed.requestContext = persisted.context

        return {
          ...makeRequest(),
          sessionContext: persisted.context,
          selectedCounterpartyPackIds: persisted.context.selectedCounterpartyPackIds,
          selectedFinderOutreachDraftId: persisted.context.selectedFinderOutreachDraftId
        }
      },
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.capturedSelectedPackIds = [...selectedCounterpartyPackIds]
      },
      onRetrievalCall: () => {
        return
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Контрольный проход по аудит-пакетам пройден.',
              detectedQuestion: 'Which packs are active?',
              intent: 'payload audit',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I will use only the selected interview context.',
                  answerMeaningRu: 'Я использую только выбранный контекст интервью.'
                }
              ],
              keywordsToRemember: ['selected', 'payload'],
              openingPhrase: 'Noted.'
            })
          }
        })
      },
      onAnalyzeRequest: (request) => {
        if (!observed.requestContext) {
          observed.requestContext = request.sessionContext
        }
      },
      onProviderProfiles: () => undefined
    })
  })

  const inspector = buildSessionPayloadInspector({
    context: observed.requestContext,
    availablePacks: preparedPacks,
    availableOutreachDrafts: preparedDraft ? [preparedDraft] : [],
    includeProfileContext: false,
    profileChars: 0
  })

  assert.equal(
    observed.capturedSelectedPackIds?.length,
    inspector.includedPacks.length,
    'retrieval ids should match inspector-included pack count'
  )

  const expectedPromptPackTokens = inspector.includedPacks.map(
    (pack) => pack.sourceId
  )
  const droppedPromptPackTokens = inspector.droppedPacks
    .filter((pack) => pack.sourceId !== 'missing')
    .map((pack) => pack.sourceId)

  for (const token of expectedPromptPackTokens) {
    assert.equal(
      observed.capturedPrompt.includes(token),
      true,
      `prompt should include retained pack source ${token}`
    )
  }

  for (const token of droppedPromptPackTokens) {
    assert.equal(
      observed.capturedPrompt.includes(token),
      false,
      `prompt should not include dropped pack source ${token}`
    )
  }

  assert.match(
    observed.capturedPrompt,
    /Selected outreach draft for this counterpart \(private local source, already used or planned by owner\):/
  )
  assert.match(
    observed.capturedPrompt,
    /Payload Audit Co/
  )
  assert.match(
    observed.capturedPrompt,
    /Opening message already drafted: /
  )

  assert.deepEqual(
    observed.capturedSelectedPackIds,
    inspector.includedPacks.map((pack) => pack.id)
  )
})

test('analyzeRecentTranscript keeps selected pack context in prompt for generic self-intro question', async () => {
  const observed = {
    capturedPrompt: ''
  }

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const imported =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:generic-retrieval-001',
              partnerName: 'Northfield Labs',
              title: 'AI Product Lead',
              summary: 'Selected interview pack for AI product leadership.',
              context:
                'Owner prepared a concise version focused on product discovery, AI transformation and delivery leadership.'
            }
          ])

        const selectedPack = imported.manifest.counterpartyPacks[0]
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'Generic intro follow-up',
          query: 'ai product lead france'
        })
        const job = afterJob.store.jobs[0]
        const afterCandidate =
          await services.finderSearchService.addFinderCandidateResult(job.id, {
            sourceId: 'finder:job:generic-retrieval-001',
            partnerName: 'Northfield Labs',
            title: 'AI Product Lead',
            summary: 'Linked draft should be used for broad intro questions.',
            fitScore: 90,
            whyRelevant: 'This target is already active in Finder.',
            missingInfo: 'Need exact call timing.',
            nextAction: 'Use short follow-up framing.'
          })
        const candidate = afterCandidate.store.results[0]
        const afterDraft =
          await services.finderSearchService.saveFinderOutreachDraft(candidate.id)
        const draft = afterDraft.store.outreachDrafts[0]
        await services.finderSearchService.setFinderOutreachDraftStatus(
          draft.id,
          'follow_up'
        )
        const persisted =
          await services.sessionContextService.saveSessionContext({
            company: 'Northfield Labs',
            role: 'AI Product Lead',
            context: 'Generic intro test',
            goal: 'Keep selected pack visible even for broad questions.',
            notes: 'No irrelevant fallback.',
            selectedCounterpartyPackIds: [selectedPack.id],
            selectedFinderOutreachDraftId: ''
          })

        return {
          request: {
            ...makeRequest(),
            transcriptText: 'Can you briefly introduce yourself?',
            sessionContext: persisted.context,
            selectedCounterpartyPackIds: persisted.context.selectedCounterpartyPackIds
          }
        }
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Нужно кратко представить себя.',
              detectedQuestion: 'Can you briefly introduce yourself?',
              intent: 'generic self intro',
              risk: 'low',
              suggestedAnswers: [],
              keywordsToRemember: ['intro', 'product', 'AI'],
              openingPhrase: 'Sure.'
            })
          }
        })
      }
    })
  })

  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /selected fallback|matched/i)
  assert.match(observed.capturedPrompt, /AI Product Lead/)
  assert.match(observed.capturedPrompt, /Linked outreach draft for selected pack|Selected outreach draft/)
})

test('analyzeRecentTranscript includes owner-confirmed session summary only for the selected target', async () => {
  const observed = {
    capturedPrompt: ''
  }

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:summary-target-keep',
              partnerName: 'Northfield Labs',
              title: 'AI Product Lead',
              summary: 'Selected target for summary continuity.'
            },
            {
              kind: 'investor',
              sourceId: 'finder:investor:summary-target-drop',
              partnerName: 'Cobalt Seed',
              title: 'Seed investor',
              summary: 'Unselected target that should stay out of continuity.'
            }
          ])

        const keepPack = importResult.manifest.counterpartyPacks.find(
          (pack) => pack.sourceId === 'finder:job:summary-target-keep'
        )

        await services.sessionSummaryService.saveSessionSummary({
          sourceId: 'finder:job:summary-target-keep',
          partnerName: 'Northfield Labs',
          title: 'AI Product Lead',
          summary: 'Owner confirmed that the intro call already happened.',
          confirmedOutcomes: ['Need a tighter 90-day plan story'],
          followUps: ['Prepare one short follow-up around workflow transformation'],
          selectedCounterpartyPackIds: keepPack ? [keepPack.id] : []
        })

        await services.sessionSummaryService.saveSessionSummary({
          sourceId: 'finder:investor:summary-target-drop',
          partnerName: 'Cobalt Seed',
          title: 'Seed investor',
          summary: 'This unrelated investor summary must stay out of the prompt.',
          followUps: ['Investor-specific follow-up']
        })

        await services.sessionContextService.saveSessionContext({
          company: 'Northfield Labs',
          role: 'AI Product Lead',
          context: 'Selected target summary continuity',
          goal: 'Use only the selected target history.',
          notes: '',
          selectedCounterpartyPackIds: keepPack ? [keepPack.id] : [],
          selectedFinderOutreachDraftId: ''
        })
      },
      requestOverrides: async (services) => {
        const session = await services.sessionContextService.getSessionContext()
        return {
          ...makeRequest({
            transcriptText:
              'Could you briefly explain why you are a fit for this AI Product Lead role?'
          }),
          sessionContext: session.context,
          selectedCounterpartyPackIds: session.context.selectedCounterpartyPackIds
        }
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Нужно кратко объяснить fit к роли.',
              detectedQuestion: 'Why are you a fit for this role?',
              intent: 'fit summary',
              risk: 'low',
              suggestedAnswers: [],
              keywordsToRemember: ['fit', 'workflow', 'plan'],
              openingPhrase: 'Sure.'
            })
          }
        })
      }
    })
  })

  assert.match(
    observed.capturedPrompt,
    /Selected-context retrieval from local memory core/
  )
  assert.match(observed.capturedPrompt, /Owner confirmed that the intro call already happened/)
  assert.match(observed.capturedPrompt, /Need a tighter 90-day plan story/)
  assert.doesNotMatch(observed.capturedPrompt, /This unrelated investor summary must stay out/)
})

test('analyzeRecentTranscript adds abstain hint when selected-context retrieval is weak', async () => {
  const observed = {
    capturedPrompt: ''
  }

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:weak-retrieval-target',
              partnerName: 'Northfield Labs',
              title: 'AI Product Lead',
              summary: 'Selected target for product-fit discussion.'
            }
          ])

        const keepPack = importResult.manifest.counterpartyPacks[0]

        await services.sessionSummaryService.saveSessionSummary({
          sourceId: 'finder:job:weak-retrieval-target',
          partnerName: 'Northfield Labs',
          title: 'AI Product Lead',
          summary: 'Owner confirmed previous intro and product-fit discussion.',
          confirmedOutcomes: ['Need a stronger 90-day story'],
          followUps: ['Prepare workflow transformation follow-up'],
          selectedCounterpartyPackIds: keepPack ? [keepPack.id] : []
        })

        await services.sessionContextService.saveSessionContext({
          company: 'Northfield Labs',
          role: 'AI Product Lead',
          context: 'Selected target summary continuity',
          goal: 'Use only the selected target history.',
          notes: '',
          selectedCounterpartyPackIds: keepPack ? [keepPack.id] : [],
          selectedFinderOutreachDraftId: ''
        })
      },
      requestOverrides: async (services) => {
        const session = await services.sessionContextService.getSessionContext()
        return {
          ...makeRequest({
            transcriptText:
              'Can you explain your Mediterranean grain fund ticket assumptions?'
          }),
          sessionContext: session.context,
          selectedCounterpartyPackIds: session.context.selectedCounterpartyPackIds
        }
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Нужно нейтрально ответить или уточнить.',
              detectedQuestion: 'What are your fund ticket assumptions?',
              intent: 'out of scope continuity',
              risk: 'medium',
              suggestedAnswers: [],
              keywordsToRemember: ['clarify', 'neutral'],
              openingPhrase: 'Let me clarify that.'
            })
          }
        })
      }
    })
  })

  assert.match(
    observed.capturedPrompt,
    /no sufficiently strong selected-context retrieval matched this utterance/i
  )
  assert.doesNotMatch(
    observed.capturedPrompt,
    /Selected-context retrieval from local memory core/
  )
})

test('analyzeRecentTranscript prunes stale selected outreach draft from persisted session while keeping selected pack audit', async () => {
  const observed = {
    capturedPrompt: '',
    capturedSelectedPackIds: undefined,
    requestContext: null
  }

  let preparedPacks = []
  const staleDraftId = 'finder:draft:payload-audit-stale'

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:payload-audit-keep-2',
              partnerName: 'Stale Draft Co',
              title: 'Interview lead v2',
              summary: 'Included pack for stale draft check.'
            },
            {
              kind: 'partner',
              sourceId: 'finder:partner:payload-audit-drop-2',
              partnerName: 'Stale Draft Blocked',
              title: 'Dropped pack',
              summary: 'Must stay out of assistant payload.',
              selected: false
            }
          ])

        preparedPacks = importResult.manifest.counterpartyPacks

        const keepPack = preparedPacks.find(
          (pack) => pack.sourceId === 'finder:job:payload-audit-keep-2'
        )

        const dropPack = preparedPacks.find(
          (pack) => pack.sourceId === 'finder:partner:payload-audit-drop-2'
        )

        const selectedCounterpartyPackIds = [
          keepPack?.id,
          dropPack?.id
        ].filter(Boolean)

        await services.sessionContextService.saveSessionContext({
          company: 'PayloadAudit Corp',
          role: 'Senior Product Lead',
          context: 'Stale draft audit check',
          goal: 'Prompt should reflect inspector dropped draft.',
          notes: 'No missing draft content should leak.',
          selectedCounterpartyPackIds,
          selectedFinderOutreachDraftId: staleDraftId
        })

        const reloadedSession = await services.sessionContextService.getSessionContext()
        observed.requestContext = reloadedSession.context
      },
      requestOverrides: () => ({
        ...makeRequest({
          transcriptText:
            'I am interested in the Interview lead v2 role at Stale Draft Co and would like to discuss the next steps.'
        }),
        sessionContext: observed.requestContext,
        selectedCounterpartyPackIds:
          observed.requestContext?.selectedCounterpartyPackIds ?? []
      }),
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.capturedSelectedPackIds = [...selectedCounterpartyPackIds]
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Сценарий со stale draft прошёл.',
              detectedQuestion: 'Is the draft still available?',
              intent: 'draft freshness check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I will continue without stale draft context.',
                  answerMeaningRu: 'Буду продолжать без просроченного черновика.'
                }
              ],
              keywordsToRemember: ['stale', 'draft'],
              openingPhrase: 'OK.'
            })
          }
        })
      },
      onAnalyzeRequest: () => undefined
    })
  })

  const inspector = buildSessionPayloadInspector({
    context: observed.requestContext,
    availablePacks: preparedPacks,
    availableOutreachDrafts: [],
    includeProfileContext: false,
    profileChars: 0
  })

  assert.equal(observed.requestContext.selectedFinderOutreachDraftId, '')
  assert.equal(inspector.includedOutreachDraft, null)
  assert.equal(inspector.droppedOutreachDraft, null)

  assert.equal(inspector.includedPacks.map((pack) => pack.id).length, 1)
  assert.equal(inspector.droppedPacks.map((pack) => pack.id).length, 0)

  assert.equal(
    observed.capturedPrompt.includes('finder:job:payload-audit-keep-2'),
    true
  )
  assert.equal(
    observed.capturedPrompt.includes('finder:partner:payload-audit-drop-2'),
    false
  )

  assert.equal(
    observed.capturedPrompt.includes('Selected outreach draft for this counterpart'),
    false
  )

  assert.equal(
    observed.capturedSelectedPackIds?.length,
    inspector.includedPacks.length,
    'retrieval ids should match inspector-included pack count'
  )
  assert.deepEqual(
    observed.capturedSelectedPackIds,
    inspector.includedPacks.map((pack) => pack.id)
  )
})

test('analyzeRecentTranscript drops rejected selected outreach draft and keeps prompt aligned with payload audit', async () => {
  const observed = {
    capturedPrompt: '',
    capturedSelectedPackIds: undefined,
    requestContext: null
  }

  let preparedPacks = []
  let preparedDraft = null
  let preparedResult = null

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:payload-audit-keep-3',
              partnerName: 'Rejected Draft Co',
              title: 'Interview lead v3',
              summary: 'Included pack for rejected draft check.'
            }
          ])

        preparedPacks = importResult.manifest.counterpartyPacks
        const selectedPackIds = preparedPacks.map((pack) => pack.id)

        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'Rejected draft audit job',
          query: 'senior product lead france'
        })
        const job = afterJob.store.jobs[0]
        const afterCandidate =
          await services.finderSearchService.addFinderCandidateResult(job.id, {
            sourceId: 'finder:job:payload-audit-rejected-draft',
            partnerName: 'Rejected Draft Co',
            title: 'Interview lead v3',
            summary: 'Source for rejected outreach draft',
            fitScore: 82,
            whyRelevant: 'Context-ready draft before rejection',
            missingInfo: 'Nothing critical',
            nextAction: 'This should be dropped after rejection.'
          })

        preparedResult = afterCandidate.store.results[0]
        const afterDraft = await services.finderSearchService.saveFinderOutreachDraft(
          preparedResult.id
        )

        preparedDraft = afterDraft.store.outreachDrafts[0]
        await services.finderSearchService.setFinderCandidateResultDecision(
          preparedResult.id,
          'rejected',
          'owner rejected candidate'
        )

        observed.requestContext = {
          company: 'Rejected Draft Co',
          role: 'Interview lead v3',
          context: 'Rejected draft payload audit check',
          goal: 'Rejected selected draft must not reach assistant prompt.',
          notes: 'Keep selected pack, drop rejected draft.',
          selectedCounterpartyPackIds: selectedPackIds,
          selectedFinderOutreachDraftId: preparedDraft.id
        }
      },
      requestOverrides: () => ({
        ...makeRequest({
          transcriptText:
            'I would like to continue the conversation about the Interview lead v3 role.'
        }),
        sessionContext: observed.requestContext,
        selectedCounterpartyPackIds:
          observed.requestContext?.selectedCounterpartyPackIds ?? []
      }),
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.capturedSelectedPackIds = [...selectedCounterpartyPackIds]
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Сценарий с rejected draft прошёл.',
              detectedQuestion: 'Should rejected draft stay active?',
              intent: 'draft rejection check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I will continue without the rejected draft.',
                  answerMeaningRu: 'Я продолжу без отклоненного черновика.'
                }
              ],
              keywordsToRemember: ['rejected', 'draft'],
              openingPhrase: 'Understood.'
            })
          }
        })
      },
      onAnalyzeRequest: () => undefined
    })
  })

  const inspector = buildSessionPayloadInspector({
    context: observed.requestContext,
    availablePacks: preparedPacks,
    availableFinderResults: preparedResult ? [{ ...preparedResult, status: 'rejected', decision: { state: 'rejected', reason: 'owner rejected candidate', updatedAt: '2026-07-28T12:00:00.000Z' } }] : [],
    availableOutreachDrafts: preparedDraft ? [preparedDraft] : [],
    includeProfileContext: false,
    profileChars: 0
  })

  assert.equal(inspector.includedOutreachDraft, null)
  assert.equal(inspector.droppedOutreachDraft?.handoffState, 'blocked')
  assert.match(inspector.droppedOutreachDraft?.reason ?? '', /rejected target/i)
  assert.equal(
    observed.capturedPrompt.includes('Selected outreach draft for this counterpart'),
    false
  )
  assert.equal(
    observed.capturedPrompt.includes('Opening message already drafted:'),
    false
  )
  assert.deepEqual(
    observed.capturedSelectedPackIds,
    inspector.includedPacks.map((pack) => pack.id)
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

test('analyzeRecentTranscript includes selected outreach draft from persisted session', async () => {
  let capturedPrompt = ''

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'France product roles',
          query: 'senior product manager france agtech'
        })
        const job = afterJob.store.jobs[0]
        const afterCandidate =
          await services.finderSearchService.addFinderCandidateResult(job.id, {
            sourceId: 'finder:job:selected-draft-001',
            partnerName: 'Northfield Labs',
            title: 'AI Product Lead',
            summary: 'Product leadership role with AI workflow focus.',
            fitScore: 91,
            whyRelevant: 'Matches AI product leadership and France search.',
            missingInfo: 'Salary range',
            nextAction: 'Use this outreach version before the call.'
          })
        const candidate = afterCandidate.store.results[0]
        const afterDraft =
          await services.finderSearchService.saveFinderOutreachDraft(candidate.id)
        const draft = afterDraft.store.outreachDrafts[0]

        await services.sessionContextService.saveSessionContext({
          company: 'Northfield Labs',
          role: 'AI Product Lead',
          context: 'Interview after outreach.',
          goal: 'Stay consistent with the prepared outreach.',
          notes: 'Do not invent details.',
          selectedCounterpartyPackIds: [],
          selectedFinderOutreachDraftId: draft.id
        })
      },
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Выбранный outreach draft добавлен в контекст.',
              detectedQuestion: 'What outreach context is active?',
              intent: 'draft context check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I prepared a focused intro for this role and can stay consistent with it.',
                  answerMeaningRu: 'Я подготовил точное вступление под эту роль и могу держать его линию.'
                }
              ],
              keywordsToRemember: ['prepared intro', 'consistent'],
              openingPhrase: 'Thanks.'
            })
          }
        })
      }
    })
  })

  assert.match(capturedPrompt, /Selected outreach draft for this counterpart/)
  assert.match(capturedPrompt, /Northfield Labs/)
  assert.match(capturedPrompt, /AI Product Lead/)
  assert.match(
    capturedPrompt,
    /Opening message already drafted: Hi Northfield Labs/
  )
  assert.match(capturedPrompt, /Use this outreach version before the call/)
})

test('analyzeRecentTranscript includes finder-imported selected pack from persisted session handoff', async () => {
  const observed = {
    capturedPrompt: '',
    retrievalSelectedCounterpartyPackIds: undefined
  }
  let expectedSelectedPackIds = []
  let expectedPackSourceId = ''

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'France product roles',
          query: 'senior product manager france agtech'
        })
        const job = afterJob.store.jobs[0]
        const afterCandidate =
          await services.finderSearchService.addFinderCandidateResult(job.id, {
            sourceId: 'finder:job:handoff-001',
            partnerName: 'Northfield Labs',
            title: 'Senior Product Lead',
            summary: 'Interview candidate sourced from Finder job.',
            links: ['https://example.com/jobs/northfield-product-lead'],
            fitScore: 88,
            whyRelevant: 'Strong overlap with product leadership and AI workflows.',
            missingInfo: 'Need compensation range.',
            nextAction: 'Prepare tailored interview story.'
          })

        const candidate = afterCandidate.store.results[0]
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            createContextPackDraftFromFinderResult(candidate)
          ])
        const importedPack = importResult.manifest.counterpartyPacks[0]
        expectedSelectedPackIds = importedPack ? [importedPack.id] : []
        expectedPackSourceId = importedPack?.sourceId ?? ''

        await services.sessionContextService.saveSessionContext({
          company: candidate.partnerName,
          role: candidate.title,
          context: 'Finder to session handoff',
          goal: 'Use the imported Finder pack in the next assistant analysis.',
          notes: 'No manual pack id edits between import and analyze.',
          selectedCounterpartyPackIds: expectedSelectedPackIds
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
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        observed.capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Finder pack подключен в живой анализ.',
              detectedQuestion: 'Which imported context is active?',
              intent: 'finder handoff check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I prepared for this role using the selected company context.',
                  answerMeaningRu: 'Я подготовился к этой роли с выбранным контекстом компании.'
                }
              ],
              keywordsToRemember: ['selected context', 'role'],
              openingPhrase: 'Sure.'
            })
          }
        })
      }
    })
  })

  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    expectedSelectedPackIds
  )
  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /Senior Product Lead/)
  assert.match(observed.capturedPrompt, /Prepare tailored interview story/)
  assert.equal(
    observed.capturedPrompt.includes(expectedPackSourceId),
    true
  )
})

test('App-style finder import auto-selects session pack and analyze uses it without manual selected ids', async () => {
  const observed = {
    capturedPrompt: '',
    retrievalSelectedCounterpartyPackIds: undefined,
    savedSelectedCounterpartyPackIds: undefined,
    reloadedSelectedCounterpartyPackIds: undefined,
    finderCandidateStatus: undefined
  }
  let expectedSelectedPackIds = []
  let expectedPackSourceId = ''

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const afterJob = await services.finderSearchService.addFinderSearchJob({
          kind: 'job',
          label: 'France product roles',
          query: 'senior product manager france agtech'
        })
        const job = afterJob.store.jobs[0]
        const afterCandidate =
          await services.finderSearchService.addFinderCandidateResult(job.id, {
            sourceId: 'finder:job:app-path-001',
            partnerName: 'Northfield Labs',
            title: 'Senior Product Lead',
            summary: 'Interview candidate sourced from Finder job.',
            links: ['https://example.com/jobs/northfield-product-lead'],
            fitScore: 88,
            whyRelevant: 'Strong overlap with product leadership and AI workflows.',
            missingInfo: 'Need compensation range.',
            nextAction: 'Prepare tailored interview story.'
          })

        const candidate = afterCandidate.store.results[0]
        const finderDraft = createContextPackDraftFromFinderResult(candidate)
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            finderDraft
          ])
        const nextPacks = importResult.manifest.counterpartyPacks ?? []
        const importedPack = nextPacks[0]
        expectedSelectedPackIds = importedPack ? [importedPack.id] : []
        expectedPackSourceId = importedPack?.sourceId ?? ''

        const currentSession =
          (await services.sessionContextService.getSessionContext()).context
        const nextSession = getSessionContextWithImportedCounterpartyPacks(
          {
            ...currentSession,
            company: candidate.partnerName,
            role: candidate.title,
            context: 'Finder import handoff',
            goal: 'Use the imported Finder pack in the next assistant analysis.',
            notes: 'No manual selected pack edits after import.'
          },
          nextPacks,
          [finderDraft]
        )
        const saved =
          await services.sessionContextService.saveSessionContext(nextSession)
        observed.savedSelectedCounterpartyPackIds =
          saved.context.selectedCounterpartyPackIds

        const finderPayload =
          await services.finderSearchService.setFinderCandidateResultStatus(
            candidate.id,
            'imported'
          )
        observed.finderCandidateStatus = finderPayload.store.results[0]?.status

        const reloaded = await services.sessionContextService.getSessionContext()
        observed.reloadedSelectedCounterpartyPackIds =
          reloaded.context.selectedCounterpartyPackIds
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
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        observed.capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Finder import flow передал выбранный pack в live analyze.',
              detectedQuestion: 'Which selected context is active now?',
              intent: 'finder app path check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I prepared using the selected company context for this role.',
                  answerMeaningRu: 'Я подготовился по выбранному контексту компании для этой роли.'
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
  assert.equal(observed.finderCandidateStatus, 'imported')
  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /Senior Product Lead/)
  assert.match(observed.capturedPrompt, /Prepare tailored interview story/)
  assert.equal(
    observed.capturedPrompt.includes(expectedPackSourceId),
    true
  )
})

test('owner source fast-lane persists selected pack into prepare/live analyze without manual session edits', async () => {
  const observed = {
    capturedPrompt: '',
    retrievalSelectedCounterpartyPackIds: undefined,
    prepareSelectedPackLabel: '',
    prepareIncludedSourceId: ''
  }
  let expectedSelectedPackIds = []
  let expectedPackSourceId = ''

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
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
              'Why relevant: Product management role in French agtech market.'
            ].join('\n')
          )
        const ingress =
          await services.finderSessionIngressService.ingestFinderOwnerSourceCandidatesToSession(
            job.id,
            preview.candidates.map((candidate) => candidate.draft)
          )
        expectedSelectedPackIds =
          ingress.session.context.selectedCounterpartyPackIds
        expectedPackSourceId =
          ingress.manifest.counterpartyPacks?.[0]?.sourceId ?? ''

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
      requestOverrides: {
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      },
      onSelectedPackIds: (selectedPackIdsFromRetrieval) => {
        observed.retrievalSelectedCounterpartyPackIds = [
          ...(selectedPackIdsFromRetrieval ?? [])
        ]
      },
      fetchHandler: async (_url, init) => {
        const body = JSON.parse(init.body)
        observed.capturedPrompt = body.messages[1].content

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Owner source fast-lane передал выбранный pack в live analyze.',
              detectedQuestion: 'Which owner-source context is active now?',
              intent: 'owner source app path check',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I prepared for this role using the selected company context.',
                  answerMeaningRu: 'Я подготовился к этой роли с выбранным контекстом компании.'
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

  assert.deepEqual(
    observed.retrievalSelectedCounterpartyPackIds,
    expectedSelectedPackIds
  )
  assert.equal(
    observed.prepareSelectedPackLabel,
    'Northfield Labs · Senior Product Manager'
  )
  assert.equal(observed.prepareIncludedSourceId, expectedPackSourceId)
  assert.match(observed.capturedPrompt, /Northfield Labs/)
  assert.match(observed.capturedPrompt, /Senior Product Manager/)
  assert.match(observed.capturedPrompt, /French agtech market/)
  assert.equal(
    observed.capturedPrompt.includes(expectedPackSourceId),
    true
  )
})

test('analyzeRecentTranscript drops disabled selected finder pack and stays aligned with UI audit surface', async () => {
  const observed = {
    capturedPrompt: '',
    capturedSelectedPackIds: undefined,
    restoredSession: null
  }
  let disabledPack = null
  let uiSurface = null

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:disabled-after-selected-001',
              partnerName: 'Northfield Labs',
              title: 'Senior Product Lead',
              summary: 'This pack will be selected, then disabled before analyze.'
            }
          ])

        const importedPack = importResult.manifest.counterpartyPacks[0]
        disabledPack = importedPack

        await services.sessionContextService.saveSessionContext({
          company: 'Northfield Labs',
          role: 'Senior Product Lead',
          context: 'Finder import handoff',
          goal: 'Check disabled pack does not reach assistant payload.',
          notes: 'UI should still show why the pack was dropped.',
          selectedCounterpartyPackIds: importedPack ? [importedPack.id] : []
        })

        const disabledManifest =
          await services.contextSourceService.setCounterpartyContextPackSelected(
            importedPack.id,
            false
          )
        const disabledPacks = disabledManifest.manifest.counterpartyPacks ?? []
        const restoredSession = await services.sessionContextService.getSessionContext()
        observed.restoredSession = restoredSession

        uiSurface = buildSessionSelectionSurface({
          activeContext: restoredSession.context,
          draftContext: restoredSession.context,
          availablePacks: disabledPacks,
          activeAuditedDroppedPacks: buildSessionPayloadInspector({
            context: restoredSession.persistedContext,
            availablePacks: disabledPacks,
            includeProfileContext: false,
            profileChars: 0
          }).droppedPacks,
          draftAuditedDroppedPacks: buildSessionPayloadInspector({
            context: restoredSession.persistedContext,
            availablePacks: disabledPacks,
            includeProfileContext: false,
            profileChars: 0
          }).droppedPacks,
          includeProfileContext: false,
          profileChars: 0
        })
      },
      requestOverrides: () => ({
        ...makeRequest({
          transcriptText:
            'I am interested in the Senior Product Lead role at Northfield Labs and would like to discuss the next steps.'
        }),
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      }),
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.capturedSelectedPackIds = [...selectedCounterpartyPackIds]
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Отключенный pack исключён из запроса.',
              detectedQuestion: 'Will the disabled context still be used?',
              intent: 'disabled pack audit',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I will continue without the disabled context pack.',
                  answerMeaningRu: 'Продолжу без отключённого context pack.'
                }
              ],
              keywordsToRemember: ['disabled', 'context'],
              openingPhrase: 'OK.'
            })
          }
        })
      }
    })
  })

  assert.deepEqual(observed.restoredSession.context.selectedCounterpartyPackIds, [])
  assert.deepEqual(
    observed.restoredSession.persistedContext.selectedCounterpartyPackIds,
    [disabledPack.id]
  )
  assert.deepEqual(observed.capturedSelectedPackIds, [])
  assert.equal(uiSurface.activePackSummary.state, 'dropped')
  assert.equal(
    uiSurface.activePackSummary.label,
    'Dropped: Northfield Labs · Senior Product Lead'
  )
  assert.equal(
    uiSurface.activePrepPreview.selectedPackQualityLabel,
    'dropped from assistant payload'
  )
  assert.deepEqual(
    uiSurface.activePayloadInspector.droppedPacks.map((pack) => pack.id),
    [disabledPack.id]
  )
  assert.match(
    uiSurface.activePayloadInspector.droppedPacks[0].reason,
    /not selected/
  )
  assert.equal(
    observed.capturedPrompt.includes('finder:job:disabled-after-selected-001'),
    false
  )
  assert.equal(
    observed.capturedPrompt.includes(disabledPack.id),
    false
  )
})

test('analyzeRecentTranscript drops removed selected finder pack and stays aligned with UI audit surface', async () => {
  const observed = {
    capturedPrompt: '',
    capturedSelectedPackIds: undefined,
    restoredSession: null
  }
  let removedPack = null
  let uiSurface = null

  await withLocalKnowledgeWorkspace(async () => {
    await withStubbedProviderRoute({
      profileCount: 1,
      beforeAnalyze: async (services) => {
        const importResult =
          await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts([
            {
              kind: 'job',
              sourceId: 'finder:job:removed-after-selected-001',
              partnerName: 'Northfield Labs',
              title: 'Senior Product Lead',
              summary: 'This pack will be selected, then removed before analyze.'
            }
          ])

        const importedPack = importResult.manifest.counterpartyPacks[0]
        removedPack = importedPack

        await services.sessionContextService.saveSessionContext({
          company: 'Northfield Labs',
          role: 'Senior Product Lead',
          context: 'Finder import handoff',
          goal: 'Check removed pack does not reach assistant payload.',
          notes: 'UI should still show the removed pack as dropped.',
          selectedCounterpartyPackIds: importedPack ? [importedPack.id] : []
        })

        await services.contextSourceService.removeCounterpartyContextPack(
          importedPack.id
        )
        const removedPacks = []
        const restoredSession = await services.sessionContextService.getSessionContext()
        observed.restoredSession = restoredSession

        uiSurface = buildSessionSelectionSurface({
          activeContext: restoredSession.context,
          draftContext: restoredSession.context,
          availablePacks: removedPacks,
          activeAuditedDroppedPacks: buildSessionPayloadInspector({
            context: restoredSession.persistedContext,
            availablePacks: removedPacks,
            includeProfileContext: false,
            profileChars: 0
          }).droppedPacks,
          draftAuditedDroppedPacks: buildSessionPayloadInspector({
            context: restoredSession.persistedContext,
            availablePacks: removedPacks,
            includeProfileContext: false,
            profileChars: 0
          }).droppedPacks,
          includeProfileContext: false,
          profileChars: 0
        })
      },
      requestOverrides: () => ({
        ...makeRequest({
          transcriptText:
            'I am interested in the Senior Product Lead role at Northfield Labs and would like to discuss the next steps.'
        }),
        sessionContext: undefined,
        selectedCounterpartyPackIds: undefined
      }),
      onSelectedPackIds: (selectedCounterpartyPackIds) => {
        observed.capturedSelectedPackIds = [...selectedCounterpartyPackIds]
      },
      fetchHandler: async (_url, init) => {
        const body = init.body ? JSON.parse(init.body) : {}
        observed.capturedPrompt = body?.messages?.[1]?.content || ''

        return makeOllamaResponse({
          message: {
            content: JSON.stringify({
              meaningRu: 'Удалённый pack исключён из запроса.',
              detectedQuestion: 'Will the removed context still be used?',
              intent: 'removed pack audit',
              risk: 'low',
              suggestedAnswers: [
                {
                  label: 'short',
                  text: 'I will continue without the removed context pack.',
                  answerMeaningRu: 'Продолжу без удалённого context pack.'
                }
              ],
              keywordsToRemember: ['removed', 'context'],
              openingPhrase: 'OK.'
            })
          }
        })
      }
    })
  })

  assert.deepEqual(observed.restoredSession.context.selectedCounterpartyPackIds, [])
  assert.deepEqual(
    observed.restoredSession.persistedContext.selectedCounterpartyPackIds,
    [removedPack.id]
  )
  assert.deepEqual(observed.capturedSelectedPackIds, [])
  assert.equal(uiSurface.activePackSummary.state, 'dropped')
  assert.equal(
    uiSurface.activePackSummary.label,
    `Dropped: ${removedPack.id}`
  )
  assert.equal(
    uiSurface.activePrepPreview.selectedPackLabel,
    removedPack.id
  )
  assert.deepEqual(
    uiSurface.activePayloadInspector.droppedPacks.map((pack) => pack.id),
    [removedPack.id]
  )
  assert.match(
    uiSurface.activePayloadInspector.droppedPacks[0].reason,
    /missing/
  )
  assert.equal(
    observed.capturedPrompt.includes('finder:job:removed-after-selected-001'),
    false
  )
  assert.equal(
    observed.capturedPrompt.includes(removedPack.id),
    false
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

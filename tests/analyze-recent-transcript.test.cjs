const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')

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
    const profileService = require('../dist-electron/backend/services/profile-service.js')
    const secretStorageService = require('../dist-electron/backend/services/secret-storage-service.js')
    const governanceService = require('../dist-electron/backend/services/governance-service.js')

    return await run({
      assistantService,
      assistantProviderProfile,
      contextSourceService,
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
  onRetrievalCall,
  onSelectedPackIds
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
      () => {
        global.fetch = fetchHandler
        return services.assistantService.analyzeRecentTranscript(
          makeRequest(requestOverrides)
        )
      }
    )
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

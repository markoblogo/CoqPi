const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const {
  validateAssistantOutputQuality
} = require('../dist-electron/shared/assistant-output-quality.js')

const mockElectron = {
  app: {
    getPath: () => path.join(os.tmpdir(), 'coqpi-output-quality-userdata')
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

const withLocalKnowledgeWorkspace = async (run) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'coqpi-output-quality-')
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

const makeOllamaResponse = (payload) => ({
  ok: true,
  text: async () => JSON.stringify(payload),
  json: async () => payload
})

const createProviderProfiles = () => [
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

const fixtures = [
  {
    name: 'English job interview answer stays concise and selected-pack scoped',
    request: {
      transcriptText:
        'Could you walk me through your product management experience for this AI transformation role?',
      callLanguage: 'en',
      answerLanguage: 'en',
      mode: 'full',
      includeProfileContext: false,
      recentWindowLabel: '30s',
      costMode: 'balanced',
      retrievalKinds: ['job']
    },
    selectedPack: {
      kind: 'job',
      sourceId: 'finder:job:quality-northfield',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary:
        'Northfield Labs needs AI transformation and product discovery leadership.',
      context:
        'The owner sent a focused CV for AI product leadership, discovery, GTM and workflow transformation.',
      links: ['https://example.com/northfield-ai-product']
    },
    unselectedPack: {
      kind: 'investor',
      sourceId: 'finder:investor:quality-cobalt',
      partnerName: 'Cobalt Seed Fund',
      title: 'Agri investor',
      summary: 'Cobalt Seed Fund is unrelated to this job interview.',
      context: 'This investor context must stay outside the job interview answer.',
      links: ['https://example.com/cobalt']
    },
    requiredTerms: ['Northfield'],
    forbiddenTerms: ['Cobalt'],
    response: {
      meaningRu:
        'Собеседник просит коротко объяснить опыт в product management для AI transformation роли.',
      detectedQuestion:
        'Could you summarize your product management experience for this AI transformation role?',
      intent: 'Check fit for the Northfield Labs AI Product Lead role.',
      risk: 'Do not overclaim metrics or titles.',
      suggestedAnswers: [
        {
          label: 'short',
          text:
            'I have led product discovery, GTM and workflow transformation, and I can connect business goals with AI delivery at Northfield Labs.',
          answerMeaningRu:
            'Я связываю бизнес-цели, продуктовую работу и AI delivery для этой роли.'
        },
        {
          label: 'strong',
          text:
            'My strength is turning complex domains into clear product priorities, then aligning teams around delivery and measurable adoption.',
          answerMeaningRu:
            'Моя сила — превращать сложные домены в ясные продуктовые приоритеты.'
        }
      ],
      keywordsToRemember: ['discovery', 'workflow', 'adoption'],
      openingPhrase: 'Sure, I can give you the short version.'
    }
  },
  {
    name: 'French investor answer remains speakable and selected-pack scoped',
    request: {
      transcriptText:
        'Pouvez-vous expliquer pourquoi votre écosystème agro-commodities est intéressant pour un accélérateur?',
      callLanguage: 'fr',
      answerLanguage: 'fr',
      mode: 'full',
      includeProfileContext: false,
      recentWindowLabel: '30s',
      costMode: 'balanced',
      retrievalKinds: ['investor', 'accelerator']
    },
    selectedPack: {
      kind: 'accelerator',
      sourceId: 'finder:accelerator:quality-greenbridge',
      partnerName: 'GreenBridge Accelerator',
      title: 'Agro-commodities program',
      summary:
        'GreenBridge Accelerator supports pilots in agriculture, logistics and commodity workflows.',
      context:
        'The owner prepared a concise pitch focused on ecosystem orchestration, traceability and partner pilots.',
      links: ['https://example.com/greenbridge']
    },
    unselectedPack: {
      kind: 'job',
      sourceId: 'finder:job:quality-alpine',
      partnerName: 'Alpine Retail',
      title: 'Product Owner job',
      summary: 'Alpine Retail job context is unrelated to the investor call.',
      context: 'This job pack must not appear in the accelerator answer.',
      links: ['https://example.com/alpine-job']
    },
    requiredTerms: ['GreenBridge'],
    forbiddenTerms: ['Alpine'],
    response: {
      meaningRu:
        'Собеседник просит объяснить ценность agro-commodities экосистемы для акселератора.',
      detectedQuestion:
        'Pourquoi ce projet est-il pertinent pour un accélérateur agro-commodities?',
      intent:
        'Tester la clarté du positionnement pour GreenBridge Accelerator.',
      risk: 'Ne pas promettre traction, revenus ou partenariats non confirmés.',
      suggestedAnswers: [
        {
          label: 'short',
          text:
            'Pour GreenBridge, l’intérêt est de transformer un marché fragmenté en un pilote clair avec des partenaires et des données utiles.',
          answerMeaningRu:
            'Для GreenBridge ценность в понятном пилоте на фрагментированном рынке.'
        },
        {
          label: 'strong',
          text:
            'Je peux apporter une vision produit, une logique de go-to-market et une approche très concrète des workflows agro-commodities.',
          answerMeaningRu:
            'Я могу дать продуктовую логику, GTM и практичный подход к workflow.'
        },
        {
          label: 'clarifying',
          text:
            'Quel type de pilote serait le plus intéressant pour votre programme: données, partenaires ou opérations?',
          answerMeaningRu:
            'Я уточняю, какой пилот для них важнее: данные, партнёры или операции.'
        }
      ],
      keywordsToRemember: ['pilote', 'partenaires', 'données'],
      openingPhrase: 'Oui, bien sûr.'
    }
  }
]

test('assistant output quality fixtures pass through analyzeRecentTranscript', async () => {
  await withLocalKnowledgeWorkspace(async () => {
    await withElectronMock(async (services) => {
      const previousProviderProfile = process.env.COQPI_ASSISTANT_PROVIDER_PROFILE
      const previousOllamaBaseUrl = process.env.OLLAMA_BASE_URL

      process.env.COQPI_ASSISTANT_PROVIDER_PROFILE = 'ollama:0'
      process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

      try {
        await withPatchedModules(
          [
            [
              services.assistantProviderProfile,
              'getOrderedEnabledProviderProfiles',
              createProviderProfiles
            ],
            [services.profileService, 'getProfileContext', async () => ({ content: '' })],
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
            for (const fixture of fixtures) {
              const imported =
                await services.contextSourceService.ingestCounterpartyFinderPayloadDrafts(
                  [fixture.selectedPack, fixture.unselectedPack]
                )
              const selected = imported.manifest.counterpartyPacks.find(
                (pack) => pack.sourceId === fixture.selectedPack.sourceId
              )

              assert.ok(selected, `selected pack missing for ${fixture.name}`)

              global.fetch = async (_url, options) => {
                const body = JSON.parse(options.body)
                const prompt = body.messages[1].content

                assert.match(prompt, /Personal Knowledge Core retrieval/)
                assert.match(prompt, new RegExp(fixture.requiredTerms[0], 'i'))
                assert.doesNotMatch(
                  prompt,
                  new RegExp(fixture.forbiddenTerms[0], 'i')
                )

                return makeOllamaResponse({
                  message: {
                    content: JSON.stringify(fixture.response)
                  }
                })
              }

              const result =
                await services.assistantService.analyzeRecentTranscript({
                  ...fixture.request,
                  sessionContext: {
                    company: fixture.selectedPack.partnerName,
                    role: fixture.selectedPack.title,
                    context: fixture.selectedPack.summary,
                    goal: 'Keep the answer short, natural and specific.',
                    notes: 'Use only selected counterparty context.',
                    selectedCounterpartyPackIds: [selected.id]
                  },
                  selectedCounterpartyPackIds: [selected.id]
                })
              const issues = validateAssistantOutputQuality(result, {
                answerLanguage: fixture.request.answerLanguage,
                requiredTerms: fixture.requiredTerms,
                forbiddenTerms: fixture.forbiddenTerms
              })

              assert.deepEqual(issues, [], fixture.name)
            }
          }
        )
      } finally {
        if (previousProviderProfile === undefined) {
          delete process.env.COQPI_ASSISTANT_PROVIDER_PROFILE
        } else {
          process.env.COQPI_ASSISTANT_PROVIDER_PROFILE =
            previousProviderProfile
        }

        if (previousOllamaBaseUrl === undefined) {
          delete process.env.OLLAMA_BASE_URL
        } else {
          process.env.OLLAMA_BASE_URL = previousOllamaBaseUrl
        }
      }
    })
  })
})

test('assistant output quality flags verbose or wrong-boundary answers', () => {
  const issues = validateAssistantOutputQuality(
    {
      meaningRu: 'No Russian here',
      detectedQuestion: '',
      intent: 'test',
      risk: 'test',
      suggestedAnswers: [
        {
          label: 'short',
          text: 'Я отвечу на русском и упомяну Cobalt Seed Fund.',
          answerMeaningRu: 'Это русский смысл.'
        }
      ],
      keywordsToRemember: ['one'],
      openingPhrase: 'Ok.'
    },
    {
      answerLanguage: 'en',
      requiredTerms: ['Northfield'],
      forbiddenTerms: ['Cobalt']
    }
  )

  assert.equal(issues.some((issue) => issue.field === 'meaningRu'), true)
  assert.equal(
    issues.some((issue) => issue.field === 'suggestedAnswers'),
    true
  )
  assert.equal(issues.some((issue) => issue.field === 'context'), true)
})

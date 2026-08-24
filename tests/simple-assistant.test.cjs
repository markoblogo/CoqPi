const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const Module = require('node:module')

const {
  buildSimpleAssistantPrompt
} = require('../dist-electron/shared/simple-assistant.js')

const mockElectron = {
  app: {
    getPath: () => path.join(os.tmpdir(), 'coqpi-simple-assistant-userdata'),
    isPackaged: false
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
    return await run()
  } finally {
    Module._load = originalModuleLoad
  }
}

test('simple prompt contains only profile, scenario and transcript context', () => {
  const prompt = buildSimpleAssistantPrompt({
    transcriptText: 'Could you tell me about your experience?',
    profileMarkdown: 'Verified profile fact.',
    scenarioMarkdown: 'Interview guidance.',
    scenarioId: 'international-job-interview',
    callLanguage: 'en',
    answerLanguage: 'en',
    mode: 'full',
    recentWindowLabel: '30s'
  })

  assert.match(prompt, /Verified profile fact\./)
  assert.match(prompt, /Interview guidance\./)
  assert.match(prompt, /Could you tell me about your experience\?/)
  assert.doesNotMatch(prompt, /retrieval|handoff|counterparty pack|vector/i)
  assert.match(prompt, /exactly one suggested answer/)

  const longProfile = 'CORE-FACT '.repeat(1200)
  const longScenario = 'SCENARIO-RULE '.repeat(1200)
  const longPrompt = buildSimpleAssistantPrompt({
    transcriptText: 'What is your role?',
    profileMarkdown: longProfile,
    scenarioMarkdown: longScenario,
    scenarioId: 'france-job-interview',
    callLanguage: 'fr',
    answerLanguage: 'fr',
    mode: 'full',
    recentWindowLabel: 'full'
  })

  assert.match(longPrompt, /CORE-FACT CORE-FACT/)
  assert.match(longPrompt, /SCENARIO-RULE SCENARIO-RULE/)
})

test('training journal saves and reads a bounded session entry', async () => {
  await withElectronMock(async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'coqpi-training-')
    )
    const previousDataDir = process.env.COQPI_DATA_DIR
    process.env.COQPI_DATA_DIR = directory

    try {
      const {
        getTrainingSessions,
        saveTrainingSession
      } = require('../dist-electron/backend/services/training-session-service.js')
      const entry = {
        id: 'training-1',
        createdAt: '2026-08-24T10:00:00.000Z',
        scenarioId: 'international-job-interview',
        transcriptText: 'Tell me about yourself.',
        answerText: 'I build practical digital products.',
        answerMeaningRu: 'Я создаю практичные цифровые продукты.',
        feedback: 'true',
        mode: 'simple',
        sessionId: 'session-1',
        language: 'en',
        source: 'manual',
        speaker: 'other',
        latencyMs: 850,
        model: 'gpt-5.6-luna',
        promptVersion: 'simple-v1'
      }

      await saveTrainingSession(entry)
      const result = await getTrainingSessions()

      assert.deepEqual(result.sessions, [entry])
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.COQPI_DATA_DIR
      } else {
        process.env.COQPI_DATA_DIR = previousDataDir
      }
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})

test('France interview context loads the complete core then scenario documents', async () => {
  await withElectronMock(async () => {
    const previousDataDir = process.env.COQPI_DATA_DIR
    process.env.COQPI_DATA_DIR = 'data'

    try {
      const { getSimpleAssistantContext } = require('../dist-electron/backend/services/simple-assistant-context-service.js')
      const context = await getSimpleAssistantContext('france-job-interview')

      assert.match(context.profileMarkdown, /Anton Biletskyi-Volokh/)
      assert.match(context.profileMarkdown, /# RESPONSE RULES FOR LIVE COPILOT/)
      assert.match(context.scenarioMarkdown, /# France Interview/)
      assert.match(context.scenarioMarkdown, /# FINAL LIVE RULE/)
      assert.ok(context.profileMarkdown.length > 13000)
      assert.ok(context.scenarioMarkdown.length > 10000)
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.COQPI_DATA_DIR
      } else {
        process.env.COQPI_DATA_DIR = previousDataDir
      }
    }
  })
})

test('Art context loads core plus art only', async () => {
  await withElectronMock(async () => {
    const previousDataDir = process.env.COQPI_DATA_DIR
    process.env.COQPI_DATA_DIR = 'data'

    try {
      const { getSimpleAssistantContext } = require('../dist-electron/backend/services/simple-assistant-context-service.js')
      const context = await getSimpleAssistantContext('art')

      assert.match(context.profileMarkdown, /Anton Biletskyi-Volokh/)
      assert.match(context.scenarioMarkdown, /# Art \/ Nantes Art Ecosystem/)
      assert.match(context.scenarioMarkdown, /Default language: French/)
      assert.doesNotMatch(context.scenarioMarkdown, /# France Interview/)
      assert.ok(context.scenarioMarkdown.length > 10000)
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.COQPI_DATA_DIR
      } else {
        process.env.COQPI_DATA_DIR = previousDataDir
      }
    }
  })
})

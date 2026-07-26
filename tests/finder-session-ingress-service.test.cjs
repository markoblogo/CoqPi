const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-finder-session-userdata')
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(String(value)),
    decryptString: (value) => value.toString()
  }
}

const withWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-finder-session-'))
  const previousCoreDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const originalModuleLoad = Module._load

  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')
  process.env.COQPI_SESSIONS_DIR = path.join(directory, 'sessions')

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const finderSearchService = require('../dist-electron/backend/services/finder-search-service.js')
    const finderSessionIngressService = require('../dist-electron/backend/services/finder-session-ingress-service.js')
    const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
    const sessionContextService = require('../dist-electron/backend/services/session-context-service.js')

    await run({
      finderSearchService,
      finderSessionIngressService,
      contextSourceService,
      sessionContextService
    })
  } finally {
    Module._load = originalModuleLoad

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

test('finder session ingress imports owner source candidates into finder, context packs, and session selection', async () => {
  await withWorkspace(async (services) => {
    const afterJob = await services.finderSearchService.addFinderSearchJob({
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech',
      goal: 'Prepare interview context'
    })
    const job = afterJob.store.jobs[0]
    const drafts = [
      {
        sourceId: 'coqpi:source-adapter:job:france-product-roles:one',
        partnerName: 'Northfield Labs',
        title: 'Senior Product Manager',
        summary: 'Owner-provided vacancy snippet.',
        context:
          'Imported through owner_paste_v0.\nDetected source format: structured_fields.',
        links: ['https://northfield.example/careers'],
        fitScore: 88,
        whyRelevant: 'French agtech product role.',
        missingInfo: 'Verify salary range before outreach.',
        nextAction: 'Prepare interview pack.'
      }
    ]

    const payload =
      await services.finderSessionIngressService.ingestFinderOwnerSourceCandidatesToSession(
        job.id,
        drafts
      )
    const manifest = await services.contextSourceService.getContextSourceManifest()
    const session = await services.sessionContextService.getSessionContext()

    assert.equal(payload.importedCandidateCount, 1)
    assert.equal(payload.importedPackCount, 1)
    assert.equal(payload.store.results.length, 1)
    assert.equal(payload.store.results[0].status, 'imported')
    assert.equal(payload.manifest.counterpartyPacks.length, 1)
    assert.equal(
      payload.manifest.counterpartyPacks[0].sourceId,
      drafts[0].sourceId
    )
    assert.deepEqual(session.context.selectedCounterpartyPackIds, [
      payload.manifest.counterpartyPacks[0].id
    ])
    assert.deepEqual(manifest.manifest.counterpartyPacks.map((pack) => pack.id), [
      payload.manifest.counterpartyPacks[0].id
    ])
  })
})

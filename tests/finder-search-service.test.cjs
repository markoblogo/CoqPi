const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-finder-service-userdata')
  }
}

const withFinderWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-finder-service-'))
  const previousCoreDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const originalModuleLoad = Module._load

  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const service = require('../dist-electron/backend/services/finder-search-service.js')
    await run(service, directory)
  } finally {
    Module._load = originalModuleLoad

    if (previousCoreDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousCoreDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('finder search service persists jobs, candidates and status history', async () => {
  await withFinderWorkspace(async (service, directory) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech'
    })
    const job = afterJob.store.jobs[0]
    const afterCandidate = await service.addFinderCandidateResult(job.id, {
      sourceId: 'finder:job:northfield',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary: 'Product leadership role with AI workflow focus.',
      links: ['https://example.com/northfield'],
      fitScore: 86,
      whyRelevant: 'Good overlap with AI product leadership.',
      missingInfo: 'Need compensation and reporting line.',
      nextAction: 'Prepare tailored CV points.'
    })
    const result = afterCandidate.store.results[0]
    const afterImport = await service.setFinderCandidateResultStatus(
      result.id,
      'imported'
    )
    const reloaded = await service.getFinderSearchStore()
    const storedJob = reloaded.store.jobs.find((candidate) => candidate.id === job.id)
    const storedResult = reloaded.store.results.find(
      (candidate) => candidate.id === result.id
    )
    const eventsPath = path.join(
      directory,
      'core',
      'finder',
      'finder-search.events.jsonl'
    )
    const eventLines = (await fs.readFile(eventsPath, 'utf8'))
      .trim()
      .split('\n')

    assert.equal(afterImport.store.results[0].status, 'imported')
    assert.equal(storedJob.status, 'imported')
    assert.equal(storedResult.status, 'imported')
    assert.equal(storedJob.ownerId, 'owner')
    assert.match(storedJob.contentHash, /^[0-9a-f]{64}$/)
    assert.match(storedResult.provenance.locatorSha256, /^[0-9a-f]{64}$/)
    assert.equal(storedResult.fitScore, 86)
    assert.equal(storedResult.whyRelevant, 'Good overlap with AI product leadership.')
    assert.equal(storedResult.missingInfo, 'Need compensation and reporting line.')
    assert.equal(storedResult.nextAction, 'Prepare tailored CV points.')
    assert.equal(storedResult.statusHistory[0].status, 'imported')
    assert.ok(eventLines.length >= 4)
  })
})

test('finder search service ingests runner payload with append-only source truth', async () => {
  await withFinderWorkspace(async (service) => {
    const payload = JSON.stringify({
      job: {
        kind: 'investor',
        label: 'Agri seed funds',
        query: 'seed funds agri commodity ecosystem europe'
      },
      results: [
        {
          sourceId: 'finder:investor:green-seed',
          partnerName: 'Green Seed Capital',
          title: 'Climate/agri seed fund',
          summary: 'Seed investor focused on climate and agri infrastructure.',
          fitScore: 90,
          whyRelevant: 'Strong thesis match.',
          missingInfo: 'Need current fund stage.',
          nextAction: 'Check portfolio and partners.'
        },
        {
          sourceId: 'finder:investor:bad',
          partnerName: '',
          title: 'Broken',
          summary: 'Missing partner'
        }
      ]
    })
    const result = await service.ingestFinderRunnerPayload(payload)

    assert.equal(result.store.jobs.length, 1)
    assert.equal(result.store.jobs[0].status, 'ready')
    assert.equal(result.store.results.length, 1)
    assert.equal(result.store.results[0].kind, 'investor')
    assert.equal(result.store.results[0].fitScore, 90)
    assert.equal(result.store.results[0].nextAction, 'Check portfolio and partners.')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].index, 1)
  })
})

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

test('finder search service runs bounded manual mock job idempotently', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'Agri partners France',
      query: 'grain logistics partners france',
      goal: 'Prepare partner conversations',
      notes: 'Focus on practical pilots'
    })
    const job = afterJob.store.jobs[0]
    const firstRun = await service.runManualFinderSearchJob(job.id)
    const secondRun = await service.runManualFinderSearchJob(job.id)

    assert.equal(firstRun.store.jobs[0].status, 'ready')
    assert.equal(firstRun.store.results.length, 3)
    assert.equal(firstRun.finderRunSummary.mode, 'manual_mock')
    assert.equal(firstRun.finderRunSummary.generatedCount, 3)
    assert.equal(firstRun.finderRunSummary.skippedDuplicateCount, 0)
    assert.match(firstRun.finderRunSummary.reason, /no web search/)
    assert.equal(secondRun.store.results.length, 3)
    assert.equal(secondRun.finderRunSummary.generatedCount, 0)
    assert.equal(secondRun.finderRunSummary.skippedDuplicateCount, 3)
    assert.equal(
      secondRun.store.results[0].sourceId.startsWith(
        'coqpi:manual-runner:partner:'
      ),
      true
    )
  })
})

test('finder search service refuses to run rejected jobs', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'job',
      label: 'Rejected job search',
      query: 'irrelevant'
    })
    const job = afterJob.store.jobs[0]
    await service.setFinderSearchJobStatus(job.id, 'rejected')

    await assert.rejects(
      service.runManualFinderSearchJob(job.id),
      /Rejected finder jobs cannot be run/
    )
  })
})

test('finder search service ingests owner pasted source idempotently', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech'
    })
    const job = afterJob.store.jobs[0]
    const sourceText = [
      'https://example.com/jobs/product-lead',
      '',
      'Northfield Labs - AI Product Lead',
      'Product leadership role in France.',
      'https://northfield.example/careers'
    ].join('\n')
    const first = await service.ingestFinderOwnerPastedSource(job.id, sourceText)
    const second = await service.ingestFinderOwnerPastedSource(job.id, sourceText)

    assert.equal(first.store.jobs[0].status, 'ready')
    assert.equal(first.store.results.length, 2)
    assert.equal(first.finderSourceAdapterSummary.mode, 'owner_paste_v0')
    assert.equal(first.finderSourceAdapterSummary.requestedCount, 2)
    assert.equal(first.finderSourceAdapterSummary.generatedCount, 2)
    assert.equal(first.finderSourceAdapterSummary.skippedDuplicateCount, 0)
    assert.match(first.finderSourceAdapterSummary.reason, /No web fetch|no web fetch/i)
    assert.equal(second.store.results.length, 2)
    assert.equal(second.finderSourceAdapterSummary.generatedCount, 0)
    assert.equal(second.finderSourceAdapterSummary.skippedDuplicateCount, 2)
  })
})

test('finder search service rejects owner pasted source for rejected jobs', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'Rejected partner search',
      query: 'irrelevant'
    })
    const job = afterJob.store.jobs[0]
    await service.setFinderSearchJobStatus(job.id, 'rejected')

    await assert.rejects(
      service.ingestFinderOwnerPastedSource(
        job.id,
        'https://example.com/rejected'
      ),
      /Rejected finder jobs cannot ingest/
    )
  })
})

test('finder search service saves outreach draft handoff locally', async () => {
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
      fitScore: 91,
      whyRelevant: 'Matches AI product leadership and France search.',
      missingInfo: 'Salary range; Remote policy',
      nextAction: 'Prepare a focused intro before applying.'
    })
    const candidate = afterCandidate.store.results[0]
    const afterDraft = await service.saveFinderOutreachDraft(candidate.id)
    const draft = afterDraft.store.outreachDrafts[0]
    const reloaded = await service.getFinderSearchStore()
    const eventsPath = path.join(
      directory,
      'core',
      'finder',
      'finder-search.events.jsonl'
    )
    const eventLog = await fs.readFile(eventsPath, 'utf8')

    assert.equal(afterDraft.store.outreachDrafts.length, 1)
    assert.equal(draft.candidateResultId, candidate.id)
    assert.equal(draft.targetName, 'Northfield Labs')
    assert.equal(draft.status, 'draft')
    assert.match(draft.contentHash, /^[0-9a-f]{64}$/)
    assert.match(draft.provenance.locatorSha256, /^[0-9a-f]{64}$/)
    assert.match(draft.openingMessage, /I saw the AI Product Lead opportunity/)
    assert.equal(reloaded.store.outreachDrafts[0].id, draft.id)
    assert.match(eventLog, /outreach_draft_recorded/)
  })
})

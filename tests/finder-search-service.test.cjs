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

test('finder search service persists candidate decisions and reject reasons', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'France partners',
      query: 'agri partners france'
    })
    const job = afterJob.store.jobs[0]
    const afterCandidate = await service.addFinderCandidateResult(job.id, {
      sourceId: 'finder:partner:canal-market',
      partnerName: 'Canal Market',
      title: 'Regional partner',
      summary: 'Potentially useful regional partner.',
      fitScore: 71
    })
    const result = afterCandidate.store.results[0]
    const afterHold = await service.setFinderCandidateResultDecision(
      result.id,
      'hold_later'
    )
    const afterReject = await service.setFinderCandidateResultDecision(
      result.id,
      'rejected',
      'outside current outreach wave'
    )

    assert.equal(afterHold.store.results[0].decision.state, 'hold_later')
    assert.equal(afterHold.store.results[0].status, 'ready')
    assert.equal(afterReject.store.results[0].decision.state, 'rejected')
    assert.equal(
      afterReject.store.results[0].decision.reason,
      'outside current outreach wave'
    )
    assert.equal(afterReject.store.results[0].status, 'rejected')
    assert.equal(afterReject.store.results[0].statusHistory[0].status, 'rejected')
    assert.match(
      afterReject.store.results[0].statusHistory[0].reason,
      /outside current outreach wave/
    )
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

test('finder search service previews and imports reviewed owner source candidates', async () => {
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

    const preview = await service.previewFinderOwnerPastedSource(
      job.id,
      sourceText
    )
    const unchanged = await service.getFinderSearchStore()
    const reviewed = {
      ...preview.candidates[1].draft,
      partnerName: 'Northfield Labs Reviewed',
      title: 'Reviewed AI Product Lead',
      summary: 'Reviewed and selected from local owner-pasted source.'
    }
    const imported = await service.ingestFinderOwnerPastedSourceCandidates(
      job.id,
      [reviewed]
    )
    const secondPreview = await service.previewFinderOwnerPastedSource(
      job.id,
      sourceText
    )

    assert.equal(preview.requestedCount, 2)
    assert.equal(preview.validCount, 2)
    assert.equal(preview.duplicateCount, 0)
    assert.deepEqual(preview.detectedFormats, [
      { format: 'url', count: 1 },
      { format: 'linkedin_job', count: 1 }
    ])
    assert.equal(preview.candidates[0].detectedFormat, 'url')
    assert.equal(preview.candidates[1].detectedFormat, 'linkedin_job')
    assert.equal(unchanged.store.results.length, 0)
    assert.equal(imported.store.jobs[0].status, 'ready')
    assert.equal(imported.store.results.length, 1)
    assert.equal(imported.store.results[0].partnerName, 'Northfield Labs Reviewed')
    assert.equal(imported.store.results[0].title, 'Reviewed AI Product Lead')
    assert.equal(imported.finderSourceAdapterSummary.generatedCount, 1)
    assert.equal(secondPreview.duplicateCount, 1)
    assert.equal(
      secondPreview.candidates.filter((candidate) => candidate.duplicate).length,
      1
    )
  })
})

test('finder search service fetches one public page into preview and import candidates', async () => {
  await withFinderWorkspace(async (service) => {
    service.setFinderPublicPageFetcherForTests(async (url) => ({
      requestedUrl: url,
      finalUrl: 'https://fund.example/programs/agri-accelerator',
      title: 'Agri Accelerator Program',
      description: 'French accelerator for agri supply chain and climate founders.',
      heading: 'Agri Accelerator Program',
      excerpt:
        'Agri Accelerator Program supports founders with pilot access, mentors, and investor introductions in France.',
      contentType: 'text/html; charset=utf-8',
      fetchedAt: '2026-07-28T19:00:00.000Z'
    }))

    const afterJob = await service.addFinderSearchJob({
      kind: 'accelerator',
      label: 'France accelerators',
      query: 'accelerator agri france'
    })
    const job = afterJob.store.jobs[0]

    const preview = await service.previewFinderPublicPageSource(
      job.id,
      'https://fund.example/programs/agri-accelerator'
    )
    const imported = await service.ingestFinderPublicPageSourceCandidates(job.id, [
      preview.candidates[0].draft
    ])

    assert.equal(preview.mode, 'public_page_v1')
    assert.equal(preview.requestedCount, 1)
    assert.equal(preview.validCount, 1)
    assert.equal(preview.candidates[0].detectedFormat, 'public_page')
    assert.equal(preview.candidates[0].draft.links[0], preview.candidates[0].draft.links[0])
    assert.match(preview.candidates[0].draft.context, /Imported through public_page_v1/)
    assert.match(preview.reason, /explicit public URL/i)
    assert.equal(imported.store.results.length, 1)
    assert.equal(imported.finderSourceAdapterSummary.mode, 'public_page_v1')
    assert.match(imported.store.results[0].context, /public_page_v1/)

    service.setFinderPublicPageFetcherForTests(null)
  })
})

test('finder search service applies optional crawl4ai enrichment only for weak public page previews', async () => {
  await withFinderWorkspace(async (service) => {
    let crawl4aiCalls = 0

    service.setFinderPublicPageFetcherForTests(async (url) => ({
      requestedUrl: url,
      finalUrl: url,
      title: 'Blue River Labs',
      description: '',
      heading: 'Blue River Labs',
      excerpt: 'Independent climate and agri workflow company overview.',
      contentType: 'text/html; charset=utf-8',
      fetchedAt: '2026-07-28T19:15:00.000Z'
    }))
    service.setFinderMarkdownEnrichmentRunnerForTests(async (url) => {
      crawl4aiCalls += 1
      return [
        `Source URL: ${url}`,
        'Company: Blue River Labs',
        'Partner pilot for agri workflow automation',
        'Contact: partnerships@blueriver.example',
        'Why relevant: already working on French agri workflow pilots',
        'Next action: confirm the partnerships lead and propose a short intro call',
        'https://blueriver.example/partners'
      ].join('\n')
    })

    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'France agri partners',
      query: 'agri workflow partners france'
    })
    const job = afterJob.store.jobs[0]

    const preview = await service.previewFinderPublicPageSource(
      job.id,
      'https://blueriver.example/partners'
    )

    assert.equal(crawl4aiCalls, 1)
    assert.equal(preview.mode, 'public_page_v1')
    assert.match(preview.reason, /crawl4ai/i)
    assert.match(preview.candidates[0].draft.context, /crawl4ai_markdown_v1/i)
    assert.match(
      preview.candidates[0].draft.context,
      /partnerships@blueriver\.example/i
    )
    assert.match(
      preview.candidates[0].draft.whyRelevant,
      /French agri workflow pilots/i
    )

    service.setFinderMarkdownEnrichmentRunnerForTests(null)
    service.setFinderPublicPageFetcherForTests(null)
  })
})

test('finder search service skips crawl4ai enrichment when deterministic public page preview is already usable', async () => {
  await withFinderWorkspace(async (service) => {
    let crawl4aiCalls = 0

    service.setFinderPublicPageFetcherForTests(async (url) => ({
      requestedUrl: url,
      finalUrl: url,
      title: 'Agri Accelerator Program',
      description: 'French accelerator for agri supply chain and climate founders.',
      heading: 'Agri Accelerator Program',
      excerpt:
        'Agri Accelerator Program supports founders with pilot access, mentors, and investor introductions in France.',
      contentType: 'text/html; charset=utf-8',
      fetchedAt: '2026-07-28T19:20:00.000Z'
    }))
    service.setFinderMarkdownEnrichmentRunnerForTests(async () => {
      crawl4aiCalls += 1
      return 'Unexpected crawl4ai usage'
    })

    const afterJob = await service.addFinderSearchJob({
      kind: 'accelerator',
      label: 'France accelerators',
      query: 'accelerator agri france'
    })
    const job = afterJob.store.jobs[0]

    const preview = await service.previewFinderPublicPageSource(
      job.id,
      'https://fund.example/programs/agri-accelerator'
    )

    assert.equal(crawl4aiCalls, 0)
    assert.doesNotMatch(preview.reason, /crawl4ai/i)
    assert.doesNotMatch(preview.candidates[0].draft.context, /crawl4ai_markdown_v1/i)

    service.setFinderMarkdownEnrichmentRunnerForTests(null)
    service.setFinderPublicPageFetcherForTests(null)
  })
})

test('finder search service keeps deterministic public page preview when optional crawl4ai enrichment fails', async () => {
  await withFinderWorkspace(async (service) => {
    let crawl4aiCalls = 0

    service.setFinderPublicPageFetcherForTests(async (url) => ({
      requestedUrl: url,
      finalUrl: url,
      title: 'Blue River Labs',
      description: '',
      heading: 'Blue River Labs',
      excerpt: 'Independent climate and agri workflow company overview.',
      contentType: 'text/html; charset=utf-8',
      fetchedAt: '2026-07-28T19:30:00.000Z'
    }))
    service.setFinderMarkdownEnrichmentRunnerForTests(async () => {
      crawl4aiCalls += 1
      throw new Error('crawl4ai unavailable')
    })

    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'France agri partners',
      query: 'agri workflow partners france'
    })
    const job = afterJob.store.jobs[0]

    const preview = await service.previewFinderPublicPageSource(
      job.id,
      'https://blueriver.example/partners'
    )

    assert.equal(crawl4aiCalls, 1)
    assert.equal(preview.mode, 'public_page_v1')
    assert.doesNotMatch(preview.reason, /crawl4ai/i)
    assert.doesNotMatch(preview.candidates[0].draft.context, /crawl4ai_markdown_v1/i)

    service.setFinderMarkdownEnrichmentRunnerForTests(null)
    service.setFinderPublicPageFetcherForTests(null)
  })
})

test('finder search service supports supervised manual complex-page preview for a public URL', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'France agri partners',
      query: 'agri workflow partners france'
    })
    const job = afterJob.store.jobs[0]

    const preview = await service.previewFinderManualComplexPageSource(
      job.id,
      'https://blueriver.example/partners',
      [
        'Company: Blue River Labs',
        'Partner pilot for agri workflow automation',
        'Contact: partnerships@blueriver.example',
        'Why relevant: already working on French agri workflow pilots',
        'Next action: confirm the partnerships lead and propose a short intro call'
      ].join('\n')
    )

    assert.equal(preview.mode, 'manual_complex_page_v1')
    assert.equal(preview.requestedCount, 1)
    assert.equal(preview.validCount, 1)
    assert.match(preview.reason, /owner-reviewed page notes/i)
    assert.match(preview.candidates[0].draft.context, /manual_complex_page_v1/)
    assert.match(preview.candidates[0].draft.context, /Requested URL: https:\/\/blueriver\.example\/partners/)
    assert.match(preview.candidates[0].draft.context, /partnerships@blueriver\.example/)
    assert.deepEqual(preview.candidates[0].draft.links, [
      'https://blueriver.example/partners'
    ])
  })
})

test('finder search service rejects empty supervised manual complex-page preview input', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'France agri partners',
      query: 'agri workflow partners france'
    })
    const job = afterJob.store.jobs[0]

    await assert.rejects(
      service.previewFinderManualComplexPageSource(
        job.id,
        'https://blueriver.example/partners',
        '   '
      ),
      /reviewed page notes or markdown/i
    )
  })
})

test('finder search service rejects private or mixed public page URL input', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'job',
      label: 'France product roles',
      query: 'product roles france'
    })
    const job = afterJob.store.jobs[0]

    await assert.rejects(
      service.previewFinderPublicPageSource(job.id, 'http://localhost:3000/private'),
      /local-network URLs are not allowed/i
    )
    await assert.rejects(
      service.previewFinderPublicPageSource(
        job.id,
        'https://example.com/job\nextra pasted text'
      ),
      /exactly one URL/i
    )
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

test('finder search service updates outreach draft local contact pipeline state and history', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'partner',
      label: 'Outreach lane',
      query: 'agri partners france'
    })
    const job = afterJob.store.jobs[0]
    const afterCandidate = await service.addFinderCandidateResult(job.id, {
      sourceId: 'finder:partner:ready-state',
      partnerName: 'Ready State Partner',
      title: 'Regional partner',
      summary: 'Good outreach target.',
      fitScore: 79
    })
    const candidate = afterCandidate.store.results[0]
    const afterDraft = await service.saveFinderOutreachDraft(candidate.id)
    const draft = afterDraft.store.outreachDrafts[0]
    const markedReady = await service.setFinderOutreachDraftStatus(
      draft.id,
      'ready_for_contact'
    )
    const contacted = await service.setFinderOutreachDraftStatus(
      draft.id,
      'contacted'
    )
    const waiting = await service.setFinderOutreachDraftStatus(draft.id, 'waiting')
    const followUp = await service.setFinderOutreachDraftStatus(
      draft.id,
      'follow_up'
    )
    const closed = await service.setFinderOutreachDraftStatus(draft.id, 'closed')

    assert.equal(markedReady.store.outreachDrafts[0].status, 'ready_for_contact')
    assert.equal(contacted.store.outreachDrafts[0].status, 'contacted')
    assert.equal(waiting.store.outreachDrafts[0].status, 'waiting')
    assert.equal(followUp.store.outreachDrafts[0].status, 'follow_up')
    assert.equal(closed.store.outreachDrafts[0].status, 'closed')
    assert.equal(closed.store.outreachDrafts[0].statusHistory[0].status, 'closed')
    assert.equal(closed.store.outreachDrafts[0].statusHistory[1].status, 'follow_up')
    assert.equal(closed.store.outreachDrafts[0].statusHistory[2].status, 'waiting')
    assert.equal(closed.store.outreachDrafts[0].statusHistory[3].status, 'contacted')
    assert.equal(
      closed.store.outreachDrafts[0].statusHistory[4].status,
      'ready_for_contact'
    )
    assert.equal(closed.store.outreachDrafts[0].statusHistory[5].status, 'draft')
  })
})

test('finder search service does not duplicate outreach drafts for the same candidate', async () => {
  await withFinderWorkspace(async (service) => {
    const afterJob = await service.addFinderSearchJob({
      kind: 'investor',
      label: 'Investor queue',
      query: 'agri investors france'
    })
    const job = afterJob.store.jobs[0]
    const afterCandidate = await service.addFinderCandidateResult(job.id, {
      sourceId: 'finder:investor:one-draft-only',
      partnerName: 'One Draft Fund',
      title: 'Seed fund',
      summary: 'Promising investor.',
      fitScore: 83
    })
    const candidate = afterCandidate.store.results[0]
    const first = await service.saveFinderOutreachDraft(candidate.id)
    const second = await service.saveFinderOutreachDraft(candidate.id)

    assert.equal(first.store.outreachDrafts.length, 1)
    assert.equal(second.store.outreachDrafts.length, 1)
    assert.equal(
      second.store.outreachDrafts.filter(
        (draft) => draft.candidateResultId === candidate.id
      ).length,
      1
    )
  })
})

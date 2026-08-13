const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-opportunity-userdata')
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString('utf8')
  },
  shell: { openExternal: async () => {} }
}

const withWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-opportunity-'))
  const previous = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const originalLoad = Module._load
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')
  Module._load = (request, parent, isMain) =>
    request === 'electron' ? mockElectron : originalLoad(request, parent, isMain)

  try {
    const finder = require('../dist-electron/backend/services/finder-search-service.js')
    const opportunity = require('../dist-electron/backend/services/opportunity-service.js')
    await run({ finder, opportunity, directory })
  } finally {
    Module._load = originalLoad
    opportunityModuleReset()
    if (previous === undefined) delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    else process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previous
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const opportunityModuleReset = () => {
  const modulePath = path.resolve(
    __dirname,
    '../dist-electron/backend/services/opportunity-service.js'
  )
  delete require.cache[modulePath]
}

test('runs Greenhouse and Lever discovery, deduplicates and persists run history', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const created = await finder.addFinderSearchJob({
      kind: 'job',
      label: 'Product roles',
      query: 'product lead',
      goal: 'Find relevant roles'
    })
    const jobId = created.store.jobs[0].id
    await opportunity.configureOpportunityJob(jobId, {
      sourceAdapters: ['greenhouse', 'lever'],
      providerTargets: [
        { provider: 'greenhouse', target: 'acme' },
        { provider: 'lever', target: 'acme' }
      ],
      geography: ['France'],
      languages: ['en']
    })

    opportunity.setOpportunityFetchForTests(async (url) => {
      if (url.includes('greenhouse')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ jobs: [{ id: 10, title: 'Product Lead', absolute_url: 'https://jobs.example.com/10', location: { name: 'Paris' }, updated_at: '2026-08-12T10:00:00Z', content: 'Lead product work' }] })
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 'lever-20', text: 'Senior Product Lead', hostedUrl: 'https://jobs.example.com/20', categories: { location: 'Remote France' }, descriptionPlain: 'Build product systems', createdAt: Date.parse('2026-08-11T10:00:00Z') }]
      }
    })

    const result = await opportunity.runOpportunityDiscovery(jobId)
    const finderStore = await finder.getFinderSearchStore()

    assert.equal(result.status, 'succeeded')
    assert.equal(result.candidates.length, 2)
    assert.equal(result.providerCounts.greenhouse, 1)
    assert.equal(result.providerCounts.lever, 1)
    assert.equal(finderStore.store.results.length, 2)
    assert.equal((await opportunity.getOpportunityStore()).runs.length, 1)

    const repeated = await opportunity.runOpportunityDiscovery(jobId)
    const repeatedStore = await opportunity.getOpportunityStore()
    assert.equal(repeated.newCount, 0)
    assert.equal(repeated.changedCount, 0)
    assert.equal(repeated.unchangedCount, 2)
    assert.equal(repeatedStore.results.length, 2)
    assert.equal(repeatedStore.runs.length, 2)
    assert.ok(repeatedStore.results.every((item) => item.lastSeenAt >= item.firstSeenAt))
  })
})

test('provider failure produces partial run while preserving successful results', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const created = await finder.addFinderSearchJob({
      kind: 'job',
      label: 'Mixed providers',
      query: 'product manager'
    })
    const jobId = created.store.jobs[0].id
    await opportunity.configureOpportunityJob(jobId, {
      sourceAdapters: ['greenhouse', 'lever'],
      providerTargets: [
        { provider: 'greenhouse', target: 'good' },
        { provider: 'lever', target: 'broken' }
      ]
    })
    opportunity.setOpportunityFetchForTests(async (url) => {
      if (url.includes('lever')) throw new Error('network down')
      return { ok: true, status: 200, json: async () => ({ jobs: [{ id: 1, title: 'PM', absolute_url: 'https://example.com/pm', location: { name: 'Paris' }, content: 'Product role' }] }) }
    })

    const result = await opportunity.runOpportunityDiscovery(jobId)
    assert.equal(result.status, 'partial')
    assert.equal(result.candidates.length, 1)
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].provider, 'lever')
  })
})

test('refuses to configure a search job without a provider', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const created = await finder.addFinderSearchJob({
      kind: 'job',
      label: 'No provider',
      query: 'product manager'
    })
    await assert.rejects(
      opportunity.configureOpportunityJob(created.store.jobs[0].id, {
        sourceAdapters: []
      }),
      /at least one search provider/i
    )
  })
})

test('startup catch-up runs each due daily job at most once per local date', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const created = await finder.addFinderSearchJob({
      kind: 'accelerator',
      label: 'Accelerators',
      query: 'agtech accelerator'
    })
    const jobId = created.store.jobs[0].id
    await opportunity.configureOpportunityJob(jobId, {
      sourceAdapters: ['brave_web'],
      schedule: { enabled: true, cadence: 'daily', localHour: 9 }
    })
    opportunity.setBraveApiKeyForTests('test-key')
    opportunity.setOpportunityFetchForTests(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ web: { results: [] } })
    }))

    const now = new Date('2026-08-13T12:00:00.000Z')
    const first = await opportunity.runDueOpportunityJobs(now)
    const second = await opportunity.runDueOpportunityJobs(now)

    assert.equal(first.length, 1)
    assert.equal(second.length, 0)
  })
})

test('Gmail draft and send require an exact one-time batch approval', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const googleService = require('../dist-electron/backend/services/google-workspace-service.js')
    const sent = []
    googleService.setGoogleWorkspaceGatewayForTests({
      createDraft: async () => ({ draftId: 'gmail-draft-1', messageId: 'gmail-message-draft' }),
      sendDraft: async (draftId) => {
        sent.push(draftId)
        return { messageId: 'gmail-message-1', threadId: 'gmail-thread-1' }
      },
      getThread: async () => ({ id: 'gmail-thread-1', messages: [] }),
      createCalendarEvent: async () => ({ eventId: 'event-1' })
    })
    const created = await finder.addFinderSearchJob({ kind: 'job', label: 'Role', query: 'product' })
    const jobId = created.store.jobs[0].id
    await opportunity.configureOpportunityJob(jobId, { sourceAdapters: ['greenhouse'], providerTargets: [{ provider: 'greenhouse', target: 'acme' }] })
    opportunity.setOpportunityFetchForTests(async () => ({ ok: true, status: 200, json: async () => ({ jobs: [{ id: 1, title: 'Product Lead', absolute_url: 'https://example.com/job', content: 'Product opportunity' }] }) }))
    const discovery = await opportunity.runOpportunityDiscovery(jobId)
    const pack = await opportunity.assembleOpportunityApplicationPack({ candidateId: discovery.candidates[0].id, ownerFactsToUse: ['I have verified product leadership experience.'], ownerFactsToAvoid: [] })
    const localDraft = await opportunity.saveLocalMailDraft({ applicationPackId: pack.id, recipient: 'owner@example.com', subject: 'Product Lead', body: pack.motivationLetter })
    const gmailDraft = await googleService.createGmailDraft(localDraft.id)

    await assert.rejects(
      googleService.sendApprovedMailBatch('missing-approval'),
      /approval not found/i
    )
    const approval = await opportunity.approveMailDraftBatch([gmailDraft.id])
    const result = await googleService.sendApprovedMailBatch(approval.id)
    assert.deepEqual(result, [{ draftId: gmailDraft.id, ok: true }])
    assert.deepEqual(sent, ['gmail-draft-1'])
    await assert.rejects(
      googleService.sendApprovedMailBatch(approval.id),
      /stale|match/i
    )
  })
})

test('reply sync reads only Gmail thread IDs created by CoqPi', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const googleService = require('../dist-electron/backend/services/google-workspace-service.js')
    const readThreadIds = []
    googleService.setGoogleWorkspaceGatewayForTests({
      createDraft: async () => ({ draftId: 'draft' }),
      sendDraft: async () => ({ messageId: 'sent-message', threadId: 'linked-thread' }),
      getThread: async (threadId) => {
        readThreadIds.push(threadId)
        return { id: threadId, messages: [{ id: 'sent-message' }, { id: 'reply-message', snippet: 'Could we schedule a call 2026-08-20 14:30+02:00 recruiter@example.com https://meet.google.com/test-call?', from: 'recruiter@example.com', internalDate: String(Date.parse('2026-08-13T11:00:00Z')) }] }
      },
      createCalendarEvent: async () => ({ eventId: 'event' })
    })
    const created = await finder.addFinderSearchJob({ kind: 'job', label: 'Role', query: 'product' })
    const jobId = created.store.jobs[0].id
    await opportunity.configureOpportunityJob(jobId, { sourceAdapters: ['greenhouse'], providerTargets: [{ provider: 'greenhouse', target: 'acme' }] })
    opportunity.setOpportunityFetchForTests(async () => ({ ok: true, status: 200, json: async () => ({ jobs: [{ id: 2, title: 'PM', absolute_url: 'https://example.com/pm', content: 'Product role' }] }) }))
    const discovery = await opportunity.runOpportunityDiscovery(jobId)
    const pack = await opportunity.assembleOpportunityApplicationPack({ candidateId: discovery.candidates[0].id, ownerFactsToUse: ['Verified experience'], ownerFactsToAvoid: [] })
    const local = await opportunity.saveLocalMailDraft({ applicationPackId: pack.id, recipient: 'recruiter@example.com', subject: 'PM', body: 'Hello' })
    const gmail = await googleService.createGmailDraft(local.id)
    const approval = await opportunity.approveMailDraftBatch([gmail.id])
    await googleService.sendApprovedMailBatch(approval.id)

    const summaries = await googleService.syncLinkedGmailThreads()
    assert.deepEqual(readThreadIds, ['linked-thread'])
    assert.equal(summaries[0].classification, 'call_proposed')
    assert.equal(summaries[0].gmailThreadId, 'linked-thread')
    assert.equal(summaries[0].calendarSuggestion.startAt, '2026-08-20T12:30:00.000Z')

    const proposal = await googleService.createCalendarProposalFromReply({
      threadSummaryId: summaries[0].id,
      title: 'Acme product call',
      ...summaries[0].calendarSuggestion
    })
    await assert.rejects(
      googleService.createApprovedCalendarEvent(proposal.id, 'stale-hash'),
      /stale/i
    )
    const createdEvent = await googleService.createApprovedCalendarEvent(
      proposal.id,
      proposal.contentHash
    )
    assert.equal(createdEvent.status, 'created')
    assert.equal(createdEvent.googleEventId, 'event')

    const handoff = await opportunity.buildOpportunitySessionHandoff({
      applicationPackId: pack.id,
      threadSummaryId: summaries[0].id,
      calendarProposalId: createdEvent.id
    })
    assert.equal(handoff.included, true)
    assert.match(handoff.text, /Verified experience/)
    assert.match(handoff.text, /call_proposed/)
  })
})

test('owner-confirmed session summary creates a local post-call follow-up draft', async () => {
  await withWorkspace(async ({ finder, opportunity }) => {
    const summaries = require('../dist-electron/backend/services/session-summary-service.js')
    const created = await finder.addFinderSearchJob({
      kind: 'accelerator',
      label: 'Accelerator',
      query: 'agtech accelerator'
    })
    const jobId = created.store.jobs[0].id
    await opportunity.configureOpportunityJob(jobId, {
      sourceAdapters: ['greenhouse'],
      providerTargets: [{ provider: 'greenhouse', target: 'program' }]
    })
    opportunity.setOpportunityFetchForTests(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        jobs: [{ id: 3, title: 'Agtech program', absolute_url: 'https://example.com/program', content: 'Program opportunity' }]
      })
    }))
    const discovery = await opportunity.runOpportunityDiscovery(jobId)
    const pack = await opportunity.assembleOpportunityApplicationPack({
      candidateId: discovery.candidates[0].id,
      ownerFactsToUse: ['Verified project traction'],
      ownerFactsToAvoid: []
    })
    const summary = await summaries.saveSessionSummary({
      sourceId: 'accelerator:program',
      partnerName: 'Program',
      title: 'Intro call',
      summary: 'Discussed the application process.',
      confirmedOutcomes: ['Send the project deck'],
      followUps: ['Share the deck by Friday']
    })

    const draft = await opportunity.createFollowUpDraftFromSessionSummary({
      sessionSummaryId: summary.id,
      applicationPackId: pack.id,
      recipient: 'program@example.com'
    })
    assert.equal(draft.status, 'local_draft')
    assert.match(draft.body, /Send the project deck/)
    assert.match(draft.body, /Share the deck by Friday/)
  })
})

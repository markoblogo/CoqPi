const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  buildLocalMemoryState,
  buildLocalMemoryRetrievalContext,
  formatLocalMemoryAssistantContext
} = require('../dist-electron/shared/local-memory-core.js')
const {
  getLocalMemoryCoreState
} = require('../dist-electron/backend/services/local-memory-core-service.js')

const makeManifest = () => ({
  version: 1,
  sources: [
    {
      id: 'source-owner',
      kind: 'owner_profile_file',
      location: '/private/path/cv.md',
      label: 'Owner CV',
      selected: true,
      status: 'retrieval_ready',
      createdAt: '2026-07-20T10:00:00.000Z',
      ownerId: 'owner',
      provenance: {
        sourceId: 'coqpi:ingress:source-owner',
        locatorSha256: '1'.repeat(64)
      },
      contentHash: '2'.repeat(64),
      extraction: {
        version: 1,
        sourceFormat: 'markdown',
        extractedAt: '2026-07-20T10:05:00.000Z',
        ownerFacts: ['Built agri commodity workflows', 'Led AI product discovery'],
        roleFacts: ['Product strategy', 'Operations'],
        links: ['https://example.com/cv'],
        dates: ['2026-07-20'],
        missingFields: []
      },
      classification: 'private',
      retention: {
        mode: 'manual_deletion_required',
        maxAgeDays: 30,
        expiresAt: '2099-08-19T10:00:00.000Z'
      },
      retrievalScopes: ['coqpi_interview_en_fr'],
      promotion: 'explicit_audit_required'
    }
  ],
  counterpartyPacks: [
    {
      version: 1,
      id: 'pack-selected',
      sourceId: 'finder:job:northfield',
      kind: 'job',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary: 'Focused interview pack for product and AI delivery.',
      context: 'Use only this company-specific pack in the next call.',
      links: ['https://example.com/northfield'],
      selected: true,
      status: 'retrieval_ready',
      createdAt: '2026-07-22T10:00:00.000Z',
      ownerId: 'owner',
      provenance: {
        sourceId: 'coqpi:finder:finder:job:northfield',
        locatorSha256: '3'.repeat(64)
      },
      contentHash: '4'.repeat(64),
      classification: 'private',
      retention: {
        mode: 'manual_deletion_required',
        maxAgeDays: 30,
        expiresAt: '2099-08-21T10:00:00.000Z'
      },
      retrievalScopes: ['coqpi_interview_en_fr'],
      promotion: 'explicit_audit_required'
    },
    {
      version: 1,
      id: 'pack-disabled',
      sourceId: 'finder:investor:cobalt',
      kind: 'investor',
      partnerName: 'Cobalt Seed',
      title: 'Seed investor',
      summary: 'Unrelated investor pack.',
      context: 'Should stay out of the current session.',
      links: ['https://example.com/cobalt'],
      selected: false,
      status: 'retrieval_ready',
      createdAt: '2026-07-22T10:00:00.000Z',
      ownerId: 'owner',
      provenance: {
        sourceId: 'coqpi:finder:finder:investor:cobalt',
        locatorSha256: '5'.repeat(64)
      },
      contentHash: '6'.repeat(64),
      classification: 'private',
      retention: {
        mode: 'manual_deletion_required',
        maxAgeDays: 30,
        expiresAt: '2099-08-21T10:00:00.000Z'
      },
      retrievalScopes: ['coqpi_interview_en_fr'],
      promotion: 'explicit_audit_required'
    }
  ],
  knowledgePackLifecycle: [
    {
      version: 1,
      id: 'life-1',
      status: 'saved',
      at: '2026-07-23T09:00:00.000Z',
      sourceId: 'finder:job:northfield',
      draftHash: '7'.repeat(64),
      reason: 'owner saved reviewed pack',
      selected: true,
      weakFields: []
    }
  ]
})

const makeStore = () => ({
  version: 1,
  jobs: [],
  results: [
    {
      version: 1,
      id: 'result-1',
      jobId: 'job-1',
      sourceId: 'finder:job:northfield',
      kind: 'job',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary: 'Relevant job',
      context: '',
      links: [],
      score: 85,
      fitScore: 91,
      whyRelevant: 'Good fit',
      missingInfo: 'none',
      nextAction: 'Prepare intro',
      status: 'ready',
      decision: {
        state: 'import_now',
        updatedAt: '2026-07-24T10:00:00.000Z'
      },
      createdAt: '2026-07-24T10:00:00.000Z',
      ownerId: 'owner',
      provenance: {
        sourceId: 'coqpi:finder:result:result-1',
        locatorSha256: '8'.repeat(64)
      },
      contentHash: '9'.repeat(64),
      statusHistory: []
    }
  ],
  outreachDrafts: [
    {
      version: 1,
      id: 'draft-1',
      jobId: 'job-1',
      candidateResultId: 'result-1',
      sourceId: 'finder:job:northfield',
      kind: 'job',
      targetName: 'Northfield Labs',
      opportunity: 'AI Product Lead',
      fitLabel: 'Strong fit',
      whyRelevant: 'Strong role alignment',
      knownContext: ['AI delivery'],
      questionsToAsk: ['What is the first 90-day priority?'],
      openingMessage: 'Thanks for taking the call.',
      nextAction: 'Use this as continuity for the next call.',
      warnings: [],
      status: 'follow_up',
      createdAt: '2026-07-24T10:10:00.000Z',
      statusHistory: [
        {
          status: 'follow_up',
          at: '2026-07-25T08:00:00.000Z',
          reason: 'owner needs a short follow-up'
        }
      ],
      ownerId: 'owner',
      provenance: {
        sourceId: 'coqpi:finder:outreach-draft:draft-1',
        locatorSha256: 'a'.repeat(64)
      },
      contentHash: 'b'.repeat(64)
    }
  ]
})

const makeSessionSummaries = () => [
  {
    version: 1,
    id: 'summary-1',
    createdAt: '2026-07-25T10:00:00.000Z',
    confirmedAt: '2026-07-25T10:00:00.000Z',
    sourceId: 'finder:job:northfield',
    partnerName: 'Northfield Labs',
    title: 'AI Product Lead',
    summary: 'Owner confirmed strong interest and aligned first-call positioning.',
    confirmedOutcomes: ['Intro call done', 'Need tighter 90-day story'],
    followUps: ['Send short follow-up focused on workflow transformation'],
    risks: ['Do not overclaim team size'],
    sessionLabel: 'Northfield intro call',
    selectedCounterpartyPackIds: ['pack-selected'],
    selectedFinderOutreachDraftId: 'draft-1'
  }
]

test('local memory core derives evidence-backed records and strict assistant view', () => {
  const state = buildLocalMemoryState({
    manifest: makeManifest(),
    finderStore: makeStore(),
    sessionSummaries: makeSessionSummaries(),
    selectedPackIds: ['pack-selected'],
    selectedDraftId: 'draft-1'
  })

  assert.equal(state.records.length >= 5, true)
  assert.equal(
    state.assistantView.included.some(({ record }) => record.id === 'memory:pack:pack-selected:summary'),
    true
  )
  assert.equal(
    state.assistantView.dropped.some(
      ({ record, reason }) =>
        record.entityId === 'target:finder:investor:cobalt' &&
        /disabled|not selected/i.test(reason)
    ),
    true
  )
  assert.equal(
    state.assistantView.included.some(
      ({ record }) =>
        record.sourceType === 'finder_outreach_draft' &&
        record.kind === 'relationship_state'
    ),
    true
  )
  assert.equal(
    state.assistantView.included.some(
      ({ record }) =>
        record.sourceType === 'session_summary' &&
        /owner-confirmed session summary/i.test(record.title)
    ),
    true
  )

  const context = formatLocalMemoryAssistantContext(state)
  assert.match(context, /Northfield Labs/)
  assert.match(context, /Owner confirmed strong interest/)
  assert.doesNotMatch(context, /Cobalt Seed/)
  assert.doesNotMatch(context, /\/private\/path/)

  const ranked = buildLocalMemoryRetrievalContext({
    state,
    query: 'Can you explain your 90-day plan and workflow transformation fit for Northfield Labs?'
  })
  assert.equal(ranked.shouldAbstain, false)
  assert.match(ranked.context, /Northfield Labs/)
  assert.match(ranked.context, /90-day/)

  const abstained = buildLocalMemoryRetrievalContext({
    state,
    query: 'Tell me about glacier archaeology in Icelandic volcano archives.'
  })
  assert.equal(abstained.shouldAbstain, true)
  assert.equal(abstained.context, '')
})

test('local memory core service writes compact artifacts from existing ledgers', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-local-memory-'))
  const previousCoreDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const coreDirectory = path.join(directory, 'core')
  const sessionsDirectory = path.join(directory, 'sessions')

  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = coreDirectory
  process.env.COQPI_SESSIONS_DIR = sessionsDirectory
  await fs.mkdir(coreDirectory, { recursive: true })
  await fs.mkdir(sessionsDirectory, { recursive: true })

  await fs.writeFile(
    path.join(coreDirectory, 'coqpi-ingress.events.jsonl'),
    [
      JSON.stringify({
        version: 1,
        type: 'counterparty_pack_imported',
        pack: makeManifest().counterpartyPacks[0]
      }),
      JSON.stringify({
        version: 1,
        type: 'knowledge_pack_lifecycle_recorded',
        entry: makeManifest().knowledgePackLifecycle[0]
      })
    ].join('\n') + '\n'
  )

  await fs.mkdir(path.join(coreDirectory, 'finder'), { recursive: true })
  await fs.writeFile(
    path.join(coreDirectory, 'finder', 'finder-search.events.jsonl'),
    [
      JSON.stringify({
        version: 1,
        type: 'candidate_recorded',
        result: makeStore().results[0]
      }),
      JSON.stringify({
        version: 1,
        type: 'outreach_draft_recorded',
        draft: makeStore().outreachDrafts[0]
      })
    ].join('\n') + '\n'
  )
  await fs.writeFile(
    path.join(coreDirectory, 'session-summaries.jsonl'),
    `${JSON.stringify(makeSessionSummaries()[0])}\n`
  )

  try {
    const state = await getLocalMemoryCoreState({
      selectedPackIds: ['pack-selected'],
      selectedDraftId: 'draft-1',
      persistArtifacts: true
    })

    assert.equal(state.assistantView.included.length >= 2, true)

    const json = JSON.parse(
      await fs.readFile(
        path.join(coreDirectory, 'coqpi-local-memory-core.json'),
        'utf8'
      )
    )
    const markdown = await fs.readFile(
      path.join(coreDirectory, 'coqpi-local-memory-core.md'),
      'utf8'
    )

    assert.equal(json.version, 1)
    assert.match(markdown, /# CoqPi Local Memory Core/)
    assert.match(markdown, /Assistant context preview/)
    assert.match(markdown, /Northfield Labs/)
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
})

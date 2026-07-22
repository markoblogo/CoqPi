const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createFinderRecordsFromRunnerPayload,
  createContextPackDraftFromFinderResult,
  createFinderCandidateResult,
  createFinderSearchJob,
  createFinderPipelineView,
  getFinderSearchStatusCounts,
  parseFinderRunnerPayloadText,
  updateFinderSearchJobStatus
} = require('../dist-electron/shared/finder-search-module.js')

test('finder search job normalizes local draft and tracks status', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: '  Product roles France  ',
      query: ' senior product manager france agtech ',
      goal: 'Find interview targets'
    },
    { id: 'job-1', now: '2026-07-22T10:00:00.000Z' }
  )
  const ready = updateFinderSearchJobStatus(
    job,
    'ready',
    '2026-07-22T10:05:00.000Z'
  )

  assert.equal(job.label, 'Product roles France')
  assert.equal(job.query, 'senior product manager france agtech')
  assert.equal(job.status, 'draft')
  assert.equal(ready.status, 'ready')
  assert.equal(ready.updatedAt, '2026-07-22T10:05:00.000Z')
})

test('finder candidate result converts to selected context pack draft', () => {
  const job = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'seed funds agri commodity ecosystem europe'
    },
    { id: 'search-1', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const result = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:green-seed',
      partnerName: 'Green Seed Capital',
      title: 'Climate/agri seed fund',
      summary: 'Seed investor focused on climate and agri infrastructure.',
      context: 'Relevant for ecosystem infrastructure and commodity workflows.',
      links: ['https://example.com', 'https://example.com'],
      score: 87.4,
      fitScore: 92.3,
      whyRelevant: 'Strong fit for agri commodity infrastructure.',
      missingInfo: 'Check ticket size and geography.',
      nextAction: 'Prepare a short intro email.'
    },
    { id: 'result-1', now: '2026-07-22T10:02:00.000Z' }
  )
  const pack = createContextPackDraftFromFinderResult(result)

  assert.equal(result.kind, 'investor')
  assert.equal(result.score, 87)
  assert.equal(result.fitScore, 92)
  assert.equal(result.whyRelevant, 'Strong fit for agri commodity infrastructure.')
  assert.equal(result.missingInfo, 'Check ticket size and geography.')
  assert.equal(result.nextAction, 'Prepare a short intro email.')
  assert.deepEqual(result.links, ['https://example.com'])
  assert.deepEqual(pack, {
    sourceId: 'finder:investor:green-seed',
    kind: 'investor',
    partnerName: 'Green Seed Capital',
    title: 'Climate/agri seed fund',
    summary: 'Seed investor focused on climate and agri infrastructure.',
    context: [
      'Relevant for ecosystem infrastructure and commodity workflows.',
      'Fit score: 92/100',
      'Why relevant: Strong fit for agri commodity infrastructure.',
      'Missing info: Check ticket size and geography.',
      'Next action: Prepare a short intro email.'
    ].join('\n'),
    links: ['https://example.com'],
    selected: true
  })
})

test('finder search status counts cover queue table states', () => {
  const jobs = ['draft', 'ready', 'imported', 'rejected', 'ready'].map(
    (status, index) =>
      createFinderSearchJob(
        {
          kind: 'partner',
          label: `Partner search ${index}`,
          query: `query ${index}`
        },
        {
          id: `job-${index}`,
          now: '2026-07-22T10:00:00.000Z',
          status
        }
      )
  )

  assert.deepEqual(getFinderSearchStatusCounts(jobs), {
    draft: 1,
    ready: 2,
    imported: 1,
    rejected: 1
  })
})

test('finder search contract rejects incomplete local records', () => {
  assert.throws(
    () =>
      createFinderSearchJob(
        { kind: 'job', label: '', query: 'product manager' },
        { id: 'job-1', now: '2026-07-22T10:00:00.000Z' }
      ),
    /requires label and query/
  )

  const job = createFinderSearchJob(
    { kind: 'job', label: 'Jobs', query: 'product manager' },
    { id: 'job-1', now: '2026-07-22T10:00:00.000Z' }
  )

  assert.throws(
    () =>
      createFinderCandidateResult(
        job,
        {
          sourceId: 'finder:job:x',
          partnerName: '',
          title: 'Product role',
          summary: 'Role summary'
        },
        { id: 'result-1', now: '2026-07-22T10:02:00.000Z' }
      ),
    /requires sourceId/
  )
})

test('finder runner payload accepts valid candidates and returns item errors', () => {
  const payload = JSON.stringify({
    job: {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech',
      goal: 'Prepare interview packs'
    },
    results: [
      {
        sourceId: 'finder:job:northfield',
        partnerName: 'Northfield Labs',
        title: 'AI Product Lead',
        summary: 'Product leadership role with AI workflow focus.',
        links: ['https://example.com/northfield'],
        score: 91,
        fitScore: 88,
        whyRelevant: 'Matches AI product leadership and France search.',
        missingInfo: 'Need salary range and remote policy.',
        nextAction: 'Open company page and prepare outreach.'
      },
      {
        sourceId: 'finder:job:broken',
        partnerName: '',
        title: 'Incomplete',
        summary: 'Missing partner'
      }
    ]
  })
  const preview = parseFinderRunnerPayloadText(payload)
  const records = createFinderRecordsFromRunnerPayload(payload, {
    jobId: 'runner-job-1',
    resultId: (index) => `runner-result-${index}`,
    now: '2026-07-22T11:00:00.000Z'
  })

  assert.equal(preview.requestedCount, 2)
  assert.equal(preview.validCount, 1)
  assert.equal(preview.errors.length, 1)
  assert.equal(preview.errors[0].index, 1)
  assert.equal(records.job.status, 'ready')
  assert.equal(records.results.length, 1)
  assert.equal(records.results[0].jobId, 'runner-job-1')
  assert.equal(records.results[0].kind, 'job')
  assert.equal(records.results[0].fitScore, 88)
  assert.equal(records.results[0].whyRelevant, 'Matches AI product leadership and France search.')
  assert.equal(records.results[0].missingInfo, 'Need salary range and remote policy.')
  assert.equal(records.results[0].nextAction, 'Open company page and prepare outreach.')
})

test('finder runner payload rejects malformed envelopes before UI import', () => {
  assert.throws(
    () => parseFinderRunnerPayloadText('[]'),
    /must be a JSON object/
  )

  assert.throws(
    () =>
      createFinderRecordsFromRunnerPayload(
        JSON.stringify({
          job: { kind: 'job', label: '', query: 'x' },
          results: []
        }),
        {
          jobId: 'runner-job-1',
          resultId: (index) => `runner-result-${index}`,
          now: '2026-07-22T11:00:00.000Z'
        }
      ),
    /requires label and query/
  )
})

test('finder pipeline view prioritizes high-fit ready candidates', () => {
  const job = createFinderSearchJob(
    { kind: 'job', label: 'Jobs', query: 'product manager' },
    { id: 'job-1', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const candidates = [
    createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:job:low',
        partnerName: 'Low Fit',
        title: 'Product role',
        summary: 'Relevant but weaker.',
        fitScore: 42
      },
      { id: 'result-low', now: '2026-07-22T10:01:00.000Z' }
    ),
    createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:job:missing-score',
        partnerName: 'Missing Score',
        title: 'Product role',
        summary: 'Needs review.'
      },
      { id: 'result-missing', now: '2026-07-22T10:03:00.000Z' }
    ),
    createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:job:high',
        partnerName: 'High Fit',
        title: 'AI Product Lead',
        summary: 'Strong fit.',
        fitScore: 91,
        nextAction: 'Prepare tailored intro.'
      },
      { id: 'result-high', now: '2026-07-22T10:02:00.000Z' }
    )
  ]

  assert.deepEqual(
    createFinderPipelineView(candidates).map((candidate) => candidate.id),
    ['result-high', 'result-low', 'result-missing']
  )
})

test('finder pipeline view filters by status score and next action', () => {
  const job = createFinderSearchJob(
    { kind: 'investor', label: 'Funds', query: 'agri seed funds' },
    { id: 'job-2', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const readyHigh = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:ready-high',
      partnerName: 'Ready High',
      title: 'Seed fund',
      summary: 'Strong investor fit.',
      fitScore: 86,
      nextAction: 'Check ticket size.'
    },
    { id: 'ready-high', now: '2026-07-22T10:01:00.000Z' }
  )
  const readyLow = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:ready-low',
      partnerName: 'Ready Low',
      title: 'Seed fund',
      summary: 'Lower fit.',
      fitScore: 58,
      nextAction: 'Keep for later.'
    },
    { id: 'ready-low', now: '2026-07-22T10:02:00.000Z' }
  )
  const importedHigh = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:imported-high',
        partnerName: 'Imported High',
        title: 'Climate fund',
        summary: 'Already imported.',
        fitScore: 93
      },
      { id: 'imported-high', now: '2026-07-22T10:03:00.000Z' }
    ),
    status: 'imported'
  }

  assert.deepEqual(
    createFinderPipelineView([readyLow, importedHigh, readyHigh], {
      status: 'ready',
      minFitScore: 80,
      requiresNextAction: true,
      sortMode: 'next_action'
    }).map((candidate) => candidate.id),
    ['ready-high']
  )
})

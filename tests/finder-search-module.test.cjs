const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createFinderRecordsFromRunnerPayload,
  createContextPackDraftFromFinderResult,
  createFinderCandidatesFromOwnerPastedSource,
  createFinderCandidateResult,
  createFinderOutreachDraft,
  createFinderOutreachPrepPack,
  createFinderSearchJob,
  createManualFinderRunnerCandidates,
  buildFinderDecisionQueueItem,
  buildFinderQueueReviewColumns,
  createFinderPipelineView,
  buildFinderPreviewCompletionActions,
  buildFinderCandidateOutreachPipeline,
  explainFinderCandidateScore,
  buildFinderQueueImportPlan,
  getFinderPreviewImportDecision,
  reviewFinderPreviewCandidateQuality,
  summarizeFinderDecisionQueue,
  formatFinderOutreachDraftForExport,
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

test('manual finder runner creates bounded local placeholder candidates', () => {
  const job = createFinderSearchJob(
    {
      kind: 'partner',
      label: 'Agri partners France',
      query: 'grain logistics partners france',
      goal: 'Prepare partner conversations',
      notes: 'Focus on practical pilots'
    },
    { id: 'job-local-runner', now: '2026-07-22T12:00:00.000Z' }
  )
  const candidates = createManualFinderRunnerCandidates(job)

  assert.equal(candidates.length, 3)
  assert.equal(
    candidates[0].sourceId,
    'coqpi:manual-runner:partner:job-local-runner:1'
  )
  assert.equal(candidates[0].partnerName, 'Manual partner target 1')
  assert.equal(candidates[0].fitScore, 84)
  assert.match(candidates[0].summary, /Manual\/mock partner candidate/)
  assert.match(candidates[0].context, /not an internet search result/)
  assert.match(candidates[0].whyRelevant, /Requires manual evidence/)
  assert.deepEqual(candidates[0].links, [])
})

test('owner pasted source adapter normalizes urls and text blocks', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech',
      goal: 'Prepare interview packs'
    },
    { id: 'job-owner-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'https://example.com/jobs/product-lead',
      '',
      'Northfield Labs - AI Product Lead',
      'Product leadership role in France.',
      'https://northfield.example/careers'
    ].join('\n')
  )

  assert.equal(parsed.requestedCount, 2)
  assert.equal(parsed.errors.length, 0)
  assert.equal(parsed.candidates.length, 2)
  assert.match(parsed.candidates[0].sourceId, /^coqpi:source-adapter:job:/)
  assert.equal(parsed.candidates[0].partnerName, 'Example')
  assert.equal(parsed.candidates[0].title, 'Product Lead')
  assert.equal(parsed.candidates[0].detectedFormat, 'url')
  assert.equal(parsed.candidates[0].parserPack, 'job_page_v1')
  assert.deepEqual(parsed.candidates[0].links, [
    'https://example.com/jobs/product-lead'
  ])
  assert.equal(parsed.candidates[1].title, 'Northfield Labs - AI Product Lead')
  assert.match(parsed.candidates[1].context, /No web fetch/)
  assert.match(parsed.candidates[1].missingInfo, /Verify/)
})

test('owner pasted source adapter extracts structured vacancy fields before preview', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech',
      goal: 'Prepare interview packs'
    },
    { id: 'job-owner-source-fields', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Company: Northfield Labs',
      'Role: Senior Product Manager',
      'Location: Paris, France',
      'Website: https://northfield.example/careers',
      'Contact: hiring@northfield.example',
      'Deadline: 2026-08-15',
      'Why relevant: Agtech product leadership with French market exposure.'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(parsed.requestedCount, 1)
  assert.equal(parsed.errors.length, 0)
  assert.equal(candidate.partnerName, 'Northfield Labs')
  assert.equal(candidate.title, 'Senior Product Manager')
  assert.equal(candidate.parserPack, 'job_page_v1')
  assert.deepEqual(candidate.links, ['https://northfield.example/careers'])
  assert.match(candidate.summary, /Paris, France/)
  assert.match(candidate.summary, /2026-08-15/)
  assert.match(candidate.context, /hiring@northfield\.example/)
  assert.equal(
    candidate.whyRelevant,
    'Agtech product leadership with French market exposure.'
  )
  assert.match(candidate.missingInfo, /salary range/)
  assert.match(candidate.nextAction, /hiring@northfield\.example/)
})

test('owner pasted source adapter enriches job entries with compensation remote policy and contract type', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech',
      goal: 'Prepare interview packs'
    },
    { id: 'job-owner-source-job-rich', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Company: Northfield Labs',
      'Role: Senior Product Manager',
      'Location: Paris, France',
      'Compensation: EUR 90k-110k',
      'Remote policy: Hybrid 3 days on-site',
      'Contract type: CDI',
      'Website: https://northfield.example/careers',
      'Contact: hiring@northfield.example'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'structured_fields')
  assert.match(candidate.summary, /EUR 90k-110k/)
  assert.match(candidate.summary, /Hybrid 3 days on-site/)
  assert.match(candidate.context, /Compensation: EUR 90k-110k/)
  assert.match(candidate.context, /Remote policy: Hybrid 3 days on-site/)
  assert.match(candidate.context, /Contract type: CDI/)
})

test('owner pasted source adapter extracts partner export fields before preview', () => {
  const job = createFinderSearchJob(
    {
      kind: 'partner',
      label: 'Agro partners France',
      query: 'agri commodity ecosystem implementation partners france'
    },
    { id: 'partner-owner-source-fields', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Partner: AgroTrade France',
      'Opportunity: Pilot distribution partner',
      'Country: France',
      'City: Lyon',
      'URL: https://agrotrade.example',
      'Contact: Marie Dupont <marie@agrotrade.example>',
      'Missing info: decision maker and pilot budget'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.partnerName, 'AgroTrade France')
  assert.equal(candidate.title, 'Pilot distribution partner')
  assert.equal(candidate.detectedFormat, 'partner_export')
  assert.equal(candidate.parserPack, 'company_profile_v1')
  assert.match(candidate.summary, /Lyon, France/)
  assert.match(candidate.context, /Marie Dupont/)
  assert.match(candidate.missingInfo, /decision maker and pilot budget/)
  assert.match(candidate.nextAction, /marie@agrotrade\.example/)
})

test('owner pasted source adapter parses LinkedIn-style job snippets', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech'
    },
    { id: 'linkedin-job-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Senior Product Manager',
      'Northfield Labs · Paris, Île-de-France, France · Reposted 2 weeks ago',
      'Full-time · Mid-Senior level',
      'https://www.linkedin.com/jobs/view/12345'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.partnerName, 'Northfield Labs')
  assert.equal(candidate.title, 'Senior Product Manager')
  assert.equal(candidate.detectedFormat, 'linkedin_job')
  assert.equal(candidate.parserPack, 'job_page_v1')
  assert.match(candidate.summary, /Paris, Île-de-France, France/)
  assert.deepEqual(candidate.links, ['https://www.linkedin.com/jobs/view/12345'])
  assert.match(candidate.missingInfo, /contact/)
})

test('owner pasted source adapter parses generic job-board snippets without structured fields', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech'
    },
    { id: 'generic-job-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Senior Product Manager',
      'Northfield Labs',
      'Paris, France (Hybrid)',
      'Full-time',
      'About the job',
      'Lead product planning for agricultural workflow tooling.',
      'https://northfield.example/jobs/senior-product-manager'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'linkedin_job')
  assert.equal(candidate.parserPack, 'job_page_v1')
  assert.equal(candidate.partnerName, 'Northfield Labs')
  assert.equal(candidate.title, 'Senior Product Manager')
  assert.match(candidate.summary, /Paris, France \(Hybrid\)/)
  assert.match(candidate.whyRelevant, /Lead product planning/)
  assert.deepEqual(candidate.links, [
    'https://northfield.example/jobs/senior-product-manager'
  ])
})

test('owner pasted source adapter parses accelerator-style snippets', () => {
  const job = createFinderSearchJob(
    {
      kind: 'accelerator',
      label: 'Agri accelerators Europe',
      query: 'agtech accelerator europe seed program'
    },
    { id: 'accelerator-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'AgriTech Europe Accelerator',
      'Applications close September 30, 2026',
      'Paris / Remote',
      'For climate and agricultural infrastructure startups.',
      'https://accelerator.example/apply'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.partnerName, 'AgriTech Europe Accelerator')
  assert.equal(candidate.title, 'Accelerator program')
  assert.equal(candidate.detectedFormat, 'accelerator_snippet')
  assert.equal(candidate.parserPack, 'accelerator_program_v1')
  assert.match(candidate.summary, /September 30, 2026/)
  assert.match(candidate.summary, /Paris \/ Remote/)
  assert.match(candidate.whyRelevant, /agricultural infrastructure/)
})

test('owner pasted source adapter enriches accelerator entries with cohort terms and criteria', () => {
  const job = createFinderSearchJob(
    {
      kind: 'accelerator',
      label: 'Agri accelerators Europe',
      query: 'agtech accelerator europe seed program'
    },
    { id: 'accelerator-rich-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Accelerator: AgriTech Europe Accelerator',
      'Program: Fall 2026 cohort',
      'Location: Paris / Remote',
      'Applications close: September 30, 2026',
      'Program terms: 12 weeks, 2 percent equity',
      'Selection criteria: Seed-stage climate and agricultural workflow teams',
      'Website: https://accelerator.example/apply'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'accelerator_snippet')
  assert.equal(candidate.parserPack, 'accelerator_program_v1')
  assert.equal(candidate.title, 'Fall 2026 cohort')
  assert.match(candidate.context, /Program terms: 12 weeks, 2 percent equity/)
  assert.match(
    candidate.context,
    /Selection criteria: Seed-stage climate and agricultural workflow teams/
  )
  assert.match(candidate.summary, /September 30, 2026/)
})

test('owner pasted source adapter parses messy accelerator snippets with who-should-apply and equity terms', () => {
  const job = createFinderSearchJob(
    {
      kind: 'accelerator',
      label: 'Agri accelerators Europe',
      query: 'agtech accelerator europe seed program'
    },
    { id: 'accelerator-messy-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Agri Launchpad',
      'Batch: Spring 2027',
      'HQ: Paris, France',
      'Who should apply: Seed-stage agri, climate, and commodity workflow startups.',
      'Equity terms: 1.5% equity, 10 weeks',
      'Deadline to apply: January 15, 2027',
      'https://agrilaunchpad.example/apply'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'accelerator_snippet')
  assert.equal(candidate.parserPack, 'accelerator_program_v1')
  assert.equal(candidate.partnerName, 'Agri Launchpad')
  assert.equal(candidate.title, 'Spring 2027')
  assert.match(candidate.summary, /January 15, 2027/)
  assert.match(candidate.context, /Program terms: 1.5% equity, 10 weeks/)
  assert.match(
    candidate.context,
    /Selection criteria: Seed-stage agri, climate, and commodity workflow startups/
  )
})

test('owner pasted source adapter parses CSV-like investor lists as multiple candidates', () => {
  const job = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'agri commodity seed funds europe'
    },
    { id: 'csv-investor-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Fund,Focus,Geography,Website,Contact',
      'Green Seed Capital,Agri infrastructure,Europe,https://greenseed.example,intro@greenseed.example',
      'Blue Fields Fund,Commodity workflows,France,https://bluefields.example,'
    ].join('\n')
  )

  assert.equal(parsed.requestedCount, 2)
  assert.equal(parsed.candidates.length, 2)
  assert.equal(parsed.candidates[0].partnerName, 'Green Seed Capital')
  assert.equal(parsed.candidates[0].title, 'Agri infrastructure')
  assert.equal(parsed.candidates[0].detectedFormat, 'investor_list')
  assert.equal(parsed.candidates[0].parserPack, 'investor_fund_v1')
  assert.match(parsed.candidates[0].summary, /Europe/)
  assert.match(parsed.candidates[0].context, /intro@greenseed\.example/)
  assert.equal(parsed.candidates[1].partnerName, 'Blue Fields Fund')
  assert.deepEqual(parsed.candidates[1].links, ['https://bluefields.example/'])
})

test('owner pasted source adapter enriches investor entries with stage ticket size and thesis', () => {
  const job = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'agri commodity seed funds europe'
    },
    { id: 'investor-structured-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Fund: Green Seed Capital',
      'Focus: Agri infrastructure',
      'Geography: Europe',
      'Stage: Pre-seed / Seed',
      'Ticket size: €250k-€1m',
      'Thesis: Backs agricultural workflow infrastructure and commodity tooling.',
      'Website: https://greenseed.example',
      'Contact: intro@greenseed.example'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'investor_list')
  assert.equal(candidate.parserPack, 'investor_fund_v1')
  assert.equal(candidate.partnerName, 'Green Seed Capital')
  assert.equal(candidate.title, 'Agri infrastructure')
  assert.match(candidate.whyRelevant, /Pre-seed \/ Seed/)
  assert.match(candidate.whyRelevant, /€250k-€1m/)
  assert.match(candidate.context, /Stage: Pre-seed \/ Seed/)
  assert.match(candidate.context, /Ticket size: €250k-€1m/)
  assert.match(candidate.context, /Thesis: Backs agricultural workflow infrastructure/)
})

test('owner pasted source adapter recognizes investor alias fields and geography mandate', () => {
  const job = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'agri commodity seed funds europe'
    },
    { id: 'investor-alias-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Investor: Blue Field Ventures',
      'Sector: Commodity workflow infrastructure',
      'Geography mandate: France and Benelux',
      'Check size: €500k',
      'Investment thesis: Backs trade, logistics, and market plumbing',
      'Website URL: https://bluefield.example',
      'Email: partners@bluefield.example'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'investor_list')
  assert.equal(candidate.partnerName, 'Blue Field Ventures')
  assert.equal(candidate.title, 'Commodity workflow infrastructure')
  assert.match(candidate.summary, /France and Benelux/)
  assert.match(candidate.context, /Ticket size: €500k/)
  assert.match(candidate.context, /Thesis: Backs trade, logistics, and market plumbing/)
})

test('owner pasted source adapter recognizes investor aliases like HQ, sector focus, and initial check', () => {
  const job = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'agri commodity seed funds europe'
    },
    { id: 'investor-rich-alias-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Investor: Delta Field Ventures',
      'Sector focus: Agri supply chain and commodity software',
      'HQ: Brussels, Belgium',
      'Stage preference: Seed / Series A',
      'Initial check: €500k',
      'Notes: Looks for workflow and infrastructure leverage.',
      'Contact email: team@deltafield.example',
      'Website URL: https://deltafield.example'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'investor_list')
  assert.equal(candidate.partnerName, 'Delta Field Ventures')
  assert.equal(candidate.title, 'Agri supply chain and commodity software')
  assert.match(candidate.summary, /Brussels, Belgium/)
  assert.match(candidate.context, /Stage: Seed \/ Series A/)
  assert.match(candidate.context, /Ticket size: €500k/)
  assert.match(candidate.context, /Thesis: Looks for workflow and infrastructure leverage/)
  assert.match(candidate.context, /Extracted contact: team@deltafield\.example/)
})

test('owner pasted source adapter parses messy real-world job pages with section-style fields', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech'
    },
    { id: 'job-realworld-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Company: Verdant Systems',
      'Role / Title: Staff Product Manager, Commodity Workflows',
      'Location: Paris, France or remote within France',
      'Compensation & Benefits: €85k-€110k + equity',
      'Type: CDI',
      'Apply by: August 18, 2026',
      'Why this role matters: Lead the operator workflow layer for agricultural trade and logistics.',
      'Source: https://verdant.example/careers/staff-product-manager'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'structured_fields')
  assert.equal(candidate.parserPack, 'job_page_v1')
  assert.equal(candidate.partnerName, 'Verdant Systems')
  assert.equal(candidate.title, 'Staff Product Manager, Commodity Workflows')
  assert.match(candidate.summary, /Paris, France or remote within France/)
  assert.match(candidate.summary, /€85k-€110k \+ equity/)
  assert.match(candidate.summary, /August 18, 2026/)
  assert.match(candidate.context, /Compensation: €85k-€110k \+ equity/)
  assert.match(candidate.context, /Contract type: CDI/)
  assert.match(
    candidate.whyRelevant,
    /Lead the operator workflow layer for agricultural trade and logistics/
  )
  assert.doesNotMatch(candidate.missingInfo, /salary range/)
})

test('owner pasted source adapter parses messy real-world investor pages with alias-rich thesis fields', () => {
  const job = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'agri commodity seed funds europe'
    },
    { id: 'investor-realworld-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Fund name: Orchard Capital',
      'What we back: agricultural software, market infrastructure, and supply-chain tooling',
      'Where we invest: France, Benelux, and Germany',
      'Stages: pre-seed to Series A',
      'First cheque: €300k-€1.2m',
      'Contact us: team@orchard.example',
      'Website: https://orchard.example'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'investor_list')
  assert.equal(candidate.parserPack, 'investor_fund_v1')
  assert.equal(candidate.partnerName, 'Orchard Capital')
  assert.equal(
    candidate.title,
    'agricultural software, market infrastructure, and supply-chain tooling'
  )
  assert.match(candidate.summary, /France, Benelux, and Germany/)
  assert.match(candidate.context, /Stage: pre-seed to Series A/i)
  assert.match(candidate.context, /Ticket size: €300k-€1.2m/)
  assert.match(
    candidate.context,
    /Thesis: agricultural software, market infrastructure, and supply-chain tooling/i
  )
  assert.match(candidate.context, /Extracted contact: team@orchard\.example/)
})

test('owner pasted source adapter parses messy real-world accelerator pages with section headings and support terms', () => {
  const job = createFinderSearchJob(
    {
      kind: 'accelerator',
      label: 'Agri accelerators Europe',
      query: 'agtech accelerator europe seed program'
    },
    { id: 'accelerator-realworld-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Program name: Farm Launch Europe',
      'Based in: Paris and Lyon',
      "Who it's for: seed-stage agri, climate, and market-plumbing startups",
      'What you get: 10 weeks, pilot design support, and investor introductions',
      'Apply before: September 12, 2026',
      'Website: https://farmlaunch.example/apply'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'accelerator_snippet')
  assert.equal(candidate.parserPack, 'accelerator_program_v1')
  assert.equal(candidate.partnerName, 'Farm Launch Europe')
  assert.equal(candidate.title, 'Farm Launch Europe')
  assert.match(candidate.summary, /September 12, 2026/)
  assert.match(candidate.summary, /Paris and Lyon/)
  assert.match(
    candidate.context,
    /Program terms: 10 weeks, pilot design support, and investor introductions/
  )
  assert.match(
    candidate.context,
    /Selection criteria: seed-stage agri, climate, and market-plumbing startups/i
  )
})

test('owner pasted source adapter parses messy real-world partner pages with collaboration fields', () => {
  const job = createFinderSearchJob(
    {
      kind: 'partner',
      label: 'Agro partners France',
      query: 'agri commodity ecosystem implementation partners france'
    },
    { id: 'partner-realworld-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Partner name: Delta Operations',
      'Ideal collaboration: pilot deployment partner for commodity workflow tooling',
      'Regions served: France, Spain, and Belgium',
      'Contact us: ops-partnerships@delta.example',
      'Why this matters: already works with cross-border agricultural trade operators',
      'Website: https://delta.example/partnerships'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.detectedFormat, 'partner_export')
  assert.equal(candidate.parserPack, 'company_profile_v1')
  assert.equal(candidate.partnerName, 'Delta Operations')
  assert.equal(
    candidate.title,
    'pilot deployment partner for commodity workflow tooling'
  )
  assert.match(candidate.summary, /France, Spain, and Belgium/)
  assert.match(candidate.context, /Extracted contact: ops-partnerships@delta\.example/)
  assert.match(
    candidate.whyRelevant,
    /already works with cross-border agricultural trade operators/i
  )
})

test('owner pasted source adapter uses readiness evidence from messy partner pages', () => {
  const job = createFinderSearchJob(
    {
      kind: 'partner',
      label: 'Agro implementation partners',
      query: 'agri commodity ecosystem implementation partners france'
    },
    { id: 'partner-readiness-v3-source', now: '2026-07-27T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Delta Grain Ops | Partner program',
      'Current status: accepting pilot conversations for Q4 2026',
      'Decision maker: Marie Laurent, Head of Partnerships',
      'Pilot budget: €25k-€50k validation pilot',
      'Implementation timeline: 8-10 weeks after kickoff',
      'Geography: France and Benelux',
      'Contact: marie@deltagrain.example',
      'Why relevant: operates cross-border grain logistics with regional cooperatives',
      'Source: https://deltagrain.example/partners'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.equal(candidate.partnerName, 'Delta Grain Ops')
  assert.match(candidate.context, /Decision maker: Marie Laurent/)
  assert.match(candidate.context, /Current status: accepting pilot conversations/)
  assert.doesNotMatch(candidate.missingInfo, /decision maker/i)
  assert.doesNotMatch(candidate.missingInfo, /pilot budget/i)
  assert.doesNotMatch(candidate.missingInfo, /implementation timeline/i)
  assert.doesNotMatch(candidate.missingInfo, /current status/i)
  assert.ok((candidate.fitScore ?? 0) >= 88)
})

test('owner pasted source adapter scores job candidates by interview readiness', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech'
    },
    { id: 'job-scoring-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Company: Northfield Labs',
      'Role: Senior Product Manager',
      'Location: Paris, France',
      'Website: https://northfield.example/careers',
      'Contact: hiring@northfield.example',
      'Why relevant: Product management role in French agtech market.'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.ok(candidate.fitScore >= 84)
  assert.match(candidate.missingInfo, /salary range/)
  assert.match(candidate.missingInfo, /interview process/)
  assert.match(candidate.nextAction, /tailored CV/)
})

test('owner pasted source adapter scores partner candidates by outreach readiness', () => {
  const job = createFinderSearchJob(
    {
      kind: 'partner',
      label: 'Agro partners France',
      query: 'agri commodity ecosystem implementation partners france'
    },
    { id: 'partner-scoring-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    [
      'Partner: AgroTrade France',
      'Opportunity: Pilot distribution partner',
      'Country: France',
      'URL: https://agrotrade.example',
      'Why relevant: Strong distribution channel for agro commodity workflows.'
    ].join('\n')
  )
  const candidate = parsed.candidates[0]

  assert.ok(candidate.fitScore >= 78)
  assert.match(candidate.missingInfo, /decision maker/)
  assert.match(candidate.missingInfo, /pilot budget/)
  assert.match(candidate.nextAction, /partner intro/)
})

test('owner pasted source adapter scores investor and accelerator candidates by scenario', () => {
  const investorJob = createFinderSearchJob(
    {
      kind: 'investor',
      label: 'Agri seed funds',
      query: 'agri commodity seed funds europe'
    },
    { id: 'investor-scoring-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const acceleratorJob = createFinderSearchJob(
    {
      kind: 'accelerator',
      label: 'Agri accelerators Europe',
      query: 'agtech accelerator europe seed program'
    },
    { id: 'accelerator-scoring-source', now: '2026-07-23T09:00:00.000Z' }
  )
  const investor = createFinderCandidatesFromOwnerPastedSource(
    investorJob,
    [
      'Fund: Green Seed Capital',
      'Focus: Agri infrastructure',
      'Geography: Europe',
      'Website: https://greenseed.example',
      'Contact: intro@greenseed.example'
    ].join('\n')
  ).candidates[0]
  const accelerator = createFinderCandidatesFromOwnerPastedSource(
    acceleratorJob,
    [
      'AgriTech Europe Accelerator',
      'Applications close September 30, 2026',
      'Paris / Remote',
      'For climate and agricultural infrastructure startups.',
      'https://accelerator.example/apply'
    ].join('\n')
  ).candidates[0]

  assert.ok(investor.fitScore >= 82)
  assert.match(investor.missingInfo, /ticket size/)
  assert.match(investor.nextAction, /investor intro/)
  assert.ok(accelerator.fitScore >= 80)
  assert.match(accelerator.missingInfo, /program terms/)
  assert.match(accelerator.nextAction, /application/)
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

test('finder decision queue marks import hold and reject candidates', () => {
  const job = createFinderSearchJob(
    { kind: 'partner', label: 'Partners', query: 'agri logistics france' },
    { id: 'job-decision', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const importNow = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:import-now',
      partnerName: 'AgriFlow France',
      title: 'Strategic logistics partner',
      summary: 'Strong target with direct fit.',
      links: ['https://agriflow.example/partners'],
      fitScore: 88,
      whyRelevant: 'Matches French rollout and commodity flows.',
      nextAction: 'Prepare partner intro and call notes.'
    },
    { id: 'import-now', now: '2026-07-22T10:01:00.000Z' }
  )
  const holdSoon = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:hold-soon',
      partnerName: 'Canal Market',
      title: 'Regional partner',
      summary: 'Promising but still incomplete.',
      fitScore: 72,
      whyRelevant: 'Likely channel fit.',
      missingInfo: 'Verify contact, terms before outreach.'
    },
    { id: 'hold-soon', now: '2026-07-22T10:02:00.000Z' }
  )
  const rejectLater = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:reject-later',
      partnerName: 'Unknown',
      title: 'Lead',
      summary: 'Sparse source.',
      fitScore: 34
    },
    { id: 'reject-later', now: '2026-07-22T10:03:00.000Z' }
  )

  const importDecision = buildFinderDecisionQueueItem(importNow)
  const holdDecision = buildFinderDecisionQueueItem(holdSoon)
  const rejectDecision = buildFinderDecisionQueueItem(rejectLater)

  assert.equal(importDecision.recommendation, 'import')
  assert.equal(importDecision.priority, 'now')
  assert.match(importDecision.summary, /Import first/i)
  assert.equal(holdDecision.recommendation, 'hold')
  assert.equal(holdDecision.priority, 'soon')
  assert.equal(rejectDecision.recommendation, 'reject')
  assert.equal(rejectDecision.priority, 'later')

  assert.deepEqual(
    summarizeFinderDecisionQueue([importNow, holdSoon, rejectLater]),
    {
      importCount: 1,
      holdCount: 1,
      rejectCount: 1,
      nowCount: 1,
      soonCount: 1,
      laterCount: 1
    }
  )
})

test('finder pipeline decision sort prioritizes import queue before hold and reject', () => {
  const job = createFinderSearchJob(
    { kind: 'investor', label: 'Funds', query: 'climate agri investors' },
    { id: 'job-decision-sort', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const rejected = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:rejected',
        partnerName: 'Rejected Fund',
        title: 'Fund',
        summary: 'Already rejected.',
        fitScore: 90
      },
      { id: 'rejected', now: '2026-07-22T10:03:00.000Z' }
    ),
    status: 'rejected'
  }
  const hold = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:hold',
      partnerName: 'Hold Fund',
      title: 'Seed fund',
      summary: 'Needs more checks.',
      fitScore: 70,
      whyRelevant: 'Possible fit.'
    },
    { id: 'hold', now: '2026-07-22T10:02:00.000Z' }
  )
  const importNow = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:import',
      partnerName: 'Import Fund',
      title: 'Climate agri fund',
      summary: 'Strong target.',
      links: ['https://importfund.example'],
      fitScore: 89,
      whyRelevant: 'Clear thematic fit.',
      nextAction: 'Prepare investor intro.'
    },
    { id: 'import', now: '2026-07-22T10:01:00.000Z' }
  )

  assert.deepEqual(
    createFinderPipelineView([rejected, hold, importNow], {
      sortMode: 'decision'
    }).map((candidate) => candidate.id),
    ['import', 'hold', 'rejected']
  )
})

test('finder pipeline decision filter respects explicit hold and reject states', () => {
  const job = createFinderSearchJob(
    { kind: 'partner', label: 'Partners', query: 'france agri partners' },
    { id: 'job-decision-filter', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const autoImport = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:auto-import',
      partnerName: 'Auto Import',
      title: 'Partner',
      summary: 'Strong fit.',
      links: ['https://auto-import.example'],
      fitScore: 88,
      whyRelevant: 'Direct fit.',
      nextAction: 'Prepare intro.'
    },
    { id: 'auto-import', now: '2026-07-22T10:01:00.000Z' }
  )
  const held = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:partner:held',
        partnerName: 'Held Candidate',
        title: 'Partner',
        summary: 'Needs later review.',
        fitScore: 84,
        whyRelevant: 'Still good.'
      },
      { id: 'held', now: '2026-07-22T10:02:00.000Z' }
    ),
    decision: {
      state: 'hold_later',
      reason: 'wait until current outreach batch is done',
      updatedAt: '2026-07-22T10:03:00.000Z'
    }
  }
  const rejected = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:partner:rejected',
        partnerName: 'Rejected Candidate',
        title: 'Partner',
        summary: 'Weak fit.',
        fitScore: 48
      },
      { id: 'rejected-explicit', now: '2026-07-22T10:04:00.000Z' }
    ),
    decision: {
      state: 'rejected',
      reason: 'outside current geography',
      updatedAt: '2026-07-22T10:05:00.000Z'
    },
    status: 'rejected'
  }

  assert.deepEqual(
    createFinderPipelineView([autoImport, held, rejected], {
      decision: 'hold'
    }).map((candidate) => candidate.id),
    ['held']
  )
  assert.deepEqual(
    createFinderPipelineView([autoImport, held, rejected], {
      decision: 'reject'
    }).map((candidate) => candidate.id),
    ['rejected-explicit']
  )
  assert.match(buildFinderDecisionQueueItem(held).summary, /Held for later/i)
  assert.match(buildFinderDecisionQueueItem(rejected).summary, /Rejected with reason/i)
})

test('finder queue review columns group import hold and reject lanes with explicit counts', () => {
  const job = createFinderSearchJob(
    { kind: 'partner', label: 'Queue board', query: 'france partners' },
    { id: 'job-queue-board', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const importCandidate = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:queue-import',
      partnerName: 'Queue Import',
      title: 'Partner',
      summary: 'Strong target.',
      links: ['https://queue-import.example'],
      fitScore: 89,
      whyRelevant: 'Direct fit.',
      nextAction: 'Prepare intro.'
    },
    { id: 'queue-import', now: '2026-07-22T10:01:00.000Z' }
  )
  const heldCandidate = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:partner:queue-hold',
        partnerName: 'Queue Hold',
        title: 'Partner',
        summary: 'Pause until next batch.',
        fitScore: 78
      },
      { id: 'queue-hold', now: '2026-07-22T10:02:00.000Z' }
    ),
    decision: {
      state: 'hold_later',
      updatedAt: '2026-07-22T10:03:00.000Z'
    }
  }
  const rejectedCandidate = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:partner:queue-reject',
        partnerName: 'Queue Reject',
        title: 'Partner',
        summary: 'Wrong target.',
        fitScore: 45
      },
      { id: 'queue-reject', now: '2026-07-22T10:04:00.000Z' }
    ),
    status: 'rejected',
    decision: {
      state: 'rejected',
      reason: 'wrong market',
      updatedAt: '2026-07-22T10:05:00.000Z'
    }
  }

  const columns = buildFinderQueueReviewColumns([
    rejectedCandidate,
    heldCandidate,
    importCandidate
  ])

  assert.deepEqual(columns.map((column) => column.lane), ['import', 'hold', 'reject'])
  assert.deepEqual(columns[0].items.map((item) => item.result.id), ['queue-import'])
  assert.deepEqual(columns[1].items.map((item) => item.result.id), ['queue-hold'])
  assert.deepEqual(columns[2].items.map((item) => item.result.id), ['queue-reject'])
  assert.equal(columns[0].explicitCount, 0)
  assert.equal(columns[1].explicitCount, 1)
  assert.equal(columns[2].explicitCount, 1)
})

test('finder queue import plan applies eligibility gates and duplicate suppression', () => {
  const job = createFinderSearchJob(
    { kind: 'investor', label: 'Queue plan test', query: 'seed and growth investors' },
    { id: 'job-queue-plan', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const eligibleImport = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:coqpi-ready',
      partnerName: 'Ready Fund',
      title: 'Seed investor',
      summary: 'Clear investor profile with strong relevance signals.',
      links: ['https://example.com/ready-fund'],
      fitScore: 86,
      whyRelevant: 'Clear synergy with portfolio thesis.',
      nextAction: 'Introduce with short context.'
    },
    { id: 'result-ready', now: '2026-07-22T10:01:00.000Z' }
  )

  const weakResult = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:coqpi-weak',
        partnerName: 'Weak Fund',
        title: 'Potential partner',
        summary: 'Only minimal data and no practical evidence yet.',
        fitScore: 42
      },
      { id: 'result-weak', now: '2026-07-22T10:02:00.000Z' }
    ),
    decision: {
      state: 'auto',
      updatedAt: '2026-07-22T10:02:00.000Z'
    }
  }

  const duplicateInBatch = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:coqpi-dup',
        partnerName: 'Dup Investor',
        title: 'Duplicate test',
        summary: 'This candidate appears twice from parser run.',
        links: ['https://example.com/dup'],
        fitScore: 84,
        whyRelevant: 'Good fit at first glance.',
        nextAction: 'Follow-up when source is cleaned.'
      },
      { id: 'result-dup-a', now: '2026-07-22T10:03:00.000Z' }
    ),
    sourceId: 'finder:investor:coqpi-dup',
    kind: 'investor',
    decision: { state: 'auto', updatedAt: '2026-07-22T10:03:00.000Z' }
  }

  const duplicateInBatchB = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:coqpi-dup',
        partnerName: 'Dup Investor (copy)',
        title: 'Duplicate test',
        summary: 'Second occurrence of same source id.',
        links: ['https://example.com/dup'],
        fitScore: 84,
        whyRelevant: 'Good fit at first glance.',
        nextAction: 'Follow-up when source is cleaned.'
      },
      { id: 'result-dup-b', now: '2026-07-22T10:04:00.000Z' }
    ),
    sourceId: 'finder:investor:coqpi-dup',
    kind: 'investor',
    decision: { state: 'auto', updatedAt: '2026-07-22T10:04:00.000Z' }
  }

  const importedConflict = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:coqpi-existing',
        partnerName: 'Already in packs',
        title: 'Existing pack',
        summary: 'This source id is already in live packs.',
        links: ['https://example.com/existing'],
        fitScore: 90,
        whyRelevant: 'Relevant for pre-built context.',
        nextAction: 'Use in current queue only after review.'
      },
      { id: 'result-existing', now: '2026-07-22T10:05:00.000Z' }
    ),
    status: 'ready'
  }

  const explicitImport = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:coqpi-explicit',
        partnerName: 'Explicit import',
        title: 'Needs explicit import now',
        summary: 'Weak candidate moved to import now by user.',
        fitScore: 45,
        nextAction: ''
      },
      { id: 'result-explicit', now: '2026-07-22T10:06:00.000Z' }
    ),
    decision: {
      state: 'import_now',
      reason: 'reviewed manually',
      updatedAt: '2026-07-22T10:06:00.000Z'
    }
  }

  const notReady = {
    ...createFinderCandidateResult(
      job,
      {
        sourceId: 'finder:investor:coqpi-imported',
        partnerName: 'Imported candidate',
        title: 'Already imported',
        summary: 'Should not be re-imported from queue.',
        fitScore: 87,
        whyRelevant: 'Used to compare states.',
        nextAction: 'No action now.'
      },
      { id: 'result-not-ready', now: '2026-07-22T10:07:00.000Z' }
    ),
    status: 'imported'
  }

  const plan = buildFinderQueueImportPlan(
    [
      duplicateInBatch,
      duplicateInBatchB,
      eligibleImport,
      explicitImport,
      weakResult,
      importedConflict,
      notReady
    ],
    {
      existingSourceKeys: new Set(['finder:investor:coqpi-existing::investor'])
    }
  )

  assert.deepEqual(plan.importable.map((item) => item.id), [
    'result-dup-a',
    'result-ready',
    'result-explicit'
  ])
  assert.equal(plan.skipped.length, 4)
  assert.equal(
    plan.skipped.some((item) => item.reason === 'not-ready'),
    true
  )
  assert.equal(
    plan.skipped.some((item) => item.reason === 'weak-needs-confirmation'),
    true
  )
  assert.equal(
    plan.skipped.some((item) => item.reason === 'duplicate-source'),
    true
  )
})

test('finder candidate score explanation surfaces reasons and improvements', () => {
  const job = createFinderSearchJob(
    { kind: 'job', label: 'Jobs', query: 'product manager france' },
    { id: 'job-score-explain', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const strong = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:job:strong-explained',
      partnerName: 'Northfield Labs',
      title: 'Senior Product Manager',
      summary:
        'Owner source. Location: Paris, France. Contact: hiring@northfield.example. Deadline: 2026-08-15.',
      links: ['https://northfield.example/careers'],
      fitScore: 90,
      whyRelevant: 'Product management role in French agtech market.',
      missingInfo: 'Verify salary range, remote policy before outreach.',
      nextAction: 'Prepare tailored CV/interview pack.'
    },
    { id: 'strong-explained', now: '2026-07-22T10:01:00.000Z' }
  )
  const weak = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:job:weak-explained',
      partnerName: 'Unknown Role',
      title: 'Product role',
      summary: 'Sparse source.',
      fitScore: 55,
      missingInfo:
        'Verify source URL, contact, salary range, interview process before outreach.'
    },
    { id: 'weak-explained', now: '2026-07-22T10:02:00.000Z' }
  )
  const strongExplanation = explainFinderCandidateScore(strong)
  const weakExplanation = explainFinderCandidateScore(weak)

  assert.equal(strongExplanation.fitLabel, '90/100 strong')
  assert.match(strongExplanation.scoreReason, /Strong/)
  assert.ok(strongExplanation.positiveSignals.includes('source link'))
  assert.ok(strongExplanation.positiveSignals.includes('contact'))
  assert.ok(strongExplanation.positiveSignals.includes('deadline'))
  assert.ok(strongExplanation.improvements.includes('salary range'))
  assert.equal(weakExplanation.fitLabel, '55/100 weak')
  assert.match(weakExplanation.scoreReason, /Weak/)
  assert.ok(weakExplanation.improvements.includes('source URL'))
  assert.ok(weakExplanation.improvements.includes('interview process'))
})

test('finder outreach pipeline connects score, draft and session handoff', () => {
  const job = createFinderSearchJob(
    { kind: 'investor', label: 'Agri funds', query: 'agri seed fund france' },
    { id: 'job-outreach-v2', now: '2026-07-26T10:00:00.000Z', status: 'ready' }
  )
  const strong = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:seed-v2',
      partnerName: 'Seed V2 Fund',
      title: 'Agri seed fund',
      summary:
        'Public source. France mandate. Contact: partner@seedv2.example. Ticket size: €250k-€1m.',
      context: 'Portfolio includes agri infrastructure and commodity workflow software.',
      links: ['https://seedv2.example'],
      fitScore: 88,
      whyRelevant: 'Matches agri commodity ecosystem fundraising and France expansion.',
      missingInfo: 'Verify decision maker and current thesis.',
      nextAction: 'Prepare investor intro and thesis-fit questions.'
    },
    { id: 'candidate-outreach-v2', now: '2026-07-26T10:01:00.000Z' }
  )
  const draft = {
    ...createFinderOutreachDraft(job, strong, {
      id: 'draft-outreach-v2',
      now: '2026-07-26T10:02:00.000Z'
    }),
    status: 'ready_for_contact',
    statusHistory: [
      {
        status: 'ready_for_contact',
        at: '2026-07-26T10:03:00.000Z',
        reason: 'owner reviewed draft'
      }
    ]
  }
  const strongPipeline = buildFinderCandidateOutreachPipeline({
    job,
    result: strong,
    draft,
    selected: true,
    confirmedWeakImport: false
  })

  assert.equal(strongPipeline.score.fitLabel, '88/100 strong')
  assert.equal(strongPipeline.importDecision.tier, 'ready')
  assert.equal(strongPipeline.queue.recommendation, 'import')
  assert.equal(strongPipeline.draft.status, 'ready_for_contact')
  assert.equal(strongPipeline.sessionHandoff.state, 'ready')
  assert.equal(strongPipeline.sessionHandoff.included, true)
  assert.match(strongPipeline.recommendedAction, /Use ready draft in session/)
  assert.ok(strongPipeline.prep.openingMessage.includes('Seed V2 Fund'))

  const weak = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:weak-v2',
      partnerName: 'Sparse Fund',
      title: 'Fund',
      summary: 'Sparse source only.',
      fitScore: 42,
      missingInfo: 'Verify source URL, contact, ticket size, investment stage.'
    },
    { id: 'candidate-outreach-weak-v2', now: '2026-07-26T10:04:00.000Z' }
  )
  const weakPipeline = buildFinderCandidateOutreachPipeline({
    job,
    result: weak,
    selected: true,
    confirmedWeakImport: false
  })

  assert.equal(weakPipeline.importDecision.tier, 'weak')
  assert.equal(weakPipeline.importDecision.canImport, false)
  assert.equal(weakPipeline.queue.recommendation, 'reject')
  assert.equal(weakPipeline.sessionHandoff.included, false)
  assert.match(weakPipeline.recommendedAction, /Enrich before outreach/)
})

test('finder preview quality review shows ready vs weak field completion states', () => {
  const job = createFinderSearchJob(
    { kind: 'job', label: 'Jobs', query: 'product manager france' },
    { id: 'job-quality-review', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const ready = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:job:quality-ready',
      partnerName: 'Northfield Labs',
      title: 'Senior Product Manager',
      summary:
        'Owner source. Location: Paris, France. Contact: hiring@northfield.example.',
      links: ['https://northfield.example/careers'],
      fitScore: 89,
      whyRelevant: 'Product management role in French agtech market.',
      missingInfo: 'Verify salary range before outreach.',
      nextAction: 'Prepare tailored interview pack.'
    },
    { id: 'quality-ready', now: '2026-07-22T10:01:00.000Z' }
  )
  const weak = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:job:quality-weak',
      partnerName: 'Unknown role',
      title: 'Product role',
      summary: 'Sparse source.',
      fitScore: 54,
      missingInfo:
        'Verify source URL, contact, why relevant, next action before outreach.'
    },
    { id: 'quality-weak', now: '2026-07-22T10:02:00.000Z' }
  )

  const readyReview = reviewFinderPreviewCandidateQuality(ready)
  const weakReview = reviewFinderPreviewCandidateQuality(weak)

  assert.equal(readyReview.level, 'ready')
  assert.equal(readyReview.label, 'ready for import')
  assert.equal(readyReview.retrievalReady, true)
  assert.equal(readyReview.missingCriticalFields.length, 0)
  assert.ok(readyReview.suggestedEdits.includes('Clarify salary range'))

  assert.equal(weakReview.level, 'weak')
  assert.equal(weakReview.retrievalReady, false)
  assert.ok(weakReview.missingCriticalFields.includes('source URL'))
  assert.ok(weakReview.missingCriticalFields.includes('contact'))
  assert.ok(weakReview.missingCriticalFields.includes('why relevant'))
  assert.ok(weakReview.missingCriticalFields.includes('next action'))
  const weakActions = buildFinderPreviewCompletionActions(weak, weakReview)
  assert.ok(weakActions.some((action) => action.id === 'add-source-url'))
  assert.ok(weakActions.some((action) => action.id === 'add-contact'))
  assert.ok(weakActions.some((action) => action.id === 'add-why-relevant'))
  assert.ok(weakActions.some((action) => action.id === 'add-next-action'))
  const readyDecision = getFinderPreviewImportDecision({
    review: readyReview,
    selected: true,
    confirmed: false
  })
  const weakDecision = getFinderPreviewImportDecision({
    review: weakReview,
    selected: true,
    confirmed: false
  })
  const confirmedWeakDecision = getFinderPreviewImportDecision({
    review: weakReview,
    selected: true,
    confirmed: true
  })

  assert.equal(readyDecision.canAutoSelect, true)
  assert.equal(readyDecision.canImport, true)
  assert.equal(weakDecision.requiresConfirmation, true)
  assert.equal(weakDecision.canImport, false)
  assert.equal(confirmedWeakDecision.canImport, true)
})

test('finder outreach prep pack summarizes what to say and ask', () => {
  const job = createFinderSearchJob(
    {
      kind: 'job',
      label: 'France product roles',
      query: 'senior product manager france agtech',
      goal: 'Prepare interview outreach'
    },
    { id: 'job-3', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const result = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:job:northfield',
      partnerName: 'Northfield Labs',
      title: 'AI Product Lead',
      summary: 'Product leadership role with AI workflow focus.',
      context: 'The role mentions partner-facing product discovery.',
      links: ['https://example.com/northfield'],
      fitScore: 91,
      whyRelevant: 'Matches AI product leadership and France search.',
      missingInfo: 'Salary range; Remote policy',
      nextAction: 'Prepare a focused intro before applying.'
    },
    { id: 'result-3', now: '2026-07-22T10:02:00.000Z' }
  )
  const prep = createFinderOutreachPrepPack(job, result)

  assert.equal(prep.targetName, 'Northfield Labs')
  assert.equal(prep.opportunity, 'AI Product Lead')
  assert.equal(prep.fitLabel, '91/100 strong')
  assert.equal(prep.whyRelevant, 'Matches AI product leadership and France search.')
  assert.deepEqual(prep.questionsToAsk.slice(0, 2), [
    'Clarify: Salary range',
    'Clarify: Remote policy'
  ])
  assert.match(prep.openingMessage, /I saw the AI Product Lead opportunity/)
  assert.equal(prep.nextAction, 'Prepare a focused intro before applying.')
  assert.deepEqual(prep.warnings, [])
})

test('finder outreach prep pack stays explicit when review fields are weak', () => {
  const job = createFinderSearchJob(
    { kind: 'partner', label: 'France partners', query: 'agri logistics france' },
    { id: 'job-4', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const result = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:partial',
      partnerName: 'Partial Partner',
      title: 'Potential logistics partner',
      summary: 'Possible partner but still underqualified.'
    },
    { id: 'result-4', now: '2026-07-22T10:02:00.000Z' }
  )
  const prep = createFinderOutreachPrepPack(job, result)

  assert.equal(prep.fitLabel, 'not scored')
  assert.equal(prep.whyRelevant, 'Possible partner but still underqualified.')
  assert.match(prep.nextAction, /Review missing info/)
  assert.deepEqual(prep.warnings, [
    'Add fitScore before prioritizing outreach.',
    'Add whyRelevant to make the opening more specific.',
    'Add nextAction to make follow-up explicit.',
    'Add at least one source link for provenance.'
  ])
})

test('finder outreach draft handoff stores prep content as a local draft', () => {
  const job = createFinderSearchJob(
    { kind: 'investor', label: 'Funds', query: 'agri seed funds' },
    { id: 'job-5', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const result = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:investor:green-seed',
      partnerName: 'Green Seed Capital',
      title: 'Climate/agri seed fund',
      summary: 'Seed investor focused on climate and agri infrastructure.',
      fitScore: 90,
      whyRelevant: 'Strong thesis match.',
      missingInfo: 'Need current fund stage.',
      nextAction: 'Prepare a warm intro draft.'
    },
    { id: 'result-5', now: '2026-07-22T10:02:00.000Z' }
  )
  const draft = createFinderOutreachDraft(job, result, {
    id: 'draft-1',
    now: '2026-07-22T10:04:00.000Z'
  })

  assert.equal(draft.version, 1)
  assert.equal(draft.id, 'draft-1')
  assert.equal(draft.jobId, 'job-5')
  assert.equal(draft.candidateResultId, 'result-5')
  assert.equal(draft.status, 'draft')
  assert.equal(draft.targetName, 'Green Seed Capital')
  assert.match(draft.openingMessage, /I saw your work around/)
  assert.equal(draft.nextAction, 'Prepare a warm intro draft.')
})

test('finder outreach draft export is manual and source-bound', () => {
  const job = createFinderSearchJob(
    { kind: 'job', label: 'Jobs', query: 'product manager' },
    { id: 'job-6', now: '2026-07-22T10:00:00.000Z', status: 'ready' }
  )
  const result = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:job:export',
      partnerName: 'Export Target',
      title: 'Senior PM',
      summary: 'Relevant role.',
      context: 'Company works on AI workflows.',
      links: ['https://example.com/export'],
      fitScore: 84,
      whyRelevant: 'Good product leadership fit.',
      missingInfo: 'Hiring manager',
      nextAction: 'Send only after manual review.'
    },
    { id: 'result-6', now: '2026-07-22T10:02:00.000Z' }
  )
  const draft = createFinderOutreachDraft(job, result, {
    id: 'draft-6',
    now: '2026-07-22T10:04:00.000Z'
  })
  const exportText = formatFinderOutreachDraftForExport(draft)

  assert.match(exportText, /^# CoqPi Finder Outreach Draft/)
  assert.match(exportText, /Local draft only\. Nothing has been sent externally\./)
  assert.match(exportText, /Target: Export Target/)
  assert.match(exportText, /Source: finder:job:export/)
  assert.match(exportText, /## Opening Message/)
  assert.match(exportText, /- Clarify: Hiring manager/)
  assert.doesNotMatch(exportText, /send email|smtp|api/i)
})

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildContextPackDraftFromKnowledgeExtraction,
  extractKnowledgeFieldsFromReadableText
} = require('../dist-electron/shared/knowledge-extraction.js')

test('extracts compact owner and role fields from markdown without raw body', () => {
  const extraction = extractKnowledgeFieldsFromReadableText(
    [
      '# Private CV',
      '- Owner profile: I lead AI product strategy and agri ecosystem projects.',
      '- Role: Senior Product Manager interview with a French company.',
      '- Deadline: 2026-08-01',
      '- Link: https://example.com/job'
    ].join('\n'),
    '/tmp/profile.md',
    '2026-07-22T00:00:00.000Z'
  )

  assert.equal(extraction.sourceFormat, 'markdown')
  assert.match(extraction.ownerFacts[0], /AI product strategy/)
  assert.match(extraction.roleFacts[0], /Senior Product Manager/)
  assert.deepEqual(extraction.links, ['https://example.com/job'])
  assert.deepEqual(extraction.dates, ['2026-08-01'])
  assert.deepEqual(extraction.missingFields, [])
  assert.doesNotMatch(JSON.stringify(extraction), /# Private CV/)
})

test('extracts role fields from json and reports missing owner facts', () => {
  const extraction = extractKnowledgeFieldsFromReadableText(
    JSON.stringify({
      company: 'Acme',
      role: 'AI Product Lead',
      deadline: '2026-09-15',
      url: 'https://example.com/acme'
    }),
    '/tmp/job.json',
    '2026-07-22T00:00:00.000Z'
  )

  assert.equal(extraction.sourceFormat, 'json')
  assert.equal(extraction.ownerFacts.length, 0)
  assert.equal(extraction.roleFacts.some((fact) => /AI Product Lead/.test(fact)), true)
  assert.equal(extraction.missingFields.includes('owner facts'), true)
  assert.deepEqual(extraction.links, ['https://example.com/acme'])
})

test('extracts csv-like candidate rows into compact role facts', () => {
  const extraction = extractKnowledgeFieldsFromReadableText(
    [
      'company,role,contact,deadline',
      'Acme,Partner pilot for agri logistics,founder@example.com,2026-10-01'
    ].join('\n'),
    '/tmp/candidates.csv',
    '2026-07-22T00:00:00.000Z'
  )

  assert.equal(extraction.sourceFormat, 'csv')
  assert.equal(extraction.roleFacts.some((fact) => /Partner pilot/.test(fact)), true)
  assert.deepEqual(extraction.dates, ['2026-10-01'])
})

const makeSource = (overrides = {}) => ({
  id: 'source-assembly',
  kind: 'counterparty_material_file',
  location: '/Users/owner/private/materials.md',
  label: 'Acme interview notes',
  selected: true,
  status: 'retrieval_ready',
  createdAt: '2026-07-22T00:00:00.000Z',
  ownerId: 'owner',
  provenance: {
    sourceId: 'coqpi:ingress:source-assembly',
    locatorSha256: 'a'.repeat(64)
  },
  contentHash: 'b'.repeat(64),
  extraction: {
    version: 1,
    sourceFormat: 'markdown',
    extractedAt: '2026-07-22T00:00:00.000Z',
    ownerFacts: ['Owner profile: AI product strategy and agri ecosystem work.'],
    roleFacts: ['Role: Senior Product Manager interview with Acme.'],
    links: ['https://example.com/job'],
    dates: ['2026-08-01'],
    missingFields: ['salary range']
  },
  classification: 'private',
  retention: {
    mode: 'manual_deletion_required',
    maxAgeDays: 30,
    expiresAt: '2026-08-21T00:00:00.000Z'
  },
  retrievalScopes: ['coqpi_interview_en_fr'],
  promotion: 'explicit_audit_required',
  ...overrides
})

test('assembles unselected context pack draft from reviewed extraction fields only', () => {
  const draft = buildContextPackDraftFromKnowledgeExtraction(makeSource())

  assert.equal(draft.sourceId, 'knowledge:source-assembly')
  assert.equal(draft.kind, 'job')
  assert.equal(draft.partnerName, 'Acme interview notes')
  assert.equal(draft.title, 'Acme interview notes')
  assert.match(draft.summary, /AI product strategy/)
  assert.match(draft.summary, /Senior Product Manager/)
  assert.match(draft.context, /Missing fields to review: salary range/)
  assert.deepEqual(draft.links, ['https://example.com/job'])
  assert.equal(draft.selected, false)
  assert.doesNotMatch(JSON.stringify(draft), /private\/materials\.md/)
})

test('refuses knowledge pack assembly before compact extraction exists', () => {
  assert.throws(
    () =>
      buildContextPackDraftFromKnowledgeExtraction(
        makeSource({ extraction: null, status: 'pending_classification' })
      ),
    /requires reviewed extracted fields/
  )
})

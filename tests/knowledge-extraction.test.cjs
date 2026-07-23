const assert = require('node:assert/strict')
const test = require('node:test')

const {
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

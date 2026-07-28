const assert = require('node:assert/strict')
const test = require('node:test')

const {
  rankRetrievalCandidates,
  formatRetrievalQualityMatches
} = require('../dist-electron/shared/retrieval-quality.js')

test('retrieval quality ranks stronger selected candidate sections first', () => {
  const result = rankRetrievalCandidates({
    query: 'AI product transformation leadership',
    candidates: [
      {
        id: 'pack-a',
        sourceId: 'finder:job:a',
        label: 'Northfield Labs · AI Product Lead',
        kind: 'job',
        sections: [
          { label: 'title', text: 'AI Product Lead', weight: 8 },
          {
            label: 'summary',
            text: 'AI transformation leadership and product discovery.',
            weight: 7
          }
        ]
      },
      {
        id: 'pack-b',
        sourceId: 'finder:partner:b',
        label: 'Other Partner · Pilot',
        kind: 'partner',
        sections: [
          { label: 'summary', text: 'Pilot project support only.', weight: 7 }
        ]
      }
    ]
  })

  assert.deepEqual(result.matches.map((match) => match.id), ['pack-a'])
  assert.equal(result.matches[0].fallbackUsed, false)
  assert.match(
    formatRetrievalQualityMatches(result),
    /matched product, transformation, leadership/i
  )
})

test('retrieval quality falls back to selected candidate when lexical overlap is absent', () => {
  const result = rankRetrievalCandidates({
    query: 'Can you introduce yourself briefly?',
    candidates: [
      {
        id: 'pack-a',
        sourceId: 'finder:job:a',
        label: 'Northfield Labs · AI Product Lead',
        kind: 'job',
        fallbackPriority: 12,
        sections: [
          { label: 'title', text: 'AI Product Lead', weight: 8 },
          {
            label: 'summary',
            text: 'Focused interview pack for AI product leadership in France.',
            weight: 7
          }
        ]
      }
    ]
  })

  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].fallbackUsed, true)
  assert.match(formatRetrievalQualityMatches(result), /selected fallback/i)
  assert.match(formatRetrievalQualityMatches(result), /AI Product Lead/)
})

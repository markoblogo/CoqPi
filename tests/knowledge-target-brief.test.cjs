const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildKnowledgeToFinderTargetBrief,
  formatKnowledgeToFinderTargetBrief
} = require('../dist-electron/shared/knowledge-target-brief.js')

const retention = {
  mode: 'manual_deletion_required',
  maxAgeDays: 30,
  expiresAt: '2099-08-21T10:00:00.000Z'
}

const makeMemoryRecord = (overrides = {}) => ({
  version: 1,
  id: 'memory:owner:fact',
  entityId: 'source:owner-cv',
  entityLabel: 'Owner CV',
  kind: 'fact',
  sourceType: 'context_source',
  sourceId: 'coqpi:ingress:owner-cv',
  title: 'Owner facts',
  content: 'Led AI product discovery for agri commodity workflows.',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:05:00.000Z',
  classification: 'private',
  retention,
  scopes: ['coqpi_interview_en_fr'],
  confidence: 0.86,
  assistantEligible: true,
  evidenceRefs: ['source-owner'],
  ...overrides
})

const makeMemoryState = () => ({
  version: 1,
  records: [
    makeMemoryRecord({
      id: 'memory:owner:ai-product',
      content:
        'Led AI product discovery and workflow transformation in agri commodity operations.',
      evidenceRefs: ['source-owner', 'owner-fact-ai']
    }),
    makeMemoryRecord({
      id: 'memory:owner:editorial',
      content:
        'Published travel guides and editorial content for Menton tourism.',
      evidenceRefs: ['source-owner', 'owner-fact-editorial']
    }),
    makeMemoryRecord({
      id: 'memory:target:summary',
      entityId: 'target:finder:job:northfield',
      entityLabel: 'Northfield Labs · AI Product Lead',
      sourceType: 'counterparty_pack',
      sourceId: 'coqpi:finder:finder:job:northfield',
      title: 'Northfield Labs session pack',
      content:
        'Northfield Labs needs AI product leadership for workflow transformation.',
      evidenceRefs: ['pack-northfield']
    })
  ],
  assistantView: {
    included: [
      {
        record: makeMemoryRecord({
          id: 'memory:owner:ai-product',
          content:
            'Led AI product discovery and workflow transformation in agri commodity operations.',
          evidenceRefs: ['source-owner', 'owner-fact-ai']
        }),
        status: 'included',
        reason: 'eligible selected local memory'
      },
      {
        record: makeMemoryRecord({
          id: 'memory:owner:editorial',
          content:
            'Published travel guides and editorial content for Menton tourism.',
          evidenceRefs: ['source-owner', 'owner-fact-editorial']
        }),
        status: 'included',
        reason: 'eligible selected local memory'
      },
      {
        record: makeMemoryRecord({
          id: 'memory:target:summary',
          entityId: 'target:finder:job:northfield',
          entityLabel: 'Northfield Labs · AI Product Lead',
          sourceType: 'counterparty_pack',
          sourceId: 'coqpi:finder:finder:job:northfield',
          title: 'Northfield Labs session pack',
          content:
            'Northfield Labs needs AI product leadership for workflow transformation.',
          evidenceRefs: ['pack-northfield']
        }),
        status: 'included',
        reason: 'eligible selected local memory'
      }
    ],
    dropped: [
      {
        record: makeMemoryRecord({
          id: 'memory:target:cobalt',
          entityId: 'target:finder:investor:cobalt',
          entityLabel: 'Cobalt Seed · Investor',
          sourceType: 'counterparty_pack',
          sourceId: 'coqpi:finder:finder:investor:cobalt',
          title: 'Cobalt investor pack',
          content: 'Cobalt Seed is an investor target.',
          evidenceRefs: ['pack-cobalt']
        }),
        status: 'dropped',
        reason: 'not selected for the current session'
      }
    ]
  }
})

const selectedPack = {
  version: 1,
  id: 'pack-northfield',
  sourceId: 'finder:job:northfield',
  kind: 'job',
  partnerName: 'Northfield Labs',
  title: 'AI Product Lead',
  summary: 'Hiring for AI product leadership and workflow transformation.',
  context:
    'Interview should focus on discovery, product strategy and practical AI delivery.',
  links: ['https://example.com/northfield'],
  selected: true,
  status: 'retrieval_ready',
  createdAt: '2026-07-22T10:00:00.000Z',
  ownerId: 'owner',
  provenance: {
    sourceId: 'coqpi:finder:finder:job:northfield',
    locatorSha256: '1'.repeat(64)
  },
  contentHash: '2'.repeat(64),
  classification: 'private',
  retention,
  retrievalScopes: ['coqpi_interview_en_fr'],
  promotion: 'explicit_audit_required'
}

test('knowledge-to-finder brief matches owner facts to selected target and avoids unrelated facts', () => {
  const brief = buildKnowledgeToFinderTargetBrief({
    memoryState: makeMemoryState(),
    selectedPacks: [selectedPack],
    maxFacts: 3
  })

  assert.equal(brief.targetLabel, 'Northfield Labs · AI Product Lead')
  assert.equal(brief.level, 'strong')
  assert.equal(brief.useFacts.length, 1)
  assert.match(brief.useFacts[0].text, /AI product discovery/)
  assert.deepEqual(brief.useFacts[0].evidenceRefs, ['source-owner', 'owner-fact-ai'])
  assert.equal(brief.avoidFacts.length, 1)
  assert.match(brief.avoidFacts[0].text, /travel guides/)
  assert.doesNotMatch(formatKnowledgeToFinderTargetBrief(brief), /Cobalt Seed/)
  assert.match(formatKnowledgeToFinderTargetBrief(brief), /Questions to prepare/)
  assert.match(formatKnowledgeToFinderTargetBrief(brief), /90-day/)
})

test('knowledge-to-finder brief abstains when selected target has no matching owner facts', () => {
  const brief = buildKnowledgeToFinderTargetBrief({
    memoryState: {
      ...makeMemoryState(),
      records: [
        makeMemoryRecord({
          id: 'memory:owner:tourism',
          content: 'Published local tourism guides and short editorial notes.',
          evidenceRefs: ['source-owner', 'owner-fact-tourism']
        })
      ],
      assistantView: {
        included: [
          {
            record: makeMemoryRecord({
              id: 'memory:owner:tourism',
              content: 'Published local tourism guides and short editorial notes.',
              evidenceRefs: ['source-owner', 'owner-fact-tourism']
            }),
            status: 'included',
            reason: 'eligible selected local memory'
          }
        ],
        dropped: []
      }
    },
    selectedPacks: [selectedPack]
  })

  assert.equal(brief.level, 'weak')
  assert.match(brief.abstainReason ?? '', /No strong owner facts/)
  assert.deepEqual(brief.useFacts, [])
  assert.equal(brief.avoidFacts.length, 1)
})

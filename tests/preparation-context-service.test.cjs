const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildPreparationContextRequest,
  formatPreparationContextResult
} = require('../dist-electron/backend/services/preparation-context-service.js')

const makeSessionContext = (overrides = {}) => ({
  company: 'Northfield Labs',
  role: 'Product Lead',
  context: 'AI product leadership conversation',
  goal: 'Review fit and clarify delivery scope.',
  notes: 'Use recent work and clear constraints.',
  selectedCounterpartyPackIds: [],
  selectedFinderOutreachDraftId: '',
  ...overrides
})

test('buildPreparationContextRequest creates bounded ABVX request', () => {
  const request = buildPreparationContextRequest(makeSessionContext(), 1234567890)

  assert.equal(request.schema_version, 'v1')
  assert.equal(request.consumer, 'coqpi')
  assert.equal(request.intent, 'professional_preparation')
  assert.deepEqual(request.related_projects, ['coqpi'])
  assert.deepEqual(request.provider_hints, ['cortexabv'])
  assert.equal(request.max_items, 6)
  assert.equal(request.context_budget.max_excerpt_chars, 280)
  assert.match(
    request.request_id,
    /^coqpi-prep-northfield-labs-product-lead-1234567890$/
  )
  assert.equal(request.entities.includes('Northfield Labs'), true)
  assert.equal(request.entities.includes('Product Lead'), true)
})

test('formatPreparationContextResult groups partial pack metadata for UI', () => {
  const request = buildPreparationContextRequest(makeSessionContext(), 123)
  const result = formatPreparationContextResult(
    request,
    {
      pack_id: 'product-lead-ai-opportunity',
      generated_at: '2026-08-08T20:30:03Z',
      providers: [{ id: 'cortexabv', status: 'ok', items_returned: 3 }],
      proof_assets: [
        {
          entity_id: 'publication:mn7r-product-guide',
          url: 'https://mn7r.com/how-to-use'
        }
      ],
      constraints: {
        truncated: true,
        available_more: true
      },
      known_gaps: ['Global context budget truncated retrieved knowledge items.'],
      operational_context: [
        {
          project: 'coqpi',
          operational_state: 'WAITING_FOR_HUMAN',
          current_outcome:
            'Pre-live readiness complete; controlled live validation deferred.',
          next_action: 'Controlled real-microphone smoke',
          human_attention_required: true
        }
      ],
      knowledge_items: [
        {
          id: 'item-1',
          category: 'current_focus',
          title: 'Current focus and strongest relevant work',
          summary: 'Recent public work clusters around Decision Map and MN7R.',
          excerpt: 'excerpt-1',
          confidence: 'HIGH',
          provider: 'cortexabv',
          privacy_classification: 'PUBLIC',
          provenance: {
            source: 'cortex-abv/public-presence-index.v1.json'
          }
        },
        {
          id: 'item-2',
          category: 'professional_constraint',
          title: 'Opportunity-preparation constraints',
          summary: 'Prefer recent work and current capabilities.',
          excerpt: 'excerpt-2',
          confidence: 'HIGH',
          provider: 'cortexabv',
          privacy_classification: 'PERSONAL_PRIVATE',
          provenance: {
            source: 'cortex-abv/private-runtime:tenant-memory-bank'
          }
        },
        {
          id: 'publication:mn7r-product-guide',
          category: 'publication',
          title: 'MN7R Product Guide',
          summary: 'A public guide to the current MN7R product.',
          excerpt: 'excerpt-3',
          confidence: 'HIGH',
          provider: 'cortexabv',
          privacy_classification: 'PUBLIC',
          provenance: {
            canonical_url: 'https://abvx.xyz/books/mn7r-product-guide'
          }
        }
      ]
    },
    2048
  )

  assert.equal(result.status, 'partial')
  assert.equal(result.item_count, 3)
  assert.equal(result.pack_bytes, 2048)
  assert.equal(result.truncated, true)
  assert.equal(result.available_more, true)
  assert.equal(
    result.operational_context[0].operational_state,
    'WAITING_FOR_HUMAN'
  )
  assert.equal(result.items[2].proof_url, 'https://mn7r.com/how-to-use')
})

test('formatPreparationContextResult reports unavailable bridge with no items', () => {
  const request = buildPreparationContextRequest(makeSessionContext(), 999)
  const result = formatPreparationContextResult(
    request,
    {
      providers: [{ id: 'cortexabv', status: 'unavailable', items_returned: 0 }],
      constraints: {
        truncated: false,
        available_more: false
      },
      known_gaps: [],
      knowledge_items: []
    },
    128
  )

  assert.equal(result.status, 'unavailable')
  assert.equal(result.item_count, 0)
})

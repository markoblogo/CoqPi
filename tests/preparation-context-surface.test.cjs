const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildPreparationContextSurface
} = require('../dist-electron/shared/preparation-context-surface.js')

test('buildPreparationContextSurface renders compact review sections', () => {
  const surface = buildPreparationContextSurface({
    status: 'partial',
    message: 'Compact preparation context loaded with explicit gaps.',
    request: {
      schema_version: 'v1',
      request_id: 'coqpi-prep-test',
      consumer: 'coqpi',
      task: 'Prepare compact context.',
      intent: 'professional_preparation',
      related_projects: ['coqpi'],
      entities: ['Anton', 'CoqPi'],
      domains: ['professional-context'],
      freshness_requirement: 'CURRENT',
      privacy_domain: 'PERSONAL_PRIVATE',
      max_items: 6,
      context_budget: {
        max_excerpt_chars: 280,
        provider_timeout_seconds: 20,
        token_usage: 'NOT_METERED'
      },
      provider_hints: ['cortexabv']
    },
    pack_id: 'test-pack',
    generated_at: '2026-08-08T12:00:00Z',
    item_count: 3,
    pack_bytes: 1024,
    truncated: true,
    available_more: true,
    known_gaps: ['Global context budget truncated retrieved knowledge items.'],
    provider_statuses: [{ id: 'cortexabv', status: 'ok', items_returned: 3 }],
    operational_context: [],
    items: [
      {
        id: 'focus',
        category: 'current_focus',
        title: 'Current focus',
        summary: 'Recent public work clusters around Decision Map.',
        excerpt: 'focus excerpt',
        confidence: 'HIGH',
        provider: 'cortexabv',
        privacy_classification: 'PUBLIC',
        provenance_label: 'cortex-abv/public-presence-index.v1.json'
      },
      {
        id: 'capability',
        category: 'capabilities',
        title: 'Relevant capabilities',
        summary: 'AI product delivery and validation.',
        excerpt: 'capability excerpt',
        confidence: 'HIGH',
        provider: 'cortexabv',
        privacy_classification: 'PUBLIC',
        provenance_label: 'cortex-abv/public-presence-index.v1.json'
      },
      {
        id: 'constraint',
        category: 'professional_constraint',
        title: 'Preparation constraints',
        summary: 'Prefer recent work over exhaustive history.',
        excerpt: 'constraint excerpt',
        confidence: 'HIGH',
        provider: 'cortexabv',
        privacy_classification: 'PERSONAL_PRIVATE',
        provenance_label: 'cortex-abv/private-runtime:tenant-memory-bank'
      }
    ]
  })

  assert.equal(surface.statusLabel, 'Partial')
  assert.match(surface.statsLabel, /3 items/)
  assert.equal(surface.sections[0].title, 'Current focus')
  assert.equal(
    surface.sections.some((section) => section.id === 'constraints'),
    true
  )
  assert.equal(
    surface.sections.some((section) => section.id === 'known_gaps'),
    true
  )
})

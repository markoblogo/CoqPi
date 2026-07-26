const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSessionPackReviewItems,
  filterSessionPackReviewItems,
  getSessionPackReviewFilterCounts
} = require('../dist-electron/shared/session-pack-review.js')

test('session pack review keeps dropped packs visible for recovery even when pack is no longer available', () => {
  const items = buildSessionPackReviewItems({
    packs: [
      {
        id: 'pack-1',
        kind: 'job',
        partnerName: 'Northfield Labs',
        title: 'Senior Product Lead',
        summary: 'Summary',
        context: '',
        links: [],
        selected: true,
        sourceId: 'finder:job:northfield',
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 365,
          expiresAt: '2027-07-26T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi.interview'],
        ownerId: 'owner',
        provenance: {
          sourceId: 'finder:job:northfield',
          contentHash: 'hash-1'
        }
      }
    ],
    selectedPackIds: ['pack-1', 'pack-missing'],
    droppedPacks: [
      {
        id: 'pack-missing',
        label: 'Missing pack',
        sourceId: 'finder:job:missing',
        reason: 'Pack missing from manifest.',
        selected: true,
        included: false
      }
    ]
  })

  assert.equal(items.length, 2)
  assert.deepEqual(getSessionPackReviewFilterCounts(items), {
    all: 2,
    selected: 2,
    dropped: 1
  })
  assert.deepEqual(
    filterSessionPackReviewItems(items, 'dropped').map((item) => item.id),
    ['pack-missing']
  )
  assert.equal(
    filterSessionPackReviewItems(items, 'dropped')[0].dropReason,
    'Pack missing from manifest.'
  )
})

test('session pack review selected filter keeps only explicitly selected packs', () => {
  const items = buildSessionPackReviewItems({
    packs: [
      {
        id: 'pack-1',
        kind: 'partner',
        partnerName: 'Acme',
        title: 'Partnership call',
        summary: 'Summary',
        context: '',
        links: [],
        selected: true,
        sourceId: 'manual:acme',
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 365,
          expiresAt: '2027-07-26T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi.partner'],
        ownerId: 'owner',
        provenance: {
          sourceId: 'manual:acme',
          contentHash: 'hash-2'
        }
      },
      {
        id: 'pack-2',
        kind: 'investor',
        partnerName: 'North Seed',
        title: 'Investor intro',
        summary: 'Summary',
        context: '',
        links: [],
        selected: false,
        sourceId: 'manual:north-seed',
        createdAt: '2026-07-26T00:00:00.000Z',
        updatedAt: '2026-07-26T00:00:00.000Z',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 365,
          expiresAt: '2027-07-26T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi.investor'],
        ownerId: 'owner',
        provenance: {
          sourceId: 'manual:north-seed',
          contentHash: 'hash-3'
        }
      }
    ],
    selectedPackIds: ['pack-1'],
    droppedPacks: []
  })

  assert.deepEqual(
    filterSessionPackReviewItems(items, 'selected').map((item) => item.id),
    ['pack-1']
  )
  assert.deepEqual(
    filterSessionPackReviewItems(items, 'all').map((item) => item.id),
    ['pack-1', 'pack-2']
  )
})

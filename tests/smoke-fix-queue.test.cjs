const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSmokeFixQueue
} = require('../dist-electron/shared/smoke-fix-queue.js')

const makeNote = (overrides = {}) => ({
  version: 1,
  id: 'note-1',
  createdAt: '2026-07-22T10:00:00.000Z',
  worked: '',
  broken: '',
  nextFix: 'Tune segmentation',
  sessionLabel: 'Northfield Labs · AI Product Lead',
  selectedPackLabel: 'Northfield Labs',
  ...overrides
})

test('smoke fix queue derives pending fixes from note nextFix fields', () => {
  const queue = buildSmokeFixQueue([
    makeNote({ id: 'note-3', nextFix: '  Tune segmentation  ' }),
    makeNote({ id: 'note-2', nextFix: '' }),
    makeNote({ id: 'note-1', nextFix: 'Improve timeout copy' })
  ])

  assert.deepEqual(
    queue.map((item) => item.title),
    ['Tune segmentation', 'Improve timeout copy']
  )
  assert.equal(queue[0].sourceNoteId, 'note-3')
  assert.equal(queue[0].sessionLabel, 'Northfield Labs · AI Product Lead')
})

test('smoke fix queue deduplicates by normalized title and respects limit', () => {
  const queue = buildSmokeFixQueue(
    [
      makeNote({ id: 'note-5', nextFix: 'Tune segmentation' }),
      makeNote({ id: 'note-4', nextFix: ' tune   segmentation ' }),
      makeNote({ id: 'note-3', nextFix: 'Check mic permissions' }),
      makeNote({ id: 'note-2', nextFix: 'Improve stale warning' })
    ],
    2
  )

  assert.deepEqual(
    queue.map((item) => item.sourceNoteId),
    ['note-5', 'note-3']
  )
})

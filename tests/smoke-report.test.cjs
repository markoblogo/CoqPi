const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildSmokeReportText
} = require('../dist-electron/shared/smoke-report.js')

const note = {
  version: 1,
  id: 'note-1',
  createdAt: '2026-07-22T10:00:00.000Z',
  worked: 'Mock assistant returned a short answer.',
  broken: 'Realtime did not hear the first phrase.',
  nextFix: 'Tune mic threshold.',
  sessionLabel: 'Northfield Labs · AI Product Lead',
  selectedPackLabel: 'Northfield Labs'
}

test('smoke report text summarizes latest note and first queued fix', () => {
  const report = buildSmokeReportText(note, [
    {
      id: 'smoke-fix:note-2',
      title: 'Check realtime event diagnostics.',
      sourceNoteId: 'note-2',
      createdAt: '2026-07-22T10:05:00.000Z'
    }
  ])

  assert.match(report, /# CoqPi smoke report/)
  assert.match(report, /Selected pack: Northfield Labs/)
  assert.match(report, /Worked:\nMock assistant returned a short answer\./)
  assert.match(report, /First queued fix:\nCheck realtime event diagnostics\./)
  assert.doesNotMatch(report, /transcript/i)
})

test('smoke report text falls back to note nextFix when queue is empty', () => {
  const report = buildSmokeReportText(
    {
      ...note,
      worked: '',
      broken: '',
      selectedPackLabel: ''
    },
    []
  )

  assert.match(report, /Worked:\nnot recorded/)
  assert.match(report, /Selected pack: not recorded/)
  assert.match(report, /First queued fix:\nTune mic threshold\./)
})

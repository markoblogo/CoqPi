const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')

const {
  MONITOR_LIVE_COPILOT_DEBOUNCE_MS,
  buildMonitorLiveCopilotRequest,
  parseMonitorLiveCopilotSetup,
  shouldApplyMonitorLiveCopilotResponse
} = require('../dist-electron/shared/monitor-live-copilot.js')

const utterance = (overrides = {}) => ({
  id: 'u-1',
  speaker: 'other',
  text: 'We bid 195 EUR FCA Chop for 500 mt corn.',
  isFinal: true,
  timestampStart: '2026-09-14T10:00:00.000Z',
  timestampEnd: '2026-09-14T10:00:04.000Z',
  source: 'mock',
  language: 'en',
  ...overrides
})

test('live Monitor request contains only bounded finalized OTHER speech', () => {
  const request = buildMonitorLiveCopilotRequest({
    sequence: 3,
    utterances: [
      utterance({ id: 'partial', isFinal: false }),
      utterance({ id: 'me', speaker: 'me', text: 'My private reply.' }),
      utterance({ id: 'system', speaker: 'system', text: 'Connected.' }),
      utterance({ id: 'other-1' })
    ]
  })

  assert.equal(request.sequence, 3)
  assert.equal(request.segments.length, 1)
  assert.equal(request.segments[0].speaker, 'OTHER')
  assert.equal(request.segments[0].text.includes('private'), false)
})

test('live Monitor request keeps only the latest 12 finalized client lines', () => {
  const request = buildMonitorLiveCopilotRequest({
    sequence: 4,
    utterances: Array.from({ length: 20 }, (_, index) =>
      utterance({ id: `u-${index}`, text: `Client line ${index}` })
    )
  })
  assert.equal(request.segments.length, 12)
  assert.equal(request.segments[0].id, 'u-8')
  assert.equal(request.segments[11].id, 'u-19')
})

test('stale live Monitor responses cannot replace the latest request', () => {
  assert.equal(shouldApplyMonitorLiveCopilotResponse(8, 8), true)
  assert.equal(shouldApplyMonitorLiveCopilotResponse(7, 8), false)
  assert.equal(MONITOR_LIVE_COPILOT_DEBOUNCE_MS, 900)
})

test('Monitor setup copied from a client card is parsed without auth data', () => {
  const setup = parseMonitorLiveCopilotSetup(JSON.stringify({
    version: 1,
    monitorBaseUrl: 'https://mn7r.com',
    companyId: 'company-42',
    clientName: 'Svitanok',
    token: 'must-not-be-imported'
  }))
  assert.deepEqual(setup, {
    monitorBaseUrl: 'https://mn7r.com',
    monitorCompanyId: 'company-42',
    monitorClientName: 'Svitanok'
  })
})

test('Live cockpit keeps preview and explicit Draft Inbox save as separate actions', () => {
  const app = readFileSync('src/renderer/App.tsx', 'utf8')
  const panel = readFileSync('src/renderer/MonitorLiveCopilotPanel.tsx', 'utf8')
  const service = readFileSync('src/backend/services/monitor-live-copilot-service.ts', 'utf8')
  assert.equal(app.includes('MONITOR_LIVE_COPILOT_DEBOUNCE_MS'), true)
  assert.equal(panel.includes('Live preview · not saved'), true)
  assert.equal(panel.includes('Save to Monitor Draft Inbox'), true)
  assert.equal(service.includes("segment.speaker !== 'OTHER'"), true)
  assert.equal(service.includes('/negotiations/live-preview'), true)
  assert.equal(service.includes('/negotiations/import'), true)
  assert.equal(service.includes("toolRisk: 'read_only'"), true)
  assert.equal(service.includes("toolRisk: 'external_write', approvalGranted: true"), true)
})

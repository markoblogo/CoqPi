const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const fixtures = require('./fixtures/governance-actions.json')
const {
  evaluateGovernanceAction,
  getGovernanceActionFingerprint
} = require('../dist-electron/backend/services/governance-policy-service.js')
const {
  appendReceipt
} = require('../dist-electron/backend/services/governance-receipt-service.js')
const {
  executeGovernedProviderAction
} = require('../dist-electron/backend/services/governance-action-runner.js')
const {
  buildRealtimeCallFormData
} = require('../dist-electron/backend/services/realtime-call-form-data.js')

test('routes known providers and fingerprints only public action metadata', () => {
  const evaluation = evaluateGovernanceAction(fixtures.assistant, 'shadow')

  assert.equal(evaluation.decision, 'allow')
  assert.equal(evaluation.shouldProceed, true)
  assert.equal(evaluation.shouldRecord, true)
  assert.match(getGovernanceActionFingerprint(fixtures.assistant), /^[a-f0-9]{16}$/)
})

test('enforce mode blocks denied and approval-gated future tool side effects', () => {
  const approval = evaluateGovernanceAction(fixtures.approvalTool, 'enforce')
  const denied = evaluateGovernanceAction(fixtures.deniedTool, 'enforce')

  assert.deepEqual(
    [approval.decision, approval.shouldProceed],
    ['require_approval', false]
  )
  assert.deepEqual([denied.decision, denied.shouldProceed], ['deny', false])
})

test('enforce mode records and blocks a prohibited side effect before execution', async () => {
  const previousMode = process.env.COQPI_GOVERNANCE_MODE
  process.env.COQPI_GOVERNANCE_MODE = 'enforce'
  const receipts = []
  let executed = false

  try {
    await assert.rejects(
      executeGovernedProviderAction(
        fixtures.deniedTool,
        async () => {
          executed = true
        },
        async (receipt) => receipts.push(receipt)
      ),
      /Governance blocked action/
    )
  } finally {
    if (previousMode === undefined) {
      delete process.env.COQPI_GOVERNANCE_MODE
    } else {
      process.env.COQPI_GOVERNANCE_MODE = previousMode
    }
  }

  assert.equal(executed, false)
  assert.deepEqual(
    receipts.map((receipt) => [receipt.stage, receipt.outcome]),
    [
      ['preflight', 'pending'],
      ['completed', 'blocked']
    ]
  )
})

test('shadow observability failure does not interrupt a known provider route', async () => {
  const result = await executeGovernedProviderAction(
    fixtures.assistant,
    async () => 'provider response',
    async () => {
      throw new Error('read-only disk')
    }
  )

  assert.equal(result, 'provider response')
})

test('receipt storage strips transcript, PII, secrets, and hidden reasoning', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-governance-'))
  const filePath = path.join(directory, 'receipts.jsonl')

  await appendReceipt(
    {
      version: 1,
      timestamp: '2026-07-16T00:00:00.000Z',
      stage: 'completed',
      correlationId: 'test-correlation',
      mode: 'shadow',
      actionKind: 'assistant_analysis',
      actionFingerprint: 'abc123abc123abcd',
      decision: 'allow',
      enforced: false,
      outcome: 'allowed',
      reason: 'known external provider route',
      latencyMs: 12,
      provider: 'openai',
      model: 'gpt-4o-mini',
      transcript: 'Alice: confidential interview answer',
      apiKey: 'sk-test-secret',
      hiddenReasoning: 'never store this'
    },
    filePath
  )

  const stored = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(stored)

  assert.equal(parsed.latencyMs, 12)
  assert.equal(parsed.provider, 'openai')
  assert.equal(parsed.transcript, undefined)
  assert.equal(parsed.apiKey, undefined)
  assert.equal(parsed.hiddenReasoning, undefined)
  assert.doesNotMatch(stored, /confidential|sk-test-secret|never store this/)
})

test('receipt allowlist includes provider routing metadata', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-governance-route-'))
  const filePath = path.join(directory, 'receipts.jsonl')

  await appendReceipt(
    {
      version: 1,
      timestamp: '2026-07-16T00:01:00.000Z',
      stage: 'completed',
      correlationId: 'route-correlation',
      mode: 'shadow',
      actionKind: 'assistant_analysis',
      actionFingerprint: 'routefingerprint01',
      decision: 'allow',
      enforced: false,
      outcome: 'allowed',
      reason: 'known external provider route',
      latencyMs: 7,
      provider: 'ollama',
      routeIndex: 1,
      routeCount: 2,
      routeLabel: 'openai(gpt-4o-mini) -> ollama(llama3.1)',
      providerTimeoutMs: 8000,
      providerBudgetMs: 8000
    },
    filePath
  )

  const stored = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(stored)

  assert.equal(parsed.routeIndex, 1)
  assert.equal(parsed.routeCount, 2)
  assert.equal(parsed.routeLabel, 'openai(gpt-4o-mini) -> ollama(llama3.1)')
  assert.equal(parsed.providerTimeoutMs, 8000)
  assert.equal(parsed.providerBudgetMs, 8000)
})

test('local STT remains off the governance receipt path', async () => {
  const evaluation = evaluateGovernanceAction(fixtures.localStt, 'enforce')

  assert.deepEqual(
    [evaluation.decision, evaluation.shouldProceed, evaluation.shouldRecord],
    ['allow', true, false]
  )

  const receipts = []
  const result = await executeGovernedProviderAction(
    fixtures.localStt,
    async () => 'transcribed locally',
    async (receipt) => receipts.push(receipt)
  )

  assert.equal(result, 'transcribed locally')
  assert.equal(receipts.length, 0)
})

test('realtime request keeps SDP and session as multipart text fields', () => {
  const formData = buildRealtimeCallFormData(
    'v=0\r\no=- test\r\n',
    {
      type: 'transcription',
      audio: {
        input: {
          transcription: {
            model: 'gpt-4o-transcribe',
            language: 'en',
            prompt: 'Transcribe spoken English only.'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 800
          }
        }
      }
    }
  )

  assert.equal(formData.get('sdp'), 'v=0\r\no=- test\r\n')
  assert.match(String(formData.get('session')), /"type":"transcription"/)
})

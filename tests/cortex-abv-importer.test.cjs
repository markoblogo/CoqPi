const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  dumpManifestSnapshot
} = require('../scripts/dump-manifest.cjs')
const importer = require('../scripts/cortex-abv-importer.cjs')
const stableJson = (value) => JSON.stringify(value, undefined, 2)

test('builds import plan from bridge export with compact allow/deny and mapped reasons', async () => {
  const bridgeExport = {
    version: 1,
    format: 'coqpi-cortex-bridge-v0',
    generatedAt: '2026-07-20T00:00:00.000Z',
    cortexScope: 'coqpi_interview_en_fr',
    manifestDir: '/tmp/coqpi-manifest',
    manifestHash: 'a'.repeat(64),
    sourceSummary: {
      sources: 2,
      counterpartyPacks: 2,
      knowledgePackLifecycleEvents: 0
    },
    selectedCounterpartyPackIds: ['allowed-id'],
    selectedCounterpartyPacks: [
      {
        version: 1,
        id: 'allowed-id',
        sourceId: 'finder:job:import-001',
        kind: 'job',
        partnerName: 'Allowed Partner',
        title: 'Allowed role',
        summary: 'Allowed candidate summary.',
        context: 'Allowed for import because it is clean and selected.',
        links: ['https://example.com/allowed'],
        selected: true,
        status: 'retrieval_ready',
        createdAt: '2026-07-20T00:00:00.000Z',
        ownerId: 'owner',
        provenance: {
          sourceId: 'coqpi:finder:finder:job:import-001',
          locatorSha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        },
        contentHash:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 30,
          expiresAt: '2026-08-19T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi_interview_en_fr']
      }
    ],
    droppedCounterpartyPacks: [
      {
        id: 'stale-id',
        sourceId: 'finder:job:import-002',
        label: 'Stale candidate',
        reasonCode: 'not_retrieval_ready',
        reason: 'blocked: not retrieval-ready'
      }
    ]
  }

  const plan = importer.buildCortexABVImportPlan({
    bridgeExport
  })

  assert.equal(plan.format, 'coqpi-cortex-to-cortexabv-ingest-v0')
  assert.equal(plan.manifestHash, bridgeExport.manifestHash)
  assert.deepEqual(plan.sourceSummary, bridgeExport.sourceSummary)
  assert.equal(plan.decisions.allow.length, 1)
  assert.equal(plan.decisions.deny.length, 1)

  assert.equal(plan.decisions.allow[0].id, 'allowed-id')
  assert.equal(plan.decisions.allow[0].sourceSummary.provenanceSourceId, 'coqpi:finder:finder:job:import-001')
  assert.equal(
    Object.prototype.hasOwnProperty.call(plan.decisions.allow[0], 'provenance'),
    false,
    'raw pack payload must be compact'
  )

  const denied = plan.decisions.deny[0]
  assert.equal(denied.id, 'stale-id')
  assert.equal(denied.reasonCode, 'not_retrieval_ready')
  assert.match(denied.reason, /not retrieval-ready/i)
})

test('builds import plan from snapshot with strict eligibility and missing manifests denied', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-cortexabv-import-'))
  const manifestPath = path.join(directory, 'manifest.json')
  const historyPath = path.join(directory, 'coqpi-context-pack.history.jsonl')
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = directory

  const manifest = {
    version: 1,
    sources: [],
    counterpartyPacks: [
      {
        version: 1,
        id: 'id-allowed',
        sourceId: 'finder:job:import-003',
        kind: 'job',
        partnerName: 'Allowed Snapshot Partner',
        title: 'Allowed Snapshot Role',
        summary: 'Allowed role from snapshot input.',
        context: 'Selected and in-scope.',
        links: [],
        selected: true,
        status: 'retrieval_ready',
        createdAt: '2026-07-20T00:00:00.000Z',
        ownerId: 'owner',
        provenance: {
          sourceId: 'coqpi:finder:finder:job:import-003',
          locatorSha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        },
        contentHash:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 30,
          expiresAt: '2026-08-19T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi_interview_en_fr']
      },
      {
        version: 1,
        id: 'id-denied',
        sourceId: 'finder:partner:import-004',
        kind: 'partner',
        partnerName: 'Denied Snapshot Partner',
        title: 'Denied Snapshot Partner',
        summary: 'Out-of-scope for EN/FR interview scope.',
        context: 'Wrong scope candidate.',
        links: [],
        selected: true,
        status: 'retrieval_ready',
        createdAt: '2026-07-20T00:00:00.000Z',
        ownerId: 'owner',
        provenance: {
          sourceId: 'coqpi:finder:finder:partner:import-004',
          locatorSha256:
            'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        },
        contentHash:
          'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 30,
          expiresAt: '2026-08-19T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi_private_review']
      }
    ]
  }
  const historyLine = {
    version: 1,
    timestamp: '2026-07-20T00:00:00.000Z',
    sourceVersion: 1,
    action: 'manual snapshot',
    reason: 'unit test',
    manifestHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    eventHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    previousEventHash: null,
    sourceCount: 0,
    repositoryHead: 'unavailable'
  }

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(manifestPath, `${stableJson(manifest)}\n`, 'utf8')
    await fs.writeFile(historyPath, `${JSON.stringify(historyLine)}\n`, 'utf8')

    const snapshot = await dumpManifestSnapshot({
      manifestDir: directory,
      signEnabled: false
    })
    const plan = importer.buildCortexABVImportPlan({ snapshot })

    assert.equal(plan.decisions.allow.length, 1)
    assert.equal(plan.decisions.allow[0].id, 'id-allowed')
    assert.equal(plan.decisions.deny.length, 1)
    assert.equal(plan.decisions.deny[0].id, 'id-denied')
    assert.equal(plan.decisions.deny[0].reasonCode, 'missing_interview_scope')
    assert.match(plan.decisions.deny[0].reason, /missing EN\/FR interview scope/i)
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('requires valid validation artifact for import planning', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-import-plan-val-'))
  const snapshotPath = path.join(tempDir, 'snapshot.json')
  const validation = {
    valid: false,
    errors: ['validation failed'],
    warnings: []
  }

  const snapshot = {
    version: 1,
    format: 'coqpi-context-pack-snapshot',
    generatedAt: new Date().toISOString(),
    manifestHash: 'a'.repeat(64),
    sourceSummary: {
      sources: 0,
      counterpartyPacks: 0,
      knowledgePackLifecycleEvents: 0
    }
  }

  try {
    await fs.writeFile(snapshotPath, `${stableJson(snapshot)}\n`, 'utf8')
    assert.throws(
      () =>
        importer.buildCortexABVImportPlan({
          snapshot,
          validation
        }),
      /requires valid validation artifact/i
    )
  } finally {
    await fs.rm(path.dirname(snapshotPath), { recursive: true, force: true })
  }
})

test('rejects malformed snapshot import if manifestHash/sourceSummary mandatory fields are missing', async () => {
  assert.throws(
    () =>
      importer.buildCortexABVImportPlan({
        snapshot: {
          version: 1,
          format: 'coqpi-context-pack-snapshot',
          manifest: {}
        }
      }),
    /missing required manifestHash/
  )
})

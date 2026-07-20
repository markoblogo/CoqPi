const assert = require('node:assert/strict')
const nodeCrypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  dumpManifestSnapshot,
  validateManifest
} = require('../scripts/dump-manifest.cjs')

const stableJson = (value) => JSON.stringify(value, undefined, 2)

test('dumps manifest snapshot with stable hash and optional signature', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-manifest-dump-'))
  const manifestPath = path.join(directory, 'manifest.json')
  const historyPath = path.join(directory, 'coqpi-context-pack.history.jsonl')
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const previousKey = process.env.COQPI_CONTEXT_PACK_SIGNING_KEY
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = directory
  const signingKey = 'unit-test-key'
  process.env.COQPI_CONTEXT_PACK_SIGNING_KEY = signingKey
  const manifest = {
    version: 1,
    sources: [
      {
        id: 'id1',
        kind: 'link',
        location: 'https://example.com',
        label: 'Example',
        selected: true,
        status: 'pending_classification',
        createdAt: '2026-07-20T00:00:00.000Z',
        ownerId: 'owner',
        provenance: {
          sourceId: 'coqpi:ingress:id1',
          locatorSha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        },
        contentHash: null,
        classification: 'pending',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 30,
          expiresAt: '2026-08-19T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi_pending_classification'],
        promotion: 'explicit_audit_required'
      }
    ]
  }
  const historyLine = {
    version: 1,
    timestamp: '2026-07-20T00:00:00.000Z',
    action: 'add context source',
    reason: 'unit test',
    sourceVersion: 1,
    manifestHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    eventHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    previousEventHash: null,
    sourceCount: 1,
    repositoryHead: 'unavailable'
  }

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(manifestPath, `${stableJson(manifest)}\n`, 'utf8')
    await fs.writeFile(historyPath, `${JSON.stringify(historyLine)}\n`, 'utf8')

    const snapshot = await dumpManifestSnapshot({ signEnabled: false })
    assert.equal(snapshot.format, 'coqpi-context-pack-snapshot')
    assert.equal(snapshot.manifest.version, 1)
    assert.equal(snapshot.manifest.sources[0].location, 'https://example.com')
    assert.equal(
      snapshot.manifestHash,
      nodeCrypto.createHash('sha256').update(stableJson(manifest)).digest('hex')
    )
    assert.equal(snapshot.history.length, 1)
    assert.equal(snapshot.signature, undefined)

    const signed = await dumpManifestSnapshot({ signEnabled: true })
    assert.ok(signed.signature)
    assert.equal(signed.signature.algorithm, 'HMAC-SHA256')
    const expectedSignature = nodeCrypto
      .createHmac('sha256', signingKey)
      .update(stableJson({
        version: 1,
        format: 'coqpi-context-pack-snapshot',
        generatedAt: signed.generatedAt,
        manifestDir: directory,
        manifestHash: signed.manifestHash,
        manifest: signed.manifest,
        history: signed.history
      }))
      .digest('hex')
    assert.equal(signed.signature.digest, expectedSignature)

    const outPath = path.join(directory, 'snapshot.json')
    const output = stableJson(signed)
    await fs.writeFile(outPath, `${output}\n`, 'utf8')
    const reread = JSON.parse(await fs.readFile(outPath, 'utf8'))
    assert.deepEqual(reread, signed)
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }

    if (previousKey === undefined) {
      delete process.env.COQPI_CONTEXT_PACK_SIGNING_KEY
    } else {
      process.env.COQPI_CONTEXT_PACK_SIGNING_KEY = previousKey
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('validates manifest and history consistency and detects broken chain', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-manifest-validate-'))
  const manifestPath = path.join(directory, 'manifest.json')
  const historyPath = path.join(directory, 'coqpi-context-pack.history.jsonl')
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = directory

  const manifest = {
    version: 1,
    sources: [
      {
        id: 'id2',
        kind: 'file',
        location: '/tmp/notes.md',
        label: 'notes',
        selected: false,
        status: 'retrieval_ready',
        createdAt: '2026-07-20T00:00:00.000Z',
        ownerId: 'owner',
        provenance: {
          sourceId: 'coqpi:ingress:id2',
          locatorSha256:
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        },
        contentHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        classification: 'private',
        retention: {
          mode: 'manual_deletion_required',
          maxAgeDays: 30,
          expiresAt: '2026-08-19T00:00:00.000Z'
        },
        retrievalScopes: ['coqpi_interview_en_fr'],
        promotion: 'explicit_audit_required'
      }
    ]
  }

  const historyA = {
    version: 1,
    timestamp: '2026-07-20T00:00:00.000Z',
    sourceVersion: 1,
    action: 'add context source',
    reason: 'unit test',
    manifestHash: 'aaaa',
    eventHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    previousEventHash: null,
    sourceCount: 1,
    repositoryHead: 'unavailable'
  }
  const historyB = {
    version: 1,
    timestamp: '2026-07-20T00:01:00.000Z',
    sourceVersion: 1,
    action: 'capture',
    reason: 'unit test',
    manifestHash: 'bbbb',
    eventHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    previousEventHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceCount: 1,
    repositoryHead: 'unavailable'
  }

  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(manifestPath, `${stableJson(manifest)}\n`, 'utf8')
    await fs.writeFile(
      historyPath,
      `${JSON.stringify(historyA)}\n${JSON.stringify(historyB)}\n`,
      'utf8'
    )

    const valid = await validateManifest({ 'manifest-dir': directory })
    assert.equal(valid.valid, true)
    assert.equal(valid.errors.length, 0)
    assert.equal(valid.warnings.length, 0)

    const broken = {
      version: 1,
      timestamp: '2026-07-20T00:02:00.000Z',
      sourceVersion: 1,
      action: 'capture',
      reason: 'unit test broken',
      manifestHash: 'cccc',
      eventHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      previousEventHash: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      sourceCount: 1,
      repositoryHead: 'unavailable'
    }
    await fs.writeFile(
      historyPath,
      `${JSON.stringify(historyA)}\n${JSON.stringify(broken)}\n`,
      'utf8'
    )

    const invalid = await validateManifest({ 'manifest-dir': directory })
    assert.equal(invalid.valid, false)
    assert.equal(invalid.errors.length, 1)
    assert.match(
      invalid.errors[0],
      /previousEventHash must match prior eventHash/
    )
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})

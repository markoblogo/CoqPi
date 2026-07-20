const assert = require('node:assert/strict')
const nodeCrypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  dumpManifestSnapshot
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

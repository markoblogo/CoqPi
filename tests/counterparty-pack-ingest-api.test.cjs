const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')

const withCoreDirectory = async (operation) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-finder-ingest-'))
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  const coreDirectory = path.join(directory, 'core')
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = coreDirectory
  await fs.mkdir(coreDirectory, { recursive: true })
  await fs.writeFile(path.join(coreDirectory, 'coqpi-ingress.events.jsonl'), '')

  try {
    await operation()
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('ingests finder payload through backend endpoint: dedupe, batch, malformed allowed', async () => {
  await withCoreDirectory(async () => {
    const payload = JSON.stringify([
      {
        kind: 'job',
        sourceId: 'finder:job:backend-001',
        partnerName: 'Nova Works',
        title: 'Senior Product Lead',
        summary: 'Built PM workflows for growth systems.',
        links: ['https://nova.example/job']
      },
      {
        kind: 'job',
        sourceId: 'finder:job:backend-001',
        partnerName: 'Nova Works',
        title: 'Senior Product Lead',
        summary: 'Duplicate should be deduped by sourceId+kind.',
        links: ['https://nova.example/job-dup']
      },
      {
        kind: 'investor',
        sourceId: 'finder:investor:seed-002',
        partnerName: 'Green Ventures',
        title: 'Seed investor',
        summary: 'Early-stage agri AI opportunities and pilots.',
        linksText: 'https://green.example/info\nhttps://green.example/info'
      }
    ])

    const first = await contextSourceService.ingestCounterpartyFinderPayload(payload)
    assert.equal(first.manifest.counterpartyPacks.length, 2)
    assert.equal(
      first.manifest.counterpartyPacks.some((pack) => pack.kind === 'job'),
      true
    )
    assert.equal(
      first.manifest.counterpartyPacks.some((pack) => pack.kind === 'investor'),
      true
    )

    const afterDuplicateBatch = await contextSourceService.ingestCounterpartyFinderPayload(payload)
    assert.equal(afterDuplicateBatch.manifest.counterpartyPacks.length, 2)

    const partial = await contextSourceService.ingestCounterpartyFinderPayload(
      JSON.stringify([
        {
          kind: 'partner',
          sourceId: 'finder:partner:acme-002',
          partnerName: 'Acme',
          title: 'Pilot partner',
          summary: 'Valid pack alongside a malformed one.'
        },
        {
          kind: 'job',
          partnerName: 'Missing source id',
          title: 'Role',
          summary: 'summary'
        }
      ])
    )

    assert.equal(partial.manifest.counterpartyPacks.length, 3)
    assert.equal(partial.counterpartyPayloadIngestSummary?.requestedCount, 2)
    assert.equal(partial.counterpartyPayloadIngestSummary?.ingestedCount, 1)
    assert.equal(partial.counterpartyPayloadIngestSummary?.errors.length, 1)

    await assert.rejects(
      contextSourceService.ingestCounterpartyFinderPayload('42'),
      /Finder payload must be a JSON object or array for counterparty packs./
    )
  })
})

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

test('previews finder payload: marks duplicates and invalid entries without mutating packs', async () => {
  await withCoreDirectory(async () => {
    const seed = await contextSourceService.ingestCounterpartyFinderPayload(
      JSON.stringify({
        kind: 'job',
        sourceId: 'finder:job:seed-007',
        partnerName: 'AgriFlow',
        title: 'Growth PM',
        summary: 'Baseline profile pack for duplicate detection.'
      })
    )

    const before = seed.manifest.counterpartyPacks.length

    const preview = await contextSourceService.previewCounterpartyFinderPayload(
      JSON.stringify([
        {
          kind: 'job',
          sourceId: 'finder:job:seed-007',
          partnerName: 'AgriFlow',
          title: 'Growth PM',
          summary: 'Duplicate against existing job source.'
        },
        {
          kind: 'partner',
          sourceId: 'finder:partner:new-001',
          partnerName: 'Nova',
          title: 'Pilot partner',
          summary: 'Fresh candidate for import.'
        },
        {
          kind: 'job',
          sourceId: 'finder:job:seed-007',
          partnerName: 'AgriFlow',
          summary: 'Missing title field is invalid.'
        }
      ])
    )

    assert.equal(preview.requestedCount, 3)
    assert.equal(preview.validCount, 2)
    assert.equal(preview.duplicateCount, 1)
    assert.equal(preview.errors.length, 1)
    assert.equal(preview.candidates[0].duplicate, true)
    assert.equal(preview.candidates[1].duplicate, false)
    assert.equal(preview.candidates[0].index, 0)
    assert.equal(preview.candidates[1].index, 1)

    const after = await contextSourceService.ingestCounterpartyFinderPayload(
      JSON.stringify({
        kind: 'partner',
        sourceId: 'finder:partner:unchanged',
        partnerName: 'No-Op',
        title: 'Preview must not mutate',
        summary: 'This is from a separate ingest call after preview only.'
      })
    )

    assert.equal(after.manifest.counterpartyPacks.length, before + 1)
  })
})

test('ingests finder payload draft arrays for batch search modules', async () => {
  await withCoreDirectory(async () => {
    const first = await contextSourceService.ingestCounterpartyFinderPayloadDrafts([
      {
        kind: 'job',
        sourceId: 'finder:job:search-001',
        partnerName: 'Nova Works',
        title: 'Senior Product Lead',
        summary: 'Founder-level context for first stage interview.'
      },
      {
        kind: 'partner',
        sourceId: 'finder:partner:acme-001',
        partnerName: 'Acme Food',
        title: 'Pilot supplier',
        summary: 'Potential local trial partner for pilot.'
      },
      {
        kind: 'job',
        sourceId: 'finder:job:search-001',
        partnerName: 'Nova Works',
        title: 'Should be duplicate by sourceId+kind',
        summary: 'Duplicate should be skipped.'
      },
      {
        kind: 'investor',
        partnerName: 'No sourceId',
        title: 'Investor',
        summary: 'Missing required sourceId should fail.'
      }
    ])

    assert.equal(first.manifest.counterpartyPacks.length, 2)
    assert.equal(first.counterpartyPayloadIngestSummary?.requestedCount, 4)
    assert.equal(first.counterpartyPayloadIngestSummary?.ingestedCount, 2)
    assert.equal(first.counterpartyPayloadIngestSummary?.errors.length, 1)

    const second = await contextSourceService.ingestCounterpartyFinderPayloadDrafts([
      {
        kind: 'job',
        sourceId: 'finder:job:search-002',
        partnerName: 'Nova Works',
        title: 'Follow-up',
        summary: 'A second interview slot for the same partner.'
      },
      {
        kind: 'investor',
        sourceId: 'finder:investor:seed-999',
        partnerName: 'Green Capital',
        title: 'Seed fund',
        summary: 'Second-party investor shortlist entry.'
      }
    ])

    assert.equal(second.manifest.counterpartyPacks.length, 4)
    assert.equal(second.counterpartyPayloadIngestSummary?.requestedCount, 2)
    assert.equal(second.counterpartyPayloadIngestSummary?.ingestedCount, 2)
    assert.equal(second.counterpartyPayloadIngestSummary?.errors.length, 0)
  })
})

test('finder payload preview is idempotent after payload edits', async () => {
  await withCoreDirectory(async () => {
    const firstDraft = JSON.stringify({
      kind: 'partner',
      sourceId: 'finder:partner:preview-001',
      partnerName: 'Seed House',
      title: 'Partner profile',
      summary: 'Seed-house context preview baseline.'
    })

    const editedDraft = JSON.stringify([
      {
        kind: 'partner',
        sourceId: 'finder:partner:preview-001',
        partnerName: 'Seed House',
        title: 'Partner profile',
        summary: 'Seed-house context preview baseline.'
      },
      {
        kind: 'investor',
        sourceId: 'finder:investor:preview-002',
        partnerName: 'Agri Fund',
        title: 'Investor profile',
        summary: 'Second context candidate for manual re-check.'
      }
    ])

    const single = await contextSourceService.previewCounterpartyFinderPayload(firstDraft)
    const batch = await contextSourceService.previewCounterpartyFinderPayload(editedDraft)

    assert.equal(single.requestedCount, 1)
    assert.equal(single.validCount, 1)
    assert.equal(batch.requestedCount, 2)
    assert.equal(batch.validCount, 2)

    const repeated = await contextSourceService.previewCounterpartyFinderPayload(editedDraft)
    assert.equal(repeated.requestedCount, 2)
    assert.equal(repeated.validCount, 2)
    assert.equal(repeated.duplicateCount, 0)
  })
})

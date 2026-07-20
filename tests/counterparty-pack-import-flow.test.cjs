const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const contextSourceService = require('../dist-electron/backend/services/context-source-service.js')
const {
  parseCounterpartyPackJsonPayload
} = require('../dist-electron/shared/counterparty-pack-import.js')

const withCoreDirectory = async (operation) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-finder-import-'))
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

test('single Finder payload parses to one draft and can be persisted when saved', async () => {
  await withCoreDirectory(async () => {
    const payload = JSON.stringify({
      kind: 'partner',
      sourceId: 'finder:partner:acme-001',
      partnerName: 'Acme Systems',
      title: 'Strategic partner',
      summary: 'Partnership focus on market expansion and pilot rollout.',
      linksText: 'https://acme.example/intro\nhttps://acme.example/deck'
    })

    const parsed = parseCounterpartyPackJsonPayload(payload)
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].kind, 'partner')
    assert.equal(parsed[0].sourceId, 'finder:partner:acme-001')
    assert.equal(parsed[0].links.length, 2)

    const persisted = await contextSourceService.addCounterpartyContextPacks(parsed)
    assert.equal(persisted.manifest.counterpartyPacks.length, 1)
    assert.equal(
      persisted.manifest.counterpartyPacks[0].partnerName,
      'Acme Systems'
    )
  })
})

test('multiple Finder payload entries parse and import in one call', async () => {
  await withCoreDirectory(async () => {
    const payload = JSON.stringify([
      {
        kind: 'job',
        sourceId: 'finder:job:backend-001',
        partnerName: 'Nova Works',
        title: 'Senior Product Manager',
        summary: 'Building product for agriculture insights.',
        links: ['https://nova.example/career']
      },
      {
        kind: 'investor',
        sourceId: 'finder:investor:seed-002',
        partnerName: 'Green Ventures',
        title: 'Seed investor',
        summary: 'Seeking agri-commodity AI founders.',
        linksText: 'https://green.example/info\\nhttps://green.example/info'
      }
    ])

    const parsed = parseCounterpartyPackJsonPayload(payload)
    assert.equal(parsed.length, 2)

    const persisted = await contextSourceService.addCounterpartyContextPacks(parsed)
    assert.equal(persisted.manifest.counterpartyPacks.length, 2)
    assert.equal(persisted.manifest.counterpartyPacks.some((pack) => pack.kind === 'job'), true)
    assert.equal(
      persisted.manifest.counterpartyPacks.some((pack) => pack.kind === 'investor'),
      true
    )
  })
})

const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const service = require('../dist-electron/backend/services/context-source-service.js')

test('stages and selects source pointers without reading their contents', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-context-'))
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = directory
  await fs.writeFile(path.join(directory, 'coqpi-ingress.events.jsonl'), '')
  const manifestJsonPath = path.join(directory, 'manifest.json')
  const manifestMarkdownPath = path.join(
    directory,
    'coqpi-context-pack.manifest.md'
  )
  const manifestHistoryPath = path.join(
    directory,
    'coqpi-context-pack.history.jsonl'
  )

  try {
    const added = await service.addContextSource({
      kind: 'link',
      location: 'https://www.linkedin.com/in/example'
    })
    const source = added.manifest.sources[0]

    assert.equal(source.kind, 'link')
    assert.equal(source.selected, true)
    assert.equal(source.status, 'pending_classification')
    assert.equal(source.location, 'https://www.linkedin.com/in/example')
    assert.equal(source.ownerId, 'owner')
    assert.match(source.provenance.sourceId, /^coqpi:ingress:/)
    assert.match(source.provenance.locatorSha256, /^[a-f0-9]{64}$/)
    assert.equal(source.contentHash, null)
    assert.equal(source.classification, 'pending')
    assert.deepEqual(source.retrievalScopes, ['coqpi_pending_classification'])
    assert.equal(source.promotion, 'explicit_audit_required')

    const unselected = await service.setContextSourceSelected(source.id, false)
    assert.equal(unselected.manifest.sources[0].selected, false)

    const removed = await service.removeContextSource(source.id)
    assert.deepEqual(removed.manifest.sources, [])

    const historyLines = (await fs.readFile(manifestHistoryPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    assert.equal(historyLines.length, 3)
    assert.equal(historyLines[0].reason.includes('add context source'), true)
    assert.equal(historyLines[1].reason.includes('set context source selected=false'), true)
    assert.equal(historyLines[2].reason.includes('remove context source'), true)
    assert.equal(
      historyLines[2].previousEventHash,
      historyLines[1].eventHash
    )

    const manifestFromJson = JSON.parse(await fs.readFile(manifestJsonPath, 'utf8'))
    assert.equal(manifestFromJson.version, 1)
    assert.equal(Array.isArray(manifestFromJson.sources), true)

    const manifestMarkdown = await fs.readFile(manifestMarkdownPath, 'utf8')
    assert.match(manifestMarkdown, /# CoqPi Context Pack/)
    assert.match(manifestMarkdown, /## Sources/)

    const events = (await fs.readFile(
      path.join(directory, 'coqpi-ingress.events.jsonl'),
      'utf8'
    ))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.deepEqual(
      events.map((event) => event.type),
      ['ingress_added', 'selection_changed', 'source_removed']
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

test('ingests selected counterparty packs and uses them in EN/FR retrieval', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-counterparty-'))
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')
  await fs.mkdir(path.join(directory, 'core'), { recursive: true })
  await fs.writeFile(path.join(directory, 'core', 'coqpi-ingress.events.jsonl'), '')

  try {
    const added = await service.addCounterpartyContextPacks([
      {
        sourceId: 'finder:job:backend-001',
        kind: 'job',
        partnerName: 'Acme Ventures',
        title: 'Senior Product Lead Role',
        summary: 'The role asks for AI product strategy and team leadership.',
        context: 'Focus on French market expansion and enterprise SaaS.',
        links: ['https://acme.example.com/job'],
      },
      {
        sourceId: 'finder:partner:investor-002',
        kind: 'investor',
        partnerName: 'Seed House',
        title: 'Strategic Investor',
        summary: 'Investor seeking agri-commodity analytics platform',
        context: 'Talk first about pilot project in Mediterranean grain logistics.',
      },
    ])

    const packs = added.manifest.counterpartyPacks
    assert.equal(packs.length, 2)
    assert.equal(packs[0].status, 'retrieval_ready')
    assert.equal(packs[0].selected, true)
    assert.equal(packs[0].promotion, 'explicit_audit_required')
    assert.equal(packs[0].classification, 'private')
    assert.deepEqual(packs[0].retrievalScopes, ['coqpi_interview_en_fr'])

    const retrieval = await service.getPersonalInterviewRetrieval(
      'Can we discuss AI product strategy and team leadership for this position?',
      'en'
    )
    assert.match(retrieval, /AI product strategy and team leadership/i)

    const jobOnly = await service.getPersonalInterviewRetrieval(
      'Can we discuss AI product strategy and team leadership for this position?',
      'en',
      ['job']
    )
    assert.match(jobOnly, /Senior Product Lead Role/)
    assert.doesNotMatch(jobOnly, /Seed House/i)

    const investorOnly = await service.getPersonalInterviewRetrieval(
      'Can we discuss investor funding models and early support?',
      'en',
      ['investor']
    )
    assert.match(investorOnly, /Seed House/)
    assert.doesNotMatch(investorOnly, /Senior Product Lead Role/)

    const bothKinds = await service.getPersonalInterviewRetrieval(
      'Can we discuss AI product strategy and investor funding plans?',
      'en',
      ['job', 'investor']
    )
    assert.match(bothKinds, /Senior Product Lead Role/)
    assert.match(bothKinds, /Seed House/)

    const unselected = await service.setCounterpartyContextPackSelected(packs[1].id, false)
    assert.equal(unselected.manifest.counterpartyPacks.find((pack) => pack.id === packs[1].id)?.selected, false)

    const removed = await service.removeCounterpartyContextPack(packs[1].id)
    assert.equal(removed.manifest.counterpartyPacks.length, 1)

    const retrievalAfterDeselect = await service.getPersonalInterviewRetrieval(
      'I want to talk about AI product strategy and team leadership.',
      'en'
    )
    assert.doesNotMatch(retrievalAfterDeselect, /Seed House/)
    assert.match(retrievalAfterDeselect, /Senior Product Lead Role/)
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('retrieves only explicitly selected pack ids when provided', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-counterparty-pack-filter-'))
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')
  await fs.mkdir(path.join(directory, 'core'), { recursive: true })
  await fs.writeFile(path.join(directory, 'core', 'coqpi-ingress.events.jsonl'), '')

  try {
    const seeded = await service.addCounterpartyContextPacks([
      {
        sourceId: 'finder:job:backend-001',
        kind: 'job',
        partnerName: 'Acme Ventures',
        title: 'Senior Product Lead',
        summary: 'Role asks for AI product strategy and team leadership.',
      },
      {
        sourceId: 'finder:partner:partner-001',
        kind: 'partner',
        partnerName: 'North Star',
        title: 'Pilot partner',
        summary: 'Potential pilot project partner.',
      },
    ])

    const packIds = seeded.manifest.counterpartyPacks.map((pack) => pack.id)

    const bothKinds = await service.getPersonalInterviewRetrieval(
      'What AI product role and pilot support did we discuss?',
      'en'
    )
    assert.equal(bothKinds.includes('Acme Ventures'), true)
    assert.equal(bothKinds.includes('North Star'), true)

    const onlyFirst = await service.getPersonalInterviewRetrieval(
      'What AI product role and pilot support did we discuss?',
      'en',
      undefined,
      [packIds[0] ?? '']
    )
    assert.equal(onlyFirst.includes('Acme Ventures'), true)
    assert.equal(onlyFirst.includes('North Star'), false)

    const onlySecond = await service.getPersonalInterviewRetrieval(
      'What AI product role and pilot support did we discuss?',
      'en',
      undefined,
      [packIds[1] ?? '']
    )
    assert.equal(onlySecond.includes('Acme Ventures'), false)
    assert.equal(onlySecond.includes('North Star'), true)
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('rejects malformed counterparty packs', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-counterparty-invalid-'))
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')
  await fs.mkdir(path.join(directory, 'core'), { recursive: true })
  await fs.writeFile(path.join(directory, 'core', 'coqpi-ingress.events.jsonl'), '')

  try {
    await assert.rejects(
      service.addCounterpartyContextPacks([
        {
          sourceId: '',
          kind: 'job',
          partnerName: 'Acme',
          title: 'Role',
          summary: 'summary',
        },
      ]),
      /A counterparty pack requires kind, sourceId, partnerName, title and summary./
    )

    await assert.rejects(
      service.addCounterpartyContextPacks([]),
      /At least one counterparty pack is required./
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

test('rejects non-web links before they can enter the manifest', async () => {
  await assert.rejects(
    service.addContextSource({
      kind: 'link',
      location: 'file:///private/profile.pdf'
    }),
    /Only http and https links/
  )
})

test('captures an explicitly selected text file for EN/FR interview retrieval', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-capture-'))
  const filePath = path.join(directory, 'profile.md')
  const previousDirectory = process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = path.join(directory, 'core')
  await fs.mkdir(path.join(directory, 'core'), { recursive: true })
  await fs.writeFile(path.join(directory, 'core', 'coqpi-ingress.events.jsonl'), '')
  await fs.writeFile(
    filePath,
    'I lead AI product strategy and digital transformation projects.',
    'utf8'
  )
  const coreDirectory = path.join(directory, 'core')
  const manifestMarkdownPath = path.join(
    coreDirectory,
    'coqpi-context-pack.manifest.md'
  )
  const manifestHistoryPath = path.join(
    coreDirectory,
    'coqpi-context-pack.history.jsonl'
  )

  try {
    const added = await service.addContextSource({ kind: 'file', location: filePath })
    const source = added.manifest.sources[0]
    const captured = await service.captureAndClassifyContextSource(source.id)
    const classified = captured.manifest.sources[0]

    assert.equal(classified.status, 'retrieval_ready')
    assert.equal(classified.classification, 'private')
    assert.match(classified.contentHash, /^[a-f0-9]{64}$/)
    assert.deepEqual(classified.retrievalScopes, ['coqpi_interview_en_fr'])

    const historyLines = (await fs.readFile(manifestHistoryPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    assert.equal(historyLines.length, 2)
    assert.equal(historyLines[1].reason.includes('capture and classify context source'), true)
    assert.equal(
      historyLines[1].previousEventHash,
      historyLines[0].eventHash
    )

    const manifestMarkdown = await fs.readFile(manifestMarkdownPath, 'utf8')
    assert.match(manifestMarkdown, /private/)
    assert.match(manifestMarkdown, /coqpi_interview_en_fr/)

    const retrieval = await service.getPersonalInterviewRetrieval(
      'Tell me about your AI product strategy experience.',
      'en'
    )
    assert.match(retrieval, /AI product strategy/)
    assert.doesNotMatch(retrieval, new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally {
    if (previousDirectory === undefined) {
      delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    } else {
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR = previousDirectory
    }
    await fs.rm(directory, { recursive: true, force: true })
  }
})

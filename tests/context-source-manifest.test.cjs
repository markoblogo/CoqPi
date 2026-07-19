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

  try {
    const added = await service.addContextSource({ kind: 'file', location: filePath })
    const source = added.manifest.sources[0]
    const captured = await service.captureAndClassifyContextSource(source.id)
    const classified = captured.manifest.sources[0]

    assert.equal(classified.status, 'retrieval_ready')
    assert.equal(classified.classification, 'private')
    assert.match(classified.contentHash, /^[a-f0-9]{64}$/)
    assert.deepEqual(classified.retrievalScopes, ['coqpi_interview_en_fr'])

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

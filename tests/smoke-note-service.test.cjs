const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-smoke-note-userdata')
  }
}

const withSmokeNoteWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-smoke-note-'))
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const originalModuleLoad = Module._load

  process.env.COQPI_SESSIONS_DIR = path.join(directory, 'sessions')

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const service = require('../dist-electron/backend/services/smoke-note-service.js')
    await run(service)
  } finally {
    Module._load = originalModuleLoad

    if (previousSessionsDirectory === undefined) {
      delete process.env.COQPI_SESSIONS_DIR
    } else {
      process.env.COQPI_SESSIONS_DIR = previousSessionsDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('smoke note service saves local append-only notes', async () => {
  await withSmokeNoteWorkspace(async (service) => {
    const first = await service.saveSmokeTestNote({
      worked: 'Mock transcript produced an answer.',
      broken: 'Realtime had no transcript.',
      nextFix: 'Inspect realtime events.',
      sessionLabel: 'Northfield Labs · AI Product Lead',
      selectedPackLabel: 'Northfield Labs'
    })
    const second = await service.saveSmokeTestNote({
      worked: 'Mic permission was ok.',
      broken: '',
      nextFix: 'Tune segmentation.'
    })
    const result = await service.getSmokeTestNotes()

    assert.match(first.id, /^[0-9a-f-]+$/)
    assert.equal(result.notes.length, 2)
    assert.equal(result.notes[0].id, second.id)
    assert.equal(result.notes[1].id, first.id)
    assert.equal(result.notes[1].sessionLabel, 'Northfield Labs · AI Product Lead')
  })
})

test('smoke note service rejects empty notes and trims fields', async () => {
  await withSmokeNoteWorkspace(async (service) => {
    await assert.rejects(
      () =>
        service.saveSmokeTestNote({
          worked: ' ',
          broken: '',
          nextFix: ''
        }),
      /Add at least one smoke test note/
    )

    const note = await service.saveSmokeTestNote({
      worked: ` ${'a'.repeat(1400)} `,
      broken: '',
      nextFix: ''
    })

    assert.equal(note.worked.length, 1200)
  })
})

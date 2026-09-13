const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const Module = require('node:module')

const withProfileDirectory = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-profile-'))
  const originalModuleLoad = Module._load
  const previousProfileDir = process.env.COQPI_PROFILE_DIR
  process.env.COQPI_PROFILE_DIR = directory
  Module._load = (request, parent, isMain) => request === 'electron'
    ? { app: { getPath: () => directory, isPackaged: false, getName: () => 'CoqPi' } }
    : originalModuleLoad(request, parent, isMain)

  try {
    await run(directory)
  } finally {
    Module._load = originalModuleLoad
    if (previousProfileDir === undefined) delete process.env.COQPI_PROFILE_DIR
    else process.env.COQPI_PROFILE_DIR = previousProfileDir
    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('first run creates a neutral profile scaffold without owner-specific facts', async () => {
  await withProfileDirectory(async () => {
    const servicePath = require.resolve('../dist-electron/backend/services/profile-service.js')
    delete require.cache[servicePath]
    const { getProfileContext } = require(servicePath)
    const result = await getProfileContext()

    assert.match(result.content, /Add a short, verified professional summary/)
    assert.doesNotMatch(result.content, /salary|Anton|MN7R|France/i)
  })
})

test('existing local profile is preserved byte for byte', async () => {
  await withProfileDirectory(async (directory) => {
    const content = '# Private local profile\nVerified user fact.\n'
    await fs.writeFile(path.join(directory, 'profile_context.md'), content)
    const servicePath = require.resolve('../dist-electron/backend/services/profile-service.js')
    delete require.cache[servicePath]
    const { getProfileContext } = require(servicePath)
    const result = await getProfileContext()

    assert.equal(result.content, content)
  })
})

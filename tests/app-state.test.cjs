const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const appStatePath = path.resolve(
  __dirname,
  '../dist-electron/backend/services/app-state.js'
)

const withAppState = async ({ isPackaged }, run) => {
  const cwd = process.cwd()
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-app-state-'))
  )
  const userData = path.join(directory, 'user-data')
  const originalModuleLoad = Module._load
  const previousEnv = {
    COQPI_DATA_DIR: process.env.COQPI_DATA_DIR,
    COQPI_PROFILE_DIR: process.env.COQPI_PROFILE_DIR,
    COQPI_SESSIONS_DIR: process.env.COQPI_SESSIONS_DIR,
    COQPI_GOVERNANCE_DIR: process.env.COQPI_GOVERNANCE_DIR,
    COQPI_PERSONAL_KNOWLEDGE_CORE_DIR:
      process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
  }

  delete process.env.COQPI_DATA_DIR
  delete process.env.COQPI_PROFILE_DIR
  delete process.env.COQPI_SESSIONS_DIR
  delete process.env.COQPI_GOVERNANCE_DIR
  delete process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return {
        app: {
          isPackaged,
          getName: () => 'CoqPi',
          getPath: () => userData
        }
      }
    }

    return originalModuleLoad(request, parent, isMain)
  }

  delete require.cache[appStatePath]
  process.chdir(directory)

  try {
    const appState = require(appStatePath)
    await run({ appState, directory, userData })
  } finally {
    process.chdir(cwd)
    delete require.cache[appStatePath]
    Module._load = originalModuleLoad

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('app state uses cwd data directory in development', async () => {
  await withAppState({ isPackaged: false }, async ({ appState, directory }) => {
    const info = appState.getAppInfo()

    assert.equal(info.profileDirectory, path.join(directory, 'data', 'profile'))
    assert.equal(info.sessionsDirectory, path.join(directory, 'data', 'sessions'))
    assert.equal(
      info.governanceDirectory,
      path.join(directory, 'data', 'governance')
    )
  })
})

test('app state uses Electron userData directory when packaged', async () => {
  await withAppState({ isPackaged: true }, async ({ appState, userData }) => {
    const info = appState.getAppInfo()

    assert.equal(info.profileDirectory, path.join(userData, 'data', 'profile'))
    assert.equal(info.sessionsDirectory, path.join(userData, 'data', 'sessions'))
    assert.equal(
      info.personalKnowledgeCoreDirectory,
      path.join(userData, 'data', 'personal-knowledge-core')
    )
    assert.notEqual(info.profileDirectory, '/data/profile')
  })
})

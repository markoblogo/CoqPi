import path from 'node:path'
import { app } from 'electron'
import type { AppInfo } from '../../shared/app-types'

const resolvePathFromBase = (baseDirectory: string, value: string) =>
  path.isAbsolute(value) ? value : path.resolve(baseDirectory, value)

const getDefaultDataDirectory = () => {
  if (process.env.COQPI_DATA_DIR) {
    return resolvePathFromBase(process.cwd(), process.env.COQPI_DATA_DIR)
  }

  return app?.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(process.cwd(), 'data')
}

const resolveDataDirectory = (
  envPath: string | undefined,
  fallbackSegments: string[]
) => {
  if (envPath) {
    return resolvePathFromBase(process.cwd(), envPath)
  }

  return path.join(getDefaultDataDirectory(), ...fallbackSegments)
}

export const getAppInfo = (): AppInfo => {
  const profileDirectory = resolveDataDirectory(process.env.COQPI_PROFILE_DIR, [
    'profile'
  ])
  const sessionsDirectory = resolveDataDirectory(
    process.env.COQPI_SESSIONS_DIR,
    ['sessions']
  )
  const governanceDirectory = resolveDataDirectory(
    process.env.COQPI_GOVERNANCE_DIR,
    ['governance']
  )
  const defaultDataDirectory = getDefaultDataDirectory()
  const personalKnowledgeCoreDirectory = process.env
    .COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    ? resolvePathFromBase(
        process.cwd(),
        process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
      )
    : app?.isPackaged
      ? path.join(defaultDataDirectory, 'personal-knowledge-core')
      : path.resolve(
          process.cwd(),
          '..',
          'CortexABV-private',
          'data',
          'personal-knowledge-core'
        )

  return {
    appName: app?.getName?.() ?? 'CoqPi',
    profileDirectory,
    sessionsDirectory,
    governanceDirectory,
    personalKnowledgeCoreDirectory
  }
}

export const getProfileContextPath = () => {
  return path.join(getAppInfo().profileDirectory, 'profile_context.md')
}

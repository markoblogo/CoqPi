import path from 'node:path'
import { app } from 'electron'
import type { AppInfo } from '../../shared/app-types'

const resolveDataDirectory = (
  envPath: string | undefined,
  fallbackSegments: string[]
) => {
  if (envPath) {
    return path.resolve(process.cwd(), envPath)
  }

  return path.join(process.cwd(), ...fallbackSegments)
}

export const getAppInfo = (): AppInfo => {
  const profileDirectory = resolveDataDirectory(process.env.COQPI_PROFILE_DIR, [
    'data',
    'profile'
  ])
  const sessionsDirectory = resolveDataDirectory(
    process.env.COQPI_SESSIONS_DIR,
    ['data', 'sessions']
  )
  const governanceDirectory = resolveDataDirectory(
    process.env.COQPI_GOVERNANCE_DIR,
    ['data', 'governance']
  )
  const personalKnowledgeCoreDirectory = process.env
    .COQPI_PERSONAL_KNOWLEDGE_CORE_DIR
    ? path.resolve(process.cwd(), process.env.COQPI_PERSONAL_KNOWLEDGE_CORE_DIR)
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

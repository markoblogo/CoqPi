import type { ConfigStatus } from '../../shared/app-types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getOpenAIKeyStatus } from './secret-storage-service'

const envFilePath = path.join(process.cwd(), '.env')

export const getConfigStatus = async (): Promise<ConfigStatus> => {
  let hasEnvFile = false

  try {
    await fs.access(envFilePath)
    hasEnvFile = true
  } catch {
    hasEnvFile = false
  }

  const keyStatus = await getOpenAIKeyStatus()

  return {
    hasEnvFile,
    hasOpenAIKey: keyStatus.effectiveKeyAvailable,
    hasStoredKey: keyStatus.hasStoredKey,
    effectiveKeyAvailable: keyStatus.effectiveKeyAvailable
  }
}

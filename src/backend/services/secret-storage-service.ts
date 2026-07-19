import fs from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import type {
  DeleteOpenAIKeyResult,
  OpenAIKeyStatus,
  SaveOpenAIKeyResult
} from '../../shared/app-types'

const secretFilePath = path.join(
  app.getPath('userData'),
  'secrets',
  'openai-key.bin'
)

const isSafeStorageAvailable = () => safeStorage.isEncryptionAvailable()

const ensureSecretDirectory = async () => {
  await fs.mkdir(path.dirname(secretFilePath), { recursive: true })
}

const hasStoredKey = async () => {
  try {
    await fs.access(secretFilePath)
    return true
  } catch {
    return false
  }
}

export const getOpenAIKeyStatus = async (): Promise<OpenAIKeyStatus> => {
  const storedKeyAvailable = await hasStoredKey()
  const envKeyAvailable = Boolean(process.env.OPENAI_API_KEY?.trim())

  return {
    hasStoredKey: storedKeyAvailable,
    hasEnvKey: envKeyAvailable,
    effectiveKeyAvailable: storedKeyAvailable || envKeyAvailable
  }
}

export const saveOpenAIKey = async (
  key: string
): Promise<SaveOpenAIKeyResult> => {
  if (!key.trim()) {
    throw new Error('OpenAI API key cannot be empty.')
  }

  if (!isSafeStorageAvailable()) {
    throw new Error(
      'Electron safeStorage is unavailable on this machine. A secure local key cannot be saved.'
    )
  }

  await ensureSecretDirectory()
  const encrypted = safeStorage.encryptString(key.trim())
  await fs.writeFile(secretFilePath, encrypted)

  return { ok: true }
}

export const deleteOpenAIKey = async (): Promise<DeleteOpenAIKeyResult> => {
  try {
    await fs.unlink(secretFilePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  return { ok: true }
}

export const resolveOpenAIApiKey = async () => {
  if (await hasStoredKey()) {
    if (!isSafeStorageAvailable()) {
      throw new Error(
        'A stored OpenAI API key exists, but Electron safeStorage is unavailable to decrypt it.'
      )
    }

    const encrypted = await fs.readFile(secretFilePath)
    const decrypted = safeStorage.decryptString(encrypted).trim()

    if (decrypted) {
      return decrypted
    }
  }

  return process.env.OPENAI_API_KEY?.trim() || ''
}

export const getSafeStorageAvailability = () => {
  return isSafeStorageAvailable()
}

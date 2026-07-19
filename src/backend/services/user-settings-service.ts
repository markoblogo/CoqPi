import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type {
  AppUserSettings,
  SettingsMeta,
  SettingsPayload
} from '../../shared/app-types'
import { getSafeStorageAvailability } from './secret-storage-service'

const settingsFilePath = path.join(app.getPath('userData'), 'settings.json')

export const defaultAppUserSettings: AppUserSettings = {
  costMode: 'balanced',
  defaultCallLanguage: 'Auto',
  defaultAnswerLanguage: 'English',
  includeProfileContextByDefault: true,
  saveTranscriptByDefault: false
}

const sanitizeSettings = (value: unknown): AppUserSettings => {
  if (!value || typeof value !== 'object') {
    return defaultAppUserSettings
  }

  const candidate = value as Partial<AppUserSettings>

  return {
    costMode:
      candidate.costMode === 'economy' ||
      candidate.costMode === 'balanced' ||
      candidate.costMode === 'quality'
        ? candidate.costMode
        : defaultAppUserSettings.costMode,
    defaultCallLanguage:
      candidate.defaultCallLanguage === 'Auto' ||
      candidate.defaultCallLanguage === 'English' ||
      candidate.defaultCallLanguage === 'French'
        ? candidate.defaultCallLanguage
        : defaultAppUserSettings.defaultCallLanguage,
    defaultAnswerLanguage:
      candidate.defaultAnswerLanguage === 'English' ||
      candidate.defaultAnswerLanguage === 'French'
        ? candidate.defaultAnswerLanguage
        : defaultAppUserSettings.defaultAnswerLanguage,
    includeProfileContextByDefault:
      typeof candidate.includeProfileContextByDefault === 'boolean'
        ? candidate.includeProfileContextByDefault
        : defaultAppUserSettings.includeProfileContextByDefault,
    saveTranscriptByDefault:
      typeof candidate.saveTranscriptByDefault === 'boolean'
        ? candidate.saveTranscriptByDefault
        : defaultAppUserSettings.saveTranscriptByDefault
  }
}

const getSettingsMeta = (): SettingsMeta => ({
  appVersion: app.getVersion(),
  productName: app.getName(),
  safeStorageAvailable: getSafeStorageAvailability()
})

export const getStoredSettings = async () => {
  try {
    const raw = await fs.readFile(settingsFilePath, 'utf8')
    return sanitizeSettings(JSON.parse(raw))
  } catch {
    return defaultAppUserSettings
  }
}

export const getSettingsPayload = async (): Promise<SettingsPayload> => {
  return {
    settings: await getStoredSettings(),
    meta: getSettingsMeta()
  }
}

export const saveSettings = async (
  nextSettings: AppUserSettings
): Promise<SettingsPayload> => {
  const sanitized = sanitizeSettings(nextSettings)
  await fs.writeFile(
    settingsFilePath,
    JSON.stringify(sanitized, null, 2),
    'utf8'
  )

  return {
    settings: sanitized,
    meta: getSettingsMeta()
  }
}

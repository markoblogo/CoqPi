import 'dotenv/config'
import path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisError,
  AssistantAnalysisRequest,
  AssistantAnalysisResponse,
  DeleteOpenAIKeyResult,
  OpenAIKeyStatus,
  RealtimeTranscriptionError,
  RealtimeTranscriptionResponse,
  RealtimeTranscriptionStartRequest,
  SaveOpenAIKeyResult,
  SessionContext,
  SessionContextResult,
  SettingsPayload
} from '../shared/app-types'
import { analyzeRecentTranscript } from '../backend/services/assistant-service'
import { getConfigStatus } from '../backend/services/config-service'
import { getProfileContext } from '../backend/services/profile-service'
import { createRealtimeTranscriptionAnswer } from '../backend/services/realtime-transcription-service'
import {
  deleteOpenAIKey,
  getOpenAIKeyStatus,
  saveOpenAIKey
} from '../backend/services/secret-storage-service'
import {
  getSettingsPayload,
  saveSettings
} from '../backend/services/user-settings-service'
import {
  getSessionContext,
  saveSessionContext
} from '../backend/services/session-context-service'

const createMainWindow = async () => {
  const window = new BrowserWindow({
    width: 720,
    height: 430,
    minWidth: 440,
    minHeight: 320,
    title: 'CoqPi',
    backgroundColor: '#0f1115',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    await window.loadURL(devServerUrl)
    return
  }

  await window.loadFile(path.join(__dirname, '../../dist/index.html'))
}

const registerIpcHandlers = () => {
  ipcMain.handle('coqpi:config:get-status', async () => {
    return getConfigStatus()
  })

  ipcMain.handle('coqpi:profile:get-context', async () => {
    return getProfileContext()
  })

  ipcMain.handle('coqpi:profile:reload-context', async () => {
    return getProfileContext()
  })

  ipcMain.handle(
    'coqpi:session:get-context',
    async (): Promise<SessionContextResult> => {
      return getSessionContext()
    }
  )

  ipcMain.handle(
    'coqpi:session:save-context',
    async (
      _event,
      context: SessionContext
    ): Promise<SessionContextResult> => {
      return saveSessionContext(context)
    }
  )

  ipcMain.handle(
    'coqpi:secrets:get-openai-key-status',
    async (): Promise<OpenAIKeyStatus> => {
      return getOpenAIKeyStatus()
    }
  )

  ipcMain.handle(
    'coqpi:secrets:save-openai-key',
    async (_event, key: string): Promise<SaveOpenAIKeyResult> => {
      return saveOpenAIKey(key)
    }
  )

  ipcMain.handle(
    'coqpi:secrets:delete-openai-key',
    async (): Promise<DeleteOpenAIKeyResult> => {
      return deleteOpenAIKey()
    }
  )

  ipcMain.handle('coqpi:settings:get', async (): Promise<SettingsPayload> => {
    return getSettingsPayload()
  })

  ipcMain.handle(
    'coqpi:settings:save',
    async (_event, settings: AppUserSettings): Promise<SettingsPayload> => {
      return saveSettings(settings)
    }
  )

  ipcMain.handle(
    'coqpi:assistant:analyze-recent-transcript',
    async (
      _event,
      request: AssistantAnalysisRequest
    ): Promise<AssistantAnalysisResponse> => {
      try {
        const data = await analyzeRecentTranscript(request)

        return {
          ok: true,
          data
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown assistant analysis error.'

        const lowerMessage = message.toLowerCase()
        let code: AssistantAnalysisError['code'] = 'assistant_error'

        if (lowerMessage.includes('openai_api_key')) {
          code = 'missing_api_key'
        } else if (lowerMessage.includes('transcript is empty')) {
          code = 'empty_transcript'
        } else if (lowerMessage.includes('profile context')) {
          code = 'profile_context_error'
        } else if (lowerMessage.includes('invalid model response')) {
          code = 'invalid_model_response'
        } else if (lowerMessage.includes('failed')) {
          code = 'api_failure'
        }

        return {
          ok: false,
          error: {
            code,
            message
          }
        }
      }
    }
  )

  ipcMain.handle(
    'coqpi:realtime:create-transcription-answer',
    async (
      _event,
      request: RealtimeTranscriptionStartRequest
    ): Promise<RealtimeTranscriptionResponse> => {
      try {
        const data = await createRealtimeTranscriptionAnswer(request)

        return {
          ok: true,
          data
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown realtime transcription error.'

        const lowerMessage = message.toLowerCase()
        let code: RealtimeTranscriptionError['code'] = 'realtime_error'

        if (lowerMessage.includes('openai_api_key')) {
          code = 'missing_api_key'
        } else if (lowerMessage.includes('sdp offer is empty')) {
          code = 'invalid_offer_sdp'
        } else if (lowerMessage.includes('empty sdp answer')) {
          code = 'invalid_answer_sdp'
        } else if (
          lowerMessage.includes('openai realtime api request failed')
        ) {
          code = 'backend_openai_failure'
        }

        return {
          ok: false,
          error: {
            code,
            message
          }
        }
      }
    }
  )
}

app.whenReady().then(async () => {
  app.setName('CoqPi')
  registerIpcHandlers()
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

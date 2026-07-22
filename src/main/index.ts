import 'dotenv/config'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisError,
  AssistantAnalysisRequest,
  AssistantAnalysisResponse,
  ContextSourceDraft,
  ContextSourceManifestResult,
  CounterpartyContextPackDraft,
  DeleteOpenAIKeyResult,
  FinderCandidateResultDraft,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSearchStoreResult,
  OpenAIKeyStatus,
  RealtimeTranscriptionError,
  RealtimeTranscriptionResponse,
  RealtimeTranscriptionStartRequest,
  SaveOpenAIKeyResult,
  SessionContext,
  SessionContextResult,
  SmokeTestNote,
  SmokeTestNoteDraft,
  SmokeTestNotesResult,
  SettingsPayload
} from '../shared/app-types'
import { analyzeRecentTranscript } from '../backend/services/assistant-service'
import { isRetryableProviderError } from '../backend/services/assistant-service-retry-policy'
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
import {
  getSmokeTestNotes,
  saveSmokeTestNote
} from '../backend/services/smoke-note-service'
import {
  addFinderCandidateResult,
  addFinderSearchJob,
  getFinderSearchStore,
  ingestFinderRunnerPayload,
  saveFinderOutreachDraft,
  setFinderCandidateResultStatus,
  setFinderSearchJobStatus
} from '../backend/services/finder-search-service'
import {
  addContextSource,
  addCounterpartyContextPacks,
  ingestCounterpartyFinderPayload,
  ingestCounterpartyFinderPayloadDrafts,
  previewCounterpartyFinderPayload,
  captureAndClassifyContextSource,
  getContextSourceManifest,
  getCounterpartyContextPacks,
  removeCounterpartyContextPack,
  removeContextSource,
  setCounterpartyContextPackSelected,
  setContextSourceSelected
} from '../backend/services/context-source-service'

const createMainWindow = async () => {
  const window = new BrowserWindow({
    width: 720,
    height: 430,
    minWidth: 440,
    minHeight: 320,
    title: 'CoqPi',
    backgroundColor: '#0f1115',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.platform === 'darwin') {
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

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
    'coqpi:context-sources:capture-and-classify',
    async (_event, id: string): Promise<ContextSourceManifestResult> =>
      captureAndClassifyContextSource(id)
  )

  ipcMain.handle(
    'coqpi:context-sources:get',
    async (): Promise<ContextSourceManifestResult> => getContextSourceManifest()
  )

  ipcMain.handle(
    'coqpi:context-packs:get',
    async (): Promise<ContextSourceManifestResult> => getCounterpartyContextPacks()
  )

  ipcMain.handle(
    'coqpi:context-sources:add',
    async (
      _event,
      draft: ContextSourceDraft
    ): Promise<ContextSourceManifestResult> => addContextSource(draft)
  )

  ipcMain.handle(
    'coqpi:context-sources:set-selected',
    async (
      _event,
      id: string,
      selected: boolean
    ): Promise<ContextSourceManifestResult> =>
      setContextSourceSelected(id, selected)
  )

  ipcMain.handle(
    'coqpi:context-sources:remove',
    async (_event, id: string): Promise<ContextSourceManifestResult> =>
      removeContextSource(id)
  )

  ipcMain.handle(
    'coqpi:context-packs:add',
    async (
      _event,
      packs: CounterpartyContextPackDraft[]
    ): Promise<ContextSourceManifestResult> =>
      addCounterpartyContextPacks(packs)
  )

  ipcMain.handle(
    'coqpi:context-packs:ingest-finder',
    async (_event, payloadText: string): Promise<ContextSourceManifestResult> => {
      return ingestCounterpartyFinderPayload(payloadText)
    }
  )

  ipcMain.handle(
    'coqpi:context-packs:ingest-finder-batch',
    async (
      _event,
      candidatePacks: unknown[]
    ): Promise<ContextSourceManifestResult> =>
      ingestCounterpartyFinderPayloadDrafts(candidatePacks)
  )

  ipcMain.handle(
    'coqpi:context-packs:parse-finder',
    async (_event, payloadText: string) => {
      return previewCounterpartyFinderPayload(payloadText)
    }
  )

  ipcMain.handle(
    'coqpi:context-packs:set-selected',
    async (
      _event,
      id: string,
      selected: boolean
    ): Promise<ContextSourceManifestResult> =>
      setCounterpartyContextPackSelected(id, selected)
  )

  ipcMain.handle(
    'coqpi:context-packs:remove',
    async (_event, id: string): Promise<ContextSourceManifestResult> =>
      removeCounterpartyContextPack(id)
  )

  ipcMain.handle('coqpi:context-sources:pick-files', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Stage local files',
      properties: ['openFile', 'multiSelections']
    })

    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('coqpi:context-sources:pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Stage a local folder',
      properties: ['openDirectory']
    })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })


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
    'coqpi:smoke-notes:get',
    async (): Promise<SmokeTestNotesResult> => getSmokeTestNotes()
  )

  ipcMain.handle(
    'coqpi:smoke-notes:save',
    async (_event, draft: SmokeTestNoteDraft): Promise<SmokeTestNote> =>
      saveSmokeTestNote(draft)
  )

  ipcMain.handle(
    'coqpi:finder-search:get',
    async (): Promise<FinderSearchStoreResult> => getFinderSearchStore()
  )

  ipcMain.handle(
    'coqpi:finder-search:add-job',
    async (
      _event,
      draft: FinderSearchJobDraft
    ): Promise<FinderSearchStoreResult> => addFinderSearchJob(draft)
  )

  ipcMain.handle(
    'coqpi:finder-search:set-job-status',
    async (
      _event,
      id: string,
      status: FinderSearchJobStatus
    ): Promise<FinderSearchStoreResult> => setFinderSearchJobStatus(id, status)
  )

  ipcMain.handle(
    'coqpi:finder-search:add-candidate-result',
    async (
      _event,
      jobId: string,
      draft: FinderCandidateResultDraft
    ): Promise<FinderSearchStoreResult> => addFinderCandidateResult(jobId, draft)
  )

  ipcMain.handle(
    'coqpi:finder-search:set-candidate-status',
    async (
      _event,
      id: string,
      status: 'ready' | 'imported' | 'rejected'
    ): Promise<FinderSearchStoreResult> =>
      setFinderCandidateResultStatus(id, status)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-runner-payload',
    async (_event, payloadText: string): Promise<FinderSearchStoreResult> =>
      ingestFinderRunnerPayload(payloadText)
  )

  ipcMain.handle(
    'coqpi:finder-search:save-outreach-draft',
    async (
      _event,
      candidateResultId: string
    ): Promise<FinderSearchStoreResult> =>
      saveFinderOutreachDraft(candidateResultId)
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
        const analysisError =
          error instanceof Error
            ? error
            : new Error('Unknown assistant analysis error.')
        const message = analysisError.message

        const source =
          typeof (analysisError as { source?: unknown }).source === 'string'
            ? ((analysisError as { source?: string }).source ?? null)
            : null
        const routeSourceMatch =
          source ??
          message.match(/\((openai\([^)]*\)|ollama\([^)]*\))\)/i)?.[1] ??
          message.match(/\(([^)]*provider[^)]*)\)/i)?.[1]

        const lowerMessage = message.toLowerCase()
        let code: AssistantAnalysisError['code'] = 'assistant_error'

        if (lowerMessage.includes('timed out')) {
          code = 'provider_timeout'
        } else if (lowerMessage.includes('budget exhausted')) {
          code = 'analysis_budget_exhausted'
        } else if (lowerMessage.includes('openai_api_key')) {
          code = 'missing_api_key'
        } else if (lowerMessage.includes('transcript is empty')) {
          code = 'empty_transcript'
        } else if (lowerMessage.includes('profile context')) {
          code = 'profile_context_error'
        } else if (lowerMessage.includes('invalid model response')) {
          code = 'invalid_model_response'
        } else if (isRetryableProviderError(analysisError)) {
          code = 'provider_error'
        } else {
          code = 'provider_not_retryable'
        }

        return {
          ok: false,
          error: {
            code,
            message,
            source: routeSourceMatch
              ? String(routeSourceMatch)
              : source
                ? String(source)
                : 'local policy / transport'
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

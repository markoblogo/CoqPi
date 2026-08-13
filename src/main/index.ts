import dotenv from 'dotenv'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisError,
  AssistantAnalysisRequest,
  AssistantAnalysisResponse,
  CortexBridgeExport,
  ContextSourceDraft,
  ContextSourceManifestResult,
  CounterpartyContextPackDraft,
  FinderCandidateDecisionState,
  FinderOutreachDraft,
  KnowledgePackLifecycleDraft,
  DeleteOpenAIKeyResult,
  FinderCandidateResultDraft,
  FinderOwnerSourceSessionIngressResult,
  FinderSourceAdapterPreviewResult,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSearchStoreResult,
  OpenAIKeyStatus,
  PreparationContextResult,
  RealtimeTranscriptionError,
  MeetingTranscriptionExportRequest,
  MeetingTranscriptionExportResult,
  MeetingTranscriptionSaveResult,
  RealtimeTranscriptionResponse,
  RealtimeTranscriptionStartRequest,
  SaveOpenAIKeyResult,
  SessionContext,
  SessionContextResult,
  SessionSummariesResult,
  SessionSummary,
  SessionSummaryDraft,
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
  clearCurrentMeetingTranscriptionSession,
  getCurrentMeetingTranscriptionSession,
  getMeetingTranscriptDefaultFilename,
  saveCurrentMeetingTranscriptionSession,
  writeMeetingTranscriptExport
} from '../backend/services/meeting-transcription-service'
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
import { requestPreparationContext } from '../backend/services/preparation-context-service'
import {
  getSmokeTestNotes,
  saveSmokeTestNote
} from '../backend/services/smoke-note-service'
import {
  getSessionSummaries,
  saveSessionSummary
} from '../backend/services/session-summary-service'
import {
  addFinderCandidateResult,
  addFinderSearchJob,
  getFinderSearchStore,
  ingestFinderManualComplexPageSourceCandidates,
  ingestFinderPublicPageSourceCandidates,
  ingestFinderOwnerPastedSource,
  ingestFinderOwnerPastedSourceCandidates,
  ingestFinderRunnerPayload,
  previewFinderManualComplexPageSource,
  previewFinderPublicPageSource,
  previewFinderOwnerPastedSource,
  runManualFinderSearchJob,
  saveFinderOutreachDraft,
  setFinderOutreachDraftStatus,
  setFinderCandidateResultDecision,
  setFinderCandidateResultStatus,
  setFinderSearchJobStatus
} from '../backend/services/finder-search-service'
import {
  ingestFinderManualComplexPageCandidatesToSession,
  ingestFinderPublicPageCandidatesToSession,
  ingestFinderOwnerSourceCandidatesToSession
} from '../backend/services/finder-session-ingress-service'
import {
  addContextSource,
  addCounterpartyContextPacks,
  ingestCounterpartyFinderPayload,
  ingestCounterpartyFinderPayloadDrafts,
  previewCounterpartyFinderPayload,
  captureAndClassifyContextSource,
  getContextSourceManifest,
  getCounterpartyContextPacks,
  buildCortexContextBridgeExport,
  recordKnowledgePackLifecycle,
  removeCounterpartyContextPack,
  removeContextSource,
  setCounterpartyContextPackSelected,
  setContextSourceSelected
} from '../backend/services/context-source-service'
import {
  approveMailDraftBatch,
  assembleOpportunityApplicationPack,
  configureOpportunityJob,
  createReplyDraftFromThread,
  createFollowUpDraftFromSessionSummary,
  getOpportunityMetrics,
  getOpportunityStore,
  runDueOpportunityJobs,
  runOpportunityDiscovery,
  saveLocalMailDraft,
  updateLocalMailDraft
} from '../backend/services/opportunity-service'
import {
  connectGoogleWorkspace,
  createApprovedCalendarEvent,
  createCalendarProposalFromReply,
  createGmailDraft,
  disconnectGoogleWorkspace,
  getGoogleConnectionStatus,
  sendApprovedMailBatch,
  syncLinkedGmailThreads
} from '../backend/services/google-workspace-service'

const loadLocalEnv = () => {
  const candidatePaths = [
    process.env.COQPI_ENV_FILE,
    path.join(process.cwd(), '.env'),
    process.resourcesPath
      ? path.resolve(process.resourcesPath, '..', '..', '..', '..', '.env')
      : undefined,
    process.execPath
      ? path.resolve(path.dirname(process.execPath), '..', '..', '..', '..', '..', '.env')
      : undefined
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const envPath of candidatePaths) {
    dotenv.config({ path: envPath })

    if (process.env.OPENAI_API_KEY?.trim()) {
      break
    }
  }
}

loadLocalEnv()

const createMainWindow = async () => {
  const window = new BrowserWindow({
    width: 860,
    height: 540,
    minWidth: 720,
    minHeight: 480,
    title: 'CoqPi',
    backgroundColor: '#0f1115',
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.webContents.on(
    'console-message',
    (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        console.warn(
          `[renderer:${level}] ${message} (${sourceId}:${line})`
        )
      }
    }
  )

  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`
      )
    }
  )

  if (process.platform === 'darwin') {
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    await window.loadURL(devServerUrl)
    return
  }

  await window.loadURL(
    pathToFileURL(path.join(__dirname, '../../dist/index.html')).toString()
  )
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
    'coqpi:context-packs:record-knowledge-lifecycle',
    async (
      _event,
      draft: KnowledgePackLifecycleDraft
    ): Promise<ContextSourceManifestResult> =>
      recordKnowledgePackLifecycle(draft)
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

  ipcMain.handle(
    'coqpi:cortex-bridge:build-export',
    async (): Promise<CortexBridgeExport> => {
      const sessionContextResult = await getSessionContext()
      return buildCortexContextBridgeExport(
        sessionContextResult.context.selectedCounterpartyPackIds
      )
    }
  )

  ipcMain.handle(
    'coqpi:preparation-context:request',
    async (
      _event,
      context: SessionContext
    ): Promise<PreparationContextResult> => requestPreparationContext(context)
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
    'coqpi:session-summaries:get',
    async (
      _event,
      sourceId?: string
    ): Promise<SessionSummariesResult> => getSessionSummaries({ sourceId })
  )

  ipcMain.handle(
    'coqpi:session-summaries:save',
    async (
      _event,
      draft: SessionSummaryDraft
    ): Promise<SessionSummary> => saveSessionSummary(draft)
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
    'coqpi:finder-search:set-candidate-decision',
    async (
      _event,
      id: string,
      state: FinderCandidateDecisionState,
      reason?: string
    ) => setFinderCandidateResultDecision(id, state, reason)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-runner-payload',
    async (_event, payloadText: string): Promise<FinderSearchStoreResult> =>
      ingestFinderRunnerPayload(payloadText)
  )

  ipcMain.handle(
    'coqpi:finder-search:run-job',
    async (_event, jobId: string): Promise<FinderSearchStoreResult> =>
      runManualFinderSearchJob(jobId)
  )

  ipcMain.handle(
    'coqpi:finder-search:preview-owner-source',
    async (
      _event,
      jobId: string,
      sourceText: string
    ): Promise<FinderSourceAdapterPreviewResult> =>
      previewFinderOwnerPastedSource(jobId, sourceText)
  )

  ipcMain.handle(
    'coqpi:finder-search:preview-public-page-source',
    async (
      _event,
      jobId: string,
      sourceUrl: string
    ): Promise<FinderSourceAdapterPreviewResult> =>
      previewFinderPublicPageSource(jobId, sourceUrl)
  )

  ipcMain.handle(
    'coqpi:finder-search:preview-manual-complex-page-source',
    async (
      _event,
      jobId: string,
      sourceUrl: string,
      sourceText: string
    ): Promise<FinderSourceAdapterPreviewResult> =>
      previewFinderManualComplexPageSource(jobId, sourceUrl, sourceText)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-owner-source',
    async (
      _event,
      jobId: string,
      sourceText: string
    ): Promise<FinderSearchStoreResult> =>
      ingestFinderOwnerPastedSource(jobId, sourceText)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-owner-source-candidates',
    async (
      _event,
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ): Promise<FinderSearchStoreResult> =>
      ingestFinderOwnerPastedSourceCandidates(jobId, drafts)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-public-page-source-candidates',
    async (
      _event,
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ): Promise<FinderSearchStoreResult> =>
      ingestFinderPublicPageSourceCandidates(jobId, drafts)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-manual-complex-page-source-candidates',
    async (
      _event,
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ): Promise<FinderSearchStoreResult> =>
      ingestFinderManualComplexPageSourceCandidates(jobId, drafts)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-owner-source-to-session',
    async (
      _event,
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ): Promise<FinderOwnerSourceSessionIngressResult> =>
      ingestFinderOwnerSourceCandidatesToSession(jobId, drafts)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-public-page-source-to-session',
    async (
      _event,
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ): Promise<FinderOwnerSourceSessionIngressResult> =>
      ingestFinderPublicPageCandidatesToSession(jobId, drafts)
  )

  ipcMain.handle(
    'coqpi:finder-search:ingest-manual-complex-page-source-to-session',
    async (
      _event,
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ): Promise<FinderOwnerSourceSessionIngressResult> =>
      ingestFinderManualComplexPageCandidatesToSession(jobId, drafts)
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
    'coqpi:finder-search:set-outreach-draft-status',
    async (
      _event,
      draftId: string,
      status: FinderOutreachDraft['status']
    ): Promise<FinderSearchStoreResult> =>
      setFinderOutreachDraftStatus(draftId, status)
  )

  ipcMain.handle('coqpi:opportunities:get', async () => getOpportunityStore())
  ipcMain.handle('coqpi:opportunities:configure-job', async (_event, jobId, config) =>
    configureOpportunityJob(jobId, config)
  )
  ipcMain.handle('coqpi:opportunities:run-discovery', async (_event, jobId) =>
    runOpportunityDiscovery(jobId)
  )
  ipcMain.handle('coqpi:opportunities:run-due', async () => runDueOpportunityJobs())
  ipcMain.handle('coqpi:opportunities:assemble-pack', async (_event, input) =>
    assembleOpportunityApplicationPack(input)
  )
  ipcMain.handle('coqpi:opportunities:save-mail-draft', async (_event, input) =>
    saveLocalMailDraft(input)
  )
  ipcMain.handle('coqpi:opportunities:update-mail-draft', async (_event, id, patch) =>
    updateLocalMailDraft(id, patch)
  )
  ipcMain.handle('coqpi:opportunities:approve-mail-batch', async (_event, draftIds) =>
    approveMailDraftBatch(draftIds)
  )
  ipcMain.handle('coqpi:opportunities:google-status', async () => getGoogleConnectionStatus())
  ipcMain.handle('coqpi:opportunities:google-connect', async (_event, capability) =>
    connectGoogleWorkspace(capability)
  )
  ipcMain.handle('coqpi:opportunities:google-disconnect', async () => disconnectGoogleWorkspace())
  ipcMain.handle('coqpi:opportunities:create-gmail-draft', async (_event, draftId) =>
    createGmailDraft(draftId)
  )
  ipcMain.handle('coqpi:opportunities:send-approved-batch', async (_event, approvalId) =>
    sendApprovedMailBatch(approvalId)
  )
  ipcMain.handle('coqpi:opportunities:sync-replies', async () => syncLinkedGmailThreads())
  ipcMain.handle('coqpi:opportunities:create-reply-draft', async (_event, input) =>
    createReplyDraftFromThread(input)
  )
  ipcMain.handle('coqpi:opportunities:create-post-call-follow-up', async (_event, input) =>
    createFollowUpDraftFromSessionSummary(input)
  )
  ipcMain.handle('coqpi:opportunities:create-calendar-proposal', async (_event, input) =>
    createCalendarProposalFromReply(input)
  )
  ipcMain.handle('coqpi:opportunities:create-calendar-event', async (_event, proposalId, approvedContentHash) =>
    createApprovedCalendarEvent(proposalId, approvedContentHash)
  )
  ipcMain.handle('coqpi:opportunities:get-metrics', async () => getOpportunityMetrics())

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

  ipcMain.handle(
    'coqpi:meeting-transcription:get-current',
    async () => getCurrentMeetingTranscriptionSession()
  )

  ipcMain.handle(
    'coqpi:meeting-transcription:save-current',
    async (
      _event,
      session
    ): Promise<MeetingTranscriptionSaveResult> =>
      saveCurrentMeetingTranscriptionSession(session)
  )

  ipcMain.handle(
    'coqpi:meeting-transcription:clear-current',
    async (): Promise<MeetingTranscriptionSaveResult> =>
      clearCurrentMeetingTranscriptionSession()
  )

  ipcMain.handle(
    'coqpi:meeting-transcription:export',
    async (
      _event,
      request: MeetingTranscriptionExportRequest
    ): Promise<MeetingTranscriptionExportResult> => {
      const result = await dialog.showSaveDialog({
        title: 'Save meeting transcript',
        defaultPath: getMeetingTranscriptDefaultFilename(request),
        filters: [
          request.format === 'txt'
            ? { name: 'Plain text', extensions: ['txt'] }
            : { name: 'Markdown', extensions: ['md'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      return writeMeetingTranscriptExport(request, result.filePath)
    }
  )
}

app.whenReady().then(async () => {
  app.setName('CoqPi')
  registerIpcHandlers()
  await createMainWindow()
  void runDueOpportunityJobs().catch((error) => {
    console.warn('Opportunity daily catch-up failed:', error)
  })
  const opportunityScheduler = setInterval(() => {
    void runDueOpportunityJobs().catch((error) => {
      console.warn('Opportunity daily scheduler failed:', error)
    })
  }, 15 * 60 * 1000)
  opportunityScheduler.unref()

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

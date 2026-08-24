import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  ContextSourceDraft,
  CortexBridgeExport,
  CounterpartyContextPackDraft,
  FinderOutreachDraft,
  KnowledgePackLifecycleDraft,
  FinderCandidateDecisionState,
  FinderCandidateResultDraft,
  FinderOwnerSourceSessionIngressResult,
  FinderSourceAdapterPreviewResult,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  MeetingTranscriptionExportRequest,
  PreparationContextResult,
  RealtimeTranscriptionStartRequest,
  SessionContext,
  SessionSummaryDraft,
  SmokeTestNoteDraft,
  TrainingSessionEntry
} from '../shared/app-types'
import type { MeetingTranscriptionSession } from '../shared/meeting-transcription'
import type {
  CalendarProposal,
  MailDraftRecord,
  OpportunitySearchJobV2,
  OpportunityStoreV2
} from '../shared/opportunity-contracts'

contextBridge.exposeInMainWorld('coqpi', {
  config: {
    getStatus: () => ipcRenderer.invoke('coqpi:config:get-status')
  },
  profile: {
    getContext: () => ipcRenderer.invoke('coqpi:profile:get-context'),
    reloadContext: () => ipcRenderer.invoke('coqpi:profile:reload-context')
  },
  session: {
    getContext: () => ipcRenderer.invoke('coqpi:session:get-context'),
    saveContext: (context: SessionContext) =>
      ipcRenderer.invoke('coqpi:session:save-context', context)
  },
  smokeNotes: {
    get: () => ipcRenderer.invoke('coqpi:smoke-notes:get'),
    save: (draft: SmokeTestNoteDraft) =>
      ipcRenderer.invoke('coqpi:smoke-notes:save', draft)
  },
  sessionSummaries: {
    get: (sourceId?: string) =>
      ipcRenderer.invoke('coqpi:session-summaries:get', sourceId),
    save: (draft: SessionSummaryDraft) =>
      ipcRenderer.invoke('coqpi:session-summaries:save', draft)
  },
  trainingSessions: {
    get: () => ipcRenderer.invoke('coqpi:training-sessions:get'),
    save: (entry: TrainingSessionEntry) =>
      ipcRenderer.invoke('coqpi:training-sessions:save', entry)
  },
  finderSearch: {
    get: () => ipcRenderer.invoke('coqpi:finder-search:get'),
    addJob: (draft: FinderSearchJobDraft) =>
      ipcRenderer.invoke('coqpi:finder-search:add-job', draft),
    setJobStatus: (id: string, status: FinderSearchJobStatus) =>
      ipcRenderer.invoke('coqpi:finder-search:set-job-status', id, status),
    addCandidateResult: (jobId: string, draft: FinderCandidateResultDraft) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:add-candidate-result',
        jobId,
        draft
      ),
    setCandidateStatus: (
      id: string,
      status: 'ready' | 'imported' | 'rejected'
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:set-candidate-status',
        id,
        status
      ),
    setCandidateDecision: (
      id: string,
      state: FinderCandidateDecisionState,
      reason?: string
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:set-candidate-decision',
        id,
        state,
        reason
      ),
    ingestRunnerPayload: (payloadText: string) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-runner-payload',
        payloadText
      ),
    runJob: (jobId: string) =>
      ipcRenderer.invoke('coqpi:finder-search:run-job', jobId),
    previewOwnerSource: (jobId: string, sourceText: string) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:preview-owner-source',
        jobId,
        sourceText
      ) as Promise<FinderSourceAdapterPreviewResult>,
    previewPublicPageSource: (jobId: string, sourceUrl: string) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:preview-public-page-source',
        jobId,
        sourceUrl
      ) as Promise<FinderSourceAdapterPreviewResult>,
    previewManualComplexPageSource: (
      jobId: string,
      sourceUrl: string,
      sourceText: string
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:preview-manual-complex-page-source',
        jobId,
        sourceUrl,
        sourceText
      ) as Promise<FinderSourceAdapterPreviewResult>,
    ingestOwnerSource: (jobId: string, sourceText: string) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-owner-source',
        jobId,
        sourceText
      ),
    ingestOwnerSourceCandidates: (
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-owner-source-candidates',
        jobId,
        drafts
      ),
    ingestPublicPageSourceCandidates: (
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-public-page-source-candidates',
        jobId,
        drafts
      ),
    ingestManualComplexPageSourceCandidates: (
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-manual-complex-page-source-candidates',
        jobId,
        drafts
      ),
    ingestOwnerSourceToSession: (
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-owner-source-to-session',
        jobId,
        drafts
      ) as Promise<FinderOwnerSourceSessionIngressResult>,
    ingestPublicPageSourceToSession: (
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-public-page-source-to-session',
        jobId,
        drafts
      ) as Promise<FinderOwnerSourceSessionIngressResult>,
    ingestManualComplexPageSourceToSession: (
      jobId: string,
      drafts: FinderCandidateResultDraft[]
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:ingest-manual-complex-page-source-to-session',
        jobId,
        drafts
      ) as Promise<FinderOwnerSourceSessionIngressResult>,
    saveOutreachDraft: (candidateResultId: string) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:save-outreach-draft',
        candidateResultId
      ),
    setOutreachDraftStatus: (
      draftId: string,
      status: FinderOutreachDraft['status']
    ) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:set-outreach-draft-status',
        draftId,
        status
      )
  },
  opportunities: {
    get: () => ipcRenderer.invoke('coqpi:opportunities:get') as Promise<OpportunityStoreV2>,
    configureJob: (jobId: string, config: Partial<OpportunitySearchJobV2>) =>
      ipcRenderer.invoke('coqpi:opportunities:configure-job', jobId, config) as Promise<OpportunityStoreV2>,
    runDiscovery: (jobId: string) =>
      ipcRenderer.invoke('coqpi:opportunities:run-discovery', jobId),
    runDue: () => ipcRenderer.invoke('coqpi:opportunities:run-due'),
    assemblePack: (input: { candidateId: string; ownerFactsToUse: string[]; ownerFactsToAvoid: string[]; materialIds?: string[] }) =>
      ipcRenderer.invoke('coqpi:opportunities:assemble-pack', input),
    saveMailDraft: (input: { applicationPackId: string; recipient: string; subject: string; body: string; attachmentPaths?: string[] }) =>
      ipcRenderer.invoke('coqpi:opportunities:save-mail-draft', input) as Promise<MailDraftRecord>,
    updateMailDraft: (id: string, patch: Pick<MailDraftRecord, 'recipient' | 'subject' | 'body' | 'attachmentPaths'>) =>
      ipcRenderer.invoke('coqpi:opportunities:update-mail-draft', id, patch) as Promise<MailDraftRecord>,
    approveMailBatch: (draftIds: string[]) =>
      ipcRenderer.invoke('coqpi:opportunities:approve-mail-batch', draftIds),
    getGoogleStatus: () => ipcRenderer.invoke('coqpi:opportunities:google-status'),
    connectGoogle: (capability: 'mail' | 'calendar') =>
      ipcRenderer.invoke('coqpi:opportunities:google-connect', capability),
    disconnectGoogle: () => ipcRenderer.invoke('coqpi:opportunities:google-disconnect'),
    createGmailDraft: (draftId: string) =>
      ipcRenderer.invoke('coqpi:opportunities:create-gmail-draft', draftId),
    sendApprovedBatch: (approvalId: string) =>
      ipcRenderer.invoke('coqpi:opportunities:send-approved-batch', approvalId),
    syncReplies: () => ipcRenderer.invoke('coqpi:opportunities:sync-replies'),
    createReplyDraft: (input: { threadSummaryId: string; body?: string }) =>
      ipcRenderer.invoke('coqpi:opportunities:create-reply-draft', input),
    createPostCallFollowUp: (input: { sessionSummaryId: string; applicationPackId: string; recipient: string; body?: string }) =>
      ipcRenderer.invoke('coqpi:opportunities:create-post-call-follow-up', input),
    createCalendarProposal: (input: Omit<CalendarProposal, 'version' | 'id' | 'status' | 'contentHash'>) =>
      ipcRenderer.invoke('coqpi:opportunities:create-calendar-proposal', input),
    createCalendarEvent: (proposalId: string, approvedContentHash: string) =>
      ipcRenderer.invoke('coqpi:opportunities:create-calendar-event', proposalId, approvedContentHash),
    getMetrics: () => ipcRenderer.invoke('coqpi:opportunities:get-metrics')
  },
  contextSources: {
    get: () => ipcRenderer.invoke('coqpi:context-sources:get'),
    add: (draft: ContextSourceDraft) =>
      ipcRenderer.invoke('coqpi:context-sources:add', draft),
    setSelected: (id: string, selected: boolean) =>
      ipcRenderer.invoke('coqpi:context-sources:set-selected', id, selected),
    captureAndClassify: (id: string) =>
      ipcRenderer.invoke('coqpi:context-sources:capture-and-classify', id),
    remove: (id: string) => ipcRenderer.invoke('coqpi:context-sources:remove', id),
    pickFiles: () => ipcRenderer.invoke('coqpi:context-sources:pick-files'),
    pickFolder: () => ipcRenderer.invoke('coqpi:context-sources:pick-folder')
  },
  contextPacks: {
    get: () => ipcRenderer.invoke('coqpi:context-packs:get'),
    add: (packs: CounterpartyContextPackDraft[]) =>
      ipcRenderer.invoke('coqpi:context-packs:add', packs),
    recordKnowledgeLifecycle: (draft: KnowledgePackLifecycleDraft) =>
      ipcRenderer.invoke('coqpi:context-packs:record-knowledge-lifecycle', draft),
    ingestFinderPayloadBatch: (candidatePacks: unknown[]) =>
      ipcRenderer.invoke(
        'coqpi:context-packs:ingest-finder-batch',
        candidatePacks
      ),
    ingestFinderPayload: (payloadText: string) =>
      ipcRenderer.invoke('coqpi:context-packs:ingest-finder', payloadText),
    parseFinderPayload: (payloadText: string) =>
      ipcRenderer.invoke('coqpi:context-packs:parse-finder', payloadText),
    setSelected: (id: string, selected: boolean) =>
      ipcRenderer.invoke('coqpi:context-packs:set-selected', id, selected),
    remove: (id: string) => ipcRenderer.invoke('coqpi:context-packs:remove', id)
  },
  secrets: {
    getOpenAIKeyStatus: () =>
      ipcRenderer.invoke('coqpi:secrets:get-openai-key-status'),
    saveOpenAIKey: (key: string) =>
      ipcRenderer.invoke('coqpi:secrets:save-openai-key', key),
    deleteOpenAIKey: () => ipcRenderer.invoke('coqpi:secrets:delete-openai-key')
  },
  settings: {
    get: () => ipcRenderer.invoke('coqpi:settings:get'),
    save: (settings: AppUserSettings) =>
      ipcRenderer.invoke('coqpi:settings:save', settings)
  },
  cortexBridge: {
    buildExport: (): Promise<CortexBridgeExport> =>
      ipcRenderer.invoke('coqpi:cortex-bridge:build-export')
  },
  preparationContext: {
    request: (context: SessionContext): Promise<PreparationContextResult> =>
      ipcRenderer.invoke('coqpi:preparation-context:request', context)
  },
  assistant: {
    analyzeRecentTranscript: (request: AssistantAnalysisRequest) =>
      ipcRenderer.invoke('coqpi:assistant:analyze-recent-transcript', request)
  },
  realtime: {
    createTranscriptionAnswer: (request: RealtimeTranscriptionStartRequest) =>
      ipcRenderer.invoke('coqpi:realtime:create-transcription-answer', request)
  },
  meetingTranscription: {
    getCurrent: (): Promise<MeetingTranscriptionSession | null> =>
      ipcRenderer.invoke('coqpi:meeting-transcription:get-current'),
    saveCurrent: (session: MeetingTranscriptionSession) =>
      ipcRenderer.invoke('coqpi:meeting-transcription:save-current', session),
    clearCurrent: () =>
      ipcRenderer.invoke('coqpi:meeting-transcription:clear-current'),
    flush: () => ipcRenderer.invoke('coqpi:meeting-transcription:flush'),
    exportSession: (request: MeetingTranscriptionExportRequest) =>
      ipcRenderer.invoke('coqpi:meeting-transcription:export', request)
  }
})

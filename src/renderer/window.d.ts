import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  AssistantAnalysisResponse,
  CortexBridgeExport,
  ContextSourceDraft,
  CounterpartyContextPackDraft,
  CounterpartyFinderPayloadPreviewResult,
  ContextSourceManifestResult,
  ConfigStatus,
  DeleteOpenAIKeyResult,
  FinderCandidateDecisionState,
  FinderCandidateResultDraft,
  FinderOutreachDraft,
  FinderOwnerSourceSessionIngressResult,
  FinderSourceAdapterPreviewResult,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSearchStoreResult,
  KnowledgePackLifecycleDraft,
  OpenAIKeyStatus,
  PreparationContextResult,
  ProfileContextResult,
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
} from '@shared/app-types'

declare global {
  interface Window {
    coqpi: {
      config: {
        getStatus: () => Promise<ConfigStatus>
      }
      profile: {
        getContext: () => Promise<ProfileContextResult>
        reloadContext: () => Promise<ProfileContextResult>
      }
      session: {
        getContext: () => Promise<SessionContextResult>
        saveContext: (context: SessionContext) => Promise<SessionContextResult>
      }
      smokeNotes: {
        get: () => Promise<SmokeTestNotesResult>
        save: (draft: SmokeTestNoteDraft) => Promise<SmokeTestNote>
      }
      sessionSummaries: {
        get: (sourceId?: string) => Promise<SessionSummariesResult>
        save: (draft: SessionSummaryDraft) => Promise<SessionSummary>
      }
      finderSearch: {
        get: () => Promise<FinderSearchStoreResult>
        addJob: (draft: FinderSearchJobDraft) => Promise<FinderSearchStoreResult>
        setJobStatus: (
          id: string,
          status: FinderSearchJobStatus
        ) => Promise<FinderSearchStoreResult>
        addCandidateResult: (
          jobId: string,
          draft: FinderCandidateResultDraft
        ) => Promise<FinderSearchStoreResult>
        setCandidateStatus: (
          id: string,
          status: 'ready' | 'imported' | 'rejected'
        ) => Promise<FinderSearchStoreResult>
        setCandidateDecision: (
          id: string,
          state: FinderCandidateDecisionState,
          reason?: string
        ) => Promise<FinderSearchStoreResult>
        ingestRunnerPayload: (
          payloadText: string
        ) => Promise<FinderSearchStoreResult>
        runJob: (jobId: string) => Promise<FinderSearchStoreResult>
        previewOwnerSource: (
          jobId: string,
          sourceText: string
        ) => Promise<FinderSourceAdapterPreviewResult>
        previewPublicPageSource: (
          jobId: string,
          sourceUrl: string
        ) => Promise<FinderSourceAdapterPreviewResult>
        previewManualComplexPageSource: (
          jobId: string,
          sourceUrl: string,
          sourceText: string
        ) => Promise<FinderSourceAdapterPreviewResult>
        ingestOwnerSource: (
          jobId: string,
          sourceText: string
        ) => Promise<FinderSearchStoreResult>
        ingestOwnerSourceCandidates: (
          jobId: string,
          drafts: FinderCandidateResultDraft[]
        ) => Promise<FinderSearchStoreResult>
        ingestPublicPageSourceCandidates: (
          jobId: string,
          drafts: FinderCandidateResultDraft[]
        ) => Promise<FinderSearchStoreResult>
        ingestManualComplexPageSourceCandidates: (
          jobId: string,
          drafts: FinderCandidateResultDraft[]
        ) => Promise<FinderSearchStoreResult>
        ingestOwnerSourceToSession: (
          jobId: string,
          drafts: FinderCandidateResultDraft[]
        ) => Promise<FinderOwnerSourceSessionIngressResult>
        ingestPublicPageSourceToSession: (
          jobId: string,
          drafts: FinderCandidateResultDraft[]
        ) => Promise<FinderOwnerSourceSessionIngressResult>
        ingestManualComplexPageSourceToSession: (
          jobId: string,
          drafts: FinderCandidateResultDraft[]
        ) => Promise<FinderOwnerSourceSessionIngressResult>
        saveOutreachDraft: (
          candidateResultId: string
        ) => Promise<FinderSearchStoreResult>
        setOutreachDraftStatus: (
          draftId: string,
          status: FinderOutreachDraft['status']
        ) => Promise<FinderSearchStoreResult>
      }
      contextSources: {
        get: () => Promise<ContextSourceManifestResult>
        add: (draft: ContextSourceDraft) => Promise<ContextSourceManifestResult>
        setSelected: (
          id: string,
          selected: boolean
        ) => Promise<ContextSourceManifestResult>
        captureAndClassify: (id: string) => Promise<ContextSourceManifestResult>
        remove: (id: string) => Promise<ContextSourceManifestResult>
        pickFiles: () => Promise<string[]>
        pickFolder: () => Promise<string | null>
      }
      contextPacks: {
        get: () => Promise<ContextSourceManifestResult>
        add: (packs: CounterpartyContextPackDraft[]) => Promise<ContextSourceManifestResult>
        recordKnowledgeLifecycle: (
          draft: KnowledgePackLifecycleDraft
        ) => Promise<ContextSourceManifestResult>
        ingestFinderPayloadBatch: (
          candidatePacks: unknown[]
        ) => Promise<ContextSourceManifestResult>
        ingestFinderPayload: (payloadText: string) => Promise<ContextSourceManifestResult>
        parseFinderPayload: (payloadText: string) => Promise<CounterpartyFinderPayloadPreviewResult>
        setSelected: (id: string, selected: boolean) => Promise<ContextSourceManifestResult>
        remove: (id: string) => Promise<ContextSourceManifestResult>
      }
      secrets: {
        getOpenAIKeyStatus: () => Promise<OpenAIKeyStatus>
        saveOpenAIKey: (key: string) => Promise<SaveOpenAIKeyResult>
        deleteOpenAIKey: () => Promise<DeleteOpenAIKeyResult>
      }
      settings: {
        get: () => Promise<SettingsPayload>
        save: (settings: AppUserSettings) => Promise<SettingsPayload>
      }
      cortexBridge: {
        buildExport: () => Promise<CortexBridgeExport>
      }
      preparationContext: {
        request: (context: SessionContext) => Promise<PreparationContextResult>
      }
      assistant: {
        analyzeRecentTranscript: (
          request: AssistantAnalysisRequest
        ) => Promise<AssistantAnalysisResponse>
      }
      realtime: {
        createTranscriptionAnswer: (
          request: RealtimeTranscriptionStartRequest
        ) => Promise<RealtimeTranscriptionResponse>
      }
    }
  }
}

export {}

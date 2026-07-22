import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  AssistantAnalysisResponse,
  ContextSourceDraft,
  CounterpartyContextPackDraft,
  CounterpartyFinderPayloadPreviewResult,
  ContextSourceManifestResult,
  ConfigStatus,
  DeleteOpenAIKeyResult,
  FinderCandidateResultDraft,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSearchStoreResult,
  OpenAIKeyStatus,
  ProfileContextResult,
  RealtimeTranscriptionResponse,
  RealtimeTranscriptionStartRequest,
  SaveOpenAIKeyResult,
  SessionContext,
  SessionContextResult,
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
        ingestRunnerPayload: (
          payloadText: string
        ) => Promise<FinderSearchStoreResult>
        runJob: (jobId: string) => Promise<FinderSearchStoreResult>
        saveOutreachDraft: (
          candidateResultId: string
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

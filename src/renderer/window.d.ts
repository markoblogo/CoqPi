import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  AssistantAnalysisResponse,
  ContextSourceDraft,
  CounterpartyContextPackDraft,
  ContextSourceManifestResult,
  ConfigStatus,
  DeleteOpenAIKeyResult,
  OpenAIKeyStatus,
  ProfileContextResult,
  RealtimeTranscriptionResponse,
  RealtimeTranscriptionStartRequest,
  SaveOpenAIKeyResult,
  SessionContext,
  SessionContextResult,
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
        ingestFinderPayload: (payloadText: string) => Promise<ContextSourceManifestResult>
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

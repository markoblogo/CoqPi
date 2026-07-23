import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  ContextSourceDraft,
  CounterpartyContextPackDraft,
  KnowledgePackLifecycleDraft,
  FinderCandidateResultDraft,
  FinderSourceAdapterPreviewResult,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  RealtimeTranscriptionStartRequest,
  SessionContext,
  SmokeTestNoteDraft
} from '../shared/app-types'

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
    saveOutreachDraft: (candidateResultId: string) =>
      ipcRenderer.invoke(
        'coqpi:finder-search:save-outreach-draft',
        candidateResultId
      )
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
  assistant: {
    analyzeRecentTranscript: (request: AssistantAnalysisRequest) =>
      ipcRenderer.invoke('coqpi:assistant:analyze-recent-transcript', request)
  },
  realtime: {
    createTranscriptionAnswer: (request: RealtimeTranscriptionStartRequest) =>
      ipcRenderer.invoke('coqpi:realtime:create-transcription-answer', request)
  }
})

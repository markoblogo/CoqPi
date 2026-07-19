import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  ContextSourceDraft,
  RealtimeTranscriptionStartRequest,
  SessionContext
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

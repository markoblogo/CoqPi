import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppUserSettings,
  AssistantAnalysisRequest,
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

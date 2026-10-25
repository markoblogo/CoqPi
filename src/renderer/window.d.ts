import type {
  AppUserSettings,
  AssistantAnalysisRequest,
  AssistantProgress,
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
  MeetingTranscriptionExportRequest,
  MeetingTranscriptionExportResult,
  MeetingAudioBackupChunkRequest,
  MeetingAudioBackupStartRequest,
  MeetingAudioBackupStartResult,
  MeetingAudioBackupStopRequest,
  MeetingAudioBackupStopResult,
  MeetingTranscriptionRecoveryRequest,
  MeetingTranscriptionRecoveryResult,
  MeetingTranscriptionSaveResult,
  MonitorAccountLogin,
  MonitorAccountLoginResult,
  MonitorLiveCopilotRequest,
  MonitorLiveCopilotResponse,
  MonitorLiveCopilotSaveResult,
  MonitorTokenStatus,
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
  SettingsPayload,
  TrainingSessionEntry,
  TrainingSessionResult
} from '@shared/app-types'
import type { MeetingTranscriptionSession } from '@shared/meeting-transcription'
import type {
  BatchSendApproval,
  CalendarProposal,
  CommunicationThreadSummary,
  GoogleConnectionStatus,
  MailDraftRecord,
  OpportunityApplicationPack,
  OpportunityMetrics,
  OpportunitySearchJobV2,
  OpportunityStoreV2,
  SearchRunResult
} from '@shared/opportunity-contracts'

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
      trainingSessions: {
        get: () => Promise<TrainingSessionResult>
        save: (entry: TrainingSessionEntry) => Promise<TrainingSessionResult>
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
      opportunities: {
        get: () => Promise<OpportunityStoreV2>
        configureJob: (
          jobId: string,
          config: Partial<OpportunitySearchJobV2>
        ) => Promise<OpportunityStoreV2>
        runDiscovery: (jobId: string) => Promise<SearchRunResult>
        runDue: () => Promise<SearchRunResult[]>
        assemblePack: (input: {
          candidateId: string
          ownerFactsToUse: string[]
          ownerFactsToAvoid: string[]
          materialIds?: string[]
        }) => Promise<OpportunityApplicationPack>
        saveMailDraft: (input: {
          applicationPackId: string
          recipient: string
          subject: string
          body: string
          attachmentPaths?: string[]
        }) => Promise<MailDraftRecord>
        updateMailDraft: (
          id: string,
          patch: Pick<
            MailDraftRecord,
            'recipient' | 'subject' | 'body' | 'attachmentPaths'
          >
        ) => Promise<MailDraftRecord>
        approveMailBatch: (draftIds: string[]) => Promise<BatchSendApproval>
        getGoogleStatus: () => Promise<GoogleConnectionStatus>
        connectGoogle: (
          capability: 'mail' | 'calendar'
        ) => Promise<GoogleConnectionStatus>
        disconnectGoogle: () => Promise<GoogleConnectionStatus>
        createGmailDraft: (draftId: string) => Promise<MailDraftRecord>
        sendApprovedBatch: (
          approvalId: string
        ) => Promise<Array<{ draftId: string; ok: boolean; error?: string }>>
        syncReplies: () => Promise<CommunicationThreadSummary[]>
        createReplyDraft: (input: {
          threadSummaryId: string
          body?: string
        }) => Promise<MailDraftRecord>
        createPostCallFollowUp: (input: {
          sessionSummaryId: string
          applicationPackId: string
          recipient: string
          body?: string
        }) => Promise<MailDraftRecord>
        createCalendarProposal: (
          input: Omit<
            CalendarProposal,
            'version' | 'id' | 'status' | 'contentHash'
          >
        ) => Promise<CalendarProposal>
        createCalendarEvent: (
          proposalId: string,
          approvedContentHash: string
        ) => Promise<CalendarProposal>
        getMetrics: () => Promise<OpportunityMetrics>
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
      monitor: {
        getTokenStatus: () => Promise<MonitorTokenStatus>
        connectAccount: (login: MonitorAccountLogin) => Promise<MonitorAccountLoginResult>
        saveToken: (token: string) => Promise<{ ok: boolean }>
        deleteToken: () => Promise<{ ok: boolean }>
        livePreview: (
          request: MonitorLiveCopilotRequest
        ) => Promise<MonitorLiveCopilotResponse>
        saveLiveDraft: (
          request: MonitorLiveCopilotRequest
        ) => Promise<MonitorLiveCopilotSaveResult>
      }
      cortexBridge: {
        buildExport: () => Promise<CortexBridgeExport>
      }
      preparationContext: {
        request: (context: SessionContext) => Promise<PreparationContextResult>
      }
      assistant: {
        getPersonalReplyBank: (request: AssistantAnalysisRequest) => Promise<import('../shared/personal-reply-bank').PersonalReplyBank>
        savePersonalReply: (request: AssistantAnalysisRequest, entry: import('../shared/personal-reply-bank').PersonalReply, approve: boolean) => Promise<import('../shared/personal-reply-bank').PersonalReplyBank>
        cancel: (streamId: string) => void
        onProgress: (callback: (progress: AssistantProgress) => void) => () => void
        analyzeRecentTranscript: (
          request: AssistantAnalysisRequest
        ) => Promise<AssistantAnalysisResponse>
      }
      realtime: {
        createTranscriptionAnswer: (
          request: RealtimeTranscriptionStartRequest
        ) => Promise<RealtimeTranscriptionResponse>
      }
      rehearsal: {
        create: (draft: import('../shared/personal-rehearsal').RehearsalDraft) => Promise<import('../shared/personal-rehearsal').RehearsalSummary>
        list: () => Promise<import('../shared/personal-rehearsal').RehearsalSummary[]>
        question: (request: { snapshotId: string; sessionId: string; index: number }) => Promise<import('../shared/personal-rehearsal').RehearsalQuestion>
        review: (request: { snapshotId: string; sessionId: string }) => Promise<import('../shared/personal-rehearsal').RehearsalReport>
        readReview: (request: { snapshotId: string; sessionId: string }) => Promise<import('../shared/personal-rehearsal').RehearsalReport | null>
        publicPage: (url: string) => Promise<import('../shared/personal-rehearsal').RehearsalMaterial>
        pickMaterial: () => Promise<import('../shared/personal-rehearsal').RehearsalMaterial | null>
      }
      meetingTranscription: {
        repeatCreate: (request: import('../shared/interview-repeat').RepeatTarget) => Promise<import('../shared/interview-repeat').RepeatAttempt>
        repeatList: (request: import('../shared/interview-repeat').RepeatTarget) => Promise<import('../shared/interview-repeat').RepeatAttempt[]>
        repeatFinish: (request: { id: string; failed: boolean }) => Promise<import('../shared/interview-repeat').RepeatAttempt>
        repeatClip: (id: string) => Promise<{ base64: string; durationMs: number }>
        repeatCompare: (request: { id: string; consent: true }) => Promise<import('../shared/interview-repeat').RepeatAttempt>
        audioClip: (request: import('../shared/interview-audio-review').InterviewAudioRequest) => Promise<{ base64: string; durationMs: number }>
        audioReviewRead: (request: import('../shared/interview-audio-review').InterviewAudioRequest) => Promise<import('../shared/interview-audio-review').InterviewAudioReview | null>
        audioReview: (request: import('../shared/interview-audio-review').InterviewReviewRequest) => Promise<import('../shared/interview-audio-review').InterviewAudioReview>
        audioReviewDecide: (request: import('../shared/interview-audio-review').InterviewAudioRequest & { findingIndex: number; decision: 'confirmed' | 'dismissed' }) => Promise<import('../shared/interview-audio-review').InterviewAudioReview>
        onShutdown: (callback: () => Promise<void>) => () => void
        history: () => Promise<Array<Pick<MeetingTranscriptionSession, 'id' | 'startedAt' | 'endedAt' | 'language' | 'mode' | 'scenario'> & { segmentCount: number; practiceCompany?: string }>>
        read: (id: string) => Promise<MeetingTranscriptionSession | null>
        getCurrent: () => Promise<MeetingTranscriptionSession | null>
        saveCurrent: (
          session: MeetingTranscriptionSession
        ) => Promise<MeetingTranscriptionSaveResult>
        backupStart: (
          request: MeetingAudioBackupStartRequest
        ) => Promise<MeetingAudioBackupStartResult>
        backupChunk: (
          request: MeetingAudioBackupChunkRequest
        ) => Promise<{ ok: true }>
        backupStop: (
          request: MeetingAudioBackupStopRequest
        ) => Promise<MeetingAudioBackupStopResult>
        recoverFromBackup: (
          request: MeetingTranscriptionRecoveryRequest
        ) => Promise<MeetingTranscriptionRecoveryResult>
        clearCurrent: () => Promise<MeetingTranscriptionSaveResult>
        flush: () => Promise<void>
        exportSession: (
          request: MeetingTranscriptionExportRequest
        ) => Promise<MeetingTranscriptionExportResult>
      }
    }
  }
}

export {}

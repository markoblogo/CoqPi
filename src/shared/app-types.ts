export type ListeningStatus = 'Idle' | 'Listening' | 'Mock running' | 'Error'

export type CallLanguage = 'Auto' | 'English' | 'French'

export type AnswerLanguage = 'English' | 'French'

export const enum PatterLikeProviderKind {
  OpenAI = 'openai',
  Ollama = 'ollama'
}

export interface PatterLikeProviderProfile {
  provider: PatterLikeProviderKind
  priority: number
  model: string
  baseUrl?: string
  enabled: boolean
  isTextOnly: boolean
  failoverEnabled: boolean
}

export interface PatterLikeAssistantProfile {
  profiles: PatterLikeProviderProfile[]
  fallbackMode: 'none' | 'ordered'
}

export interface ControlState {
  listeningStatus: ListeningStatus
  callLanguage: CallLanguage
  answerLanguage: AnswerLanguage
}

export const defaultControlState: ControlState = {
  listeningStatus: 'Idle',
  callLanguage: 'Auto',
  answerLanguage: 'English'
}

export interface PanelDefinition {
  title: string
  body: string
}

export interface AppInfo {
  appName: string
  profileDirectory: string
  sessionsDirectory: string
  governanceDirectory: string
  personalKnowledgeCoreDirectory: string
}

export type GovernanceMode = 'shadow' | 'enforce'

export type GovernanceActionKind =
  | 'assistant_analysis'
  | 'realtime_transcription'
  | 'local_stt_transcription'
  | 'tool_route'

export type GovernanceDecision = 'allow' | 'deny' | 'require_approval'

export type GovernanceToolRisk =
  | 'read_only'
  | 'external_write'
  | 'system_write'

export interface GovernanceAction {
  kind: GovernanceActionKind
  provider: string
  model?: string
  external: boolean
  toolRisk?: GovernanceToolRisk
  routeIndex?: number
  routeCount?: number
  routeLabel?: string
  providerTimeoutMs?: number
  providerBudgetMs?: number
}

export interface GovernanceEvaluation {
  decision: GovernanceDecision
  shouldProceed: boolean
  shouldRecord: boolean
  reason: string
}

export interface GovernanceReceipt {
  version: 1
  timestamp: string
  stage: 'preflight' | 'completed'
  correlationId: string
  mode: GovernanceMode
  actionKind: GovernanceActionKind
  actionFingerprint: string
  decision: GovernanceDecision
  enforced: boolean
  outcome: 'pending' | 'allowed' | 'blocked' | 'failed'
  reason: string
  latencyMs?: number
  provider?: string
  model?: string
  tokenCount?: number
  costUsd?: number
  routeIndex?: number
  routeCount?: number
  routeLabel?: string
  providerTimeoutMs?: number
  providerBudgetMs?: number
}

export interface SessionContext {
  company: string
  role: string
  context: string
  goal: string
  notes: string
}

export interface SessionContextResult {
  context: SessionContext
}

export type ContextSourceKind = 'link' | 'file' | 'folder' | 'path'

export interface ContextSourceDraft {
  kind: ContextSourceKind
  location: string
  label?: string
}

export interface ContextSource {
  id: string
  kind: ContextSourceKind
  location: string
  label: string
  selected: boolean
  status: 'pending_classification' | 'hash_captured' | 'retrieval_ready'
  createdAt: string
  ownerId: 'owner'
  provenance: {
    sourceId: string
    locatorSha256: string
  }
  contentHash: string | null
  classification: 'pending' | 'private'
  retention: {
    mode: 'manual_deletion_required'
    maxAgeDays: number
    expiresAt: string
  }
  retrievalScopes: string[]
  promotion: 'explicit_audit_required'
}

export type CounterpartyContextPackKind =
  | 'job'
  | 'partner'
  | 'investor'
  | 'accelerator'
  | 'other'

export interface CounterpartyContextPackDraft {
  sourceId: string
  kind: CounterpartyContextPackKind
  partnerName: string
  title: string
  summary: string
  context?: string
  links?: string[]
  selected?: boolean
}

export interface CounterpartyContextPack {
  id: string
  sourceId: string
  kind: CounterpartyContextPackKind
  partnerName: string
  title: string
  summary: string
  context: string
  links: string[]
  selected: boolean
  status: 'pending_classification' | 'retrieval_ready'
  createdAt: string
  ownerId: 'owner'
  provenance: {
    sourceId: string
    locatorSha256: string
  }
  contentHash: string
  classification: 'private'
  retention: {
    mode: 'manual_deletion_required'
    maxAgeDays: number
    expiresAt: string
  }
  retrievalScopes: string[]
  promotion: 'explicit_audit_required'
}

export interface CounterpartyContextPackManifest {
  version: 1
  packs: CounterpartyContextPack[]
}

export interface CounterpartyContextPackManifestResult {
  manifest: {
    version: 1
    sources: ContextSource[]
    counterpartyPacks: CounterpartyContextPack[]
  }
}

export interface ContextSourceManifest {
  version: 1
  sources: ContextSource[]
  counterpartyPacks?: CounterpartyContextPack[]
}

export interface CounterpartyPayloadIngestError {
  index?: number
  reason: string
}

export interface CounterpartyPayloadIngestSummary {
  requestedCount: number
  ingestedCount: number
  skippedCount: number
  errors: CounterpartyPayloadIngestError[]
}

export interface CounterpartyFinderPayloadPreviewCandidate {
  draft: CounterpartyContextPackDraft
  index: number
  duplicate: boolean
}

export interface CounterpartyFinderPayloadPreviewResult {
  requestedCount: number
  validCount: number
  duplicateCount: number
  candidates: CounterpartyFinderPayloadPreviewCandidate[]
  errors: CounterpartyPayloadIngestError[]
}

export interface ContextSourceManifestResult {
  manifest: ContextSourceManifest
  counterpartyPayloadIngestSummary?: CounterpartyPayloadIngestSummary
}


export interface ConfigStatus {
  hasEnvFile: boolean
  hasOpenAIKey: boolean
  hasStoredKey: boolean
  effectiveKeyAvailable: boolean
}

export interface ProfileContextResult {
  content: string
}

export type AudioInputPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'error'

export interface AudioInputDevice {
  deviceId: string
  groupId: string
  label: string
  isDefault: boolean
}

export type AudioLevelStatus = 'silent' | 'low' | 'active' | 'loud'

export interface AudioLevelReading {
  ratio: number
  percentage: number
  status: AudioLevelStatus
}

export type TranscriptSpeaker = 'other' | 'me' | 'system'

export type TranscriptLanguage = 'en' | 'fr' | 'ru' | 'unknown'

export interface TranscriptUtterance {
  id: string
  speaker: TranscriptSpeaker
  text: string
  language?: TranscriptLanguage
  isFinal: boolean
  timestampStart: string
  timestampEnd?: string
  source?: 'mock' | 'realtime' | 'manual'
  sourceItemId?: string
}

export type AssistantAnswerLabel = 'short' | 'strong' | 'clarifying'

export interface SuggestedAnswer {
  label: AssistantAnswerLabel
  text: string
  answerMeaningRu: string
}

export type AssistantCallLanguage = 'auto' | 'en' | 'fr'

export type AssistantAnswerLanguage = 'en' | 'fr'

export type AssistantAnalysisMode = 'full' | 'keywords'

export type AssistantRecentWindowLabel = '30s' | '2m' | 'full'

export type AssistantCostMode = 'economy' | 'balanced' | 'quality'

export interface AssistantAnalysisRequest {
  transcriptText: string
  callLanguage: AssistantCallLanguage
  answerLanguage: AssistantAnswerLanguage
  mode: AssistantAnalysisMode
  includeProfileContext: boolean
  sessionContext?: SessionContext
  recentWindowLabel: AssistantRecentWindowLabel
  costMode: AssistantCostMode
}

export interface AssistantAnalysisResult {
  meaningRu: string
  detectedQuestion: string
  intent: string
  risk: string
  suggestedAnswers: SuggestedAnswer[]
  keywordsToRemember: string[]
  openingPhrase?: string
}

export interface AssistantAnalysisError {
  code:
    | 'assistant_error'
    | 'missing_api_key'
    | 'empty_transcript'
    | 'profile_context_error'
    | 'invalid_model_response'
    | 'provider_timeout'
    | 'analysis_budget_exhausted'
    | 'provider_error'
  message: string
}

export type AssistantAnalysisResponse =
  | {
      ok: true
      data: AssistantAnalysisResult
    }
  | {
      ok: false
      error: AssistantAnalysisError
    }

export type RealtimeConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'stopping'
  | 'stopped'
  | 'error'

export interface RealtimeTranscriptionStartRequest {
  offerSdp: string
  callLanguage: 'auto' | 'en' | 'fr'
}

export interface RealtimeTranscriptionSdpResult {
  answerSdp: string
}

export interface RealtimeTranscriptionError {
  code: string
  message: string
}

export type RealtimeTranscriptionResponse =
  | {
      ok: true
      data: RealtimeTranscriptionSdpResult
    }
  | {
      ok: false
      error: RealtimeTranscriptionError
    }

export interface OpenAIKeyStatus {
  hasStoredKey: boolean
  hasEnvKey: boolean
  effectiveKeyAvailable: boolean
}

export interface SaveOpenAIKeyResult {
  ok: boolean
}

export interface DeleteOpenAIKeyResult {
  ok: boolean
}

export interface AppUserSettings {
  costMode: AssistantCostMode
  defaultCallLanguage: CallLanguage
  defaultAnswerLanguage: AnswerLanguage
  includeProfileContextByDefault: boolean
  saveTranscriptByDefault: boolean
}

export interface SettingsMeta {
  appVersion: string
  productName: string
  safeStorageAvailable: boolean
}

export interface SettingsPayload {
  settings: AppUserSettings
  meta: SettingsMeta
}

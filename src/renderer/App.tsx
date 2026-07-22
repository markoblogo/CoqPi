import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode
} from 'react'
import {
  type AppUserSettings,
  type AssistantAnalysisRequest,
  type AssistantAnalysisResult,
  type AssistantCostMode,
  type AudioInputDevice,
  type AudioInputPermissionStatus,
  type AudioLevelReading,
  type CallLanguage,
  type ConfigStatus,
  type ContextSource,
  type CounterpartyContextPack,
  type CounterpartyContextPackDraft,
  type CounterpartyContextPackKind,
  type CounterpartyFinderPayloadPreviewResult,
  type ContextSourceKind,
  type ControlState,
  type OpenAIKeyStatus,
  type RealtimeConnectionStatus,
  type SettingsMeta,
  type SessionContext,
  type SmokeTestNote,
  type SmokeTestNoteDraft,
  type SuggestedAnswer,
  type TranscriptLanguage,
  type TranscriptUtterance,
  defaultControlState
} from '@shared/app-types'
import {
  AUTO_ANALYSIS_DEBOUNCE_MS,
  AssistantState,
  type AssistantStatusCode,
  buildLiveTestCockpitItems,
  buildAutoAnalysisSchedule,
  getAutoAnalysisTranscriptUtterances,
  getAutoAnalysisUtteranceEligibility,
  getLatestAutoAnalysisUtterance,
  isRetryButtonDisabled,
  isRetryNowButtonDisabled,
  getAssistantRunHint,
  getAssistantStatusRecoveryGuide,
  getAssistantStatusLabel
} from '@shared/live-loop'
import {
  APPROXIMATE_COST_MODEL,
  COST_GUARDRAILS,
  estimateAssistantRequestCost,
  estimateSessionCost
} from '@shared/cost-estimator'
import {
  appendUtterance,
  clearTranscript,
  getLastUtterance,
  getRecentTranscriptText
} from '@shared/transcript-state'
import {
  normalizeLinksText
} from '@shared/counterparty-pack-import'
import {
  evaluateCounterpartyPackQuality,
  formatCounterpartyPackQualityFixes
} from '@shared/context-pack-quality'
import {
  buildManualPrepPreview
} from '@shared/manual-prep-preview'
import {
  formatCounterpartyPackSessionEligibility,
  getCounterpartyPackSessionEligibility,
  getSessionContextWithCounterpartyPacks,
  getSessionSelectedCounterpartyPackIds
} from '@shared/session-pack-selection'
import {
  buildSmokeChecklistSummary,
  type SmokeChecklistMark,
  type SmokeChecklistStepId
} from '@shared/smoke-checklist'
import {
  buildSmokeReadinessPack
} from '@shared/smoke-readiness-pack'
import {
  preTestResetPlan
} from '@shared/pre-test-reset'
import {
  createFinderPreviewItems,
  getFinderPreviewSelectionStats,
  type CounterpartyFinderPreviewItem,
  toggleSelectAllFinderCandidates as toggleSelectAllFinderCandidatesModel
} from '@shared/finder-preview-state'
import {
  AudioLevelMonitor,
  defaultAudioLevelReading,
  getStoredSelectedAudioInputId,
  isAudioInputApiAvailable,
  listAudioInputDevices,
  queryAudioInputPermissionStatus,
  requestAudioInputPermission,
  storeSelectedAudioInputId
} from '@renderer/audio-device-service'
import {
  getNextMockTranscriptLine,
  mockTranscriptScenarios,
  type MockTranscriptScenarioId
} from '@renderer/mock/mock-transcript-lines'
import { RealtimeTranscriptionClient } from '@renderer/realtime/realtime-transcription-client'

const missingConfigStatus: ConfigStatus = {
  hasEnvFile: false,
  hasOpenAIKey: false,
  hasStoredKey: false,
  effectiveKeyAvailable: false
}

const emptyAnalysis: AssistantAnalysisResult = {
  meaningRu: '',
  detectedQuestion: '',
  intent: '',
  risk: '',
  suggestedAnswers: [],
  keywordsToRemember: [],
  openingPhrase: ''
}

const defaultKeyStatus: OpenAIKeyStatus = {
  hasStoredKey: false,
  hasEnvKey: false,
  effectiveKeyAvailable: false
}

const defaultSettings: AppUserSettings = {
  costMode: 'balanced',
  defaultCallLanguage: 'Auto',
  defaultAnswerLanguage: 'English',
  includeProfileContextByDefault: true,
  saveTranscriptByDefault: false
}

const emptySessionContext: SessionContext = {
  company: '',
  role: '',
  context: '',
  goal: '',
  notes: '',
  selectedCounterpartyPackIds: []
}

const emptyContextSourceDraft: {
  kind: ContextSourceKind
  location: string
  label: string
} = {
  kind: 'link',
  location: '',
  label: ''
}

type CounterpartyPackFormDraft = CounterpartyContextPackDraft & {
  linksText: string
  kind: CounterpartyContextPackKind
}

const emptyCounterpartyPackDraft: CounterpartyPackFormDraft = {
  sourceId: '',
  kind: 'job',
  partnerName: '',
  title: '',
  summary: '',
  context: '',
  linksText: '',
  selected: true
}

const emptySmokeNoteDraft: SmokeTestNoteDraft = {
  worked: '',
  broken: '',
  nextFix: ''
}

const coqPiLogoSrc = new URL(
  '../../assets/coqpi-logo-dark-bg-transparent.png',
  import.meta.url
).href

const permissionLabels: Record<AudioInputPermissionStatus, string> = {
  unknown: 'Unknown',
  granted: 'Granted',
  denied: 'Denied',
  error: 'Error'
}

const audioLevelDescriptions: Record<AudioLevelReading['status'], string> = {
  silent: 'Silent',
  low: 'Low',
  active: 'Active',
  loud: 'Loud'
}

const languageBadgeLabels: Record<TranscriptLanguage, string> = {
  en: 'EN',
  fr: 'FR',
  ru: 'RU',
  unknown: 'Unknown'
}

const speakerLabels = {
  other: 'Other',
  me: 'Me',
  system: 'System'
} as const

const suggestionLabelTitles: Record<SuggestedAnswer['label'], string> = {
  short: 'Short',
  strong: 'Strong',
  clarifying: 'Clarifying'
}

const rendererMediaApiError =
  'Browser/Electron media API is unavailable in this renderer.'

const ANALYSIS_COOLDOWN_MS = 5000

type SessionStats = {
  assistantRequests: number
  keywordsRequests: number
  transcriptCharsSent: number
  profileCharsSent: number
  sessionContextCharsSent: number
}

const emptySessionStats: SessionStats = {
  assistantRequests: 0,
  keywordsRequests: 0,
  transcriptCharsSent: 0,
  profileCharsSent: 0,
  sessionContextCharsSent: 0
}

const emptyRealtimeEventCounters = {
  total: 0,
  delta: 0,
  completed: 0,
  failed: 0,
  genericError: 0
}

type RunAssistantAnalysisOptions = {
  recentWindowLabel: '30s' | '2m'
  seconds: number
  mode: 'full' | 'keywords'
  trigger?: 'manual' | 'auto'
  targetUtteranceId?: string | null
  bypassCooldown?: boolean
}

const createTranscriptId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  return `utterance-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const formatTranscriptTime = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '--:--:--'
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const formatMinutes = (minutes: number) => `${minutes.toFixed(1)} min`

const formatEuroEstimate = (value: number) => `~€${value.toFixed(3)}`

const makeTimestampedLog = (entry: string) =>
  `${new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })} - ${entry}`

const toAssistantCallLanguage = (value: CallLanguage) => {
  if (value === 'English') {
    return 'en'
  }

  if (value === 'French') {
    return 'fr'
  }

  return 'auto'
}

const toAssistantAnswerLanguage = (value: ControlState['answerLanguage']) => {
  return value === 'French' ? 'fr' : 'en'
}

const toTranscriptLanguage = (value: CallLanguage): TranscriptLanguage => {
  if (value === 'English') {
    return 'en'
  }

  if (value === 'French') {
    return 'fr'
  }

  return 'unknown'
}

const sanitizeRealtimeErrorValue = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    const code = typeof candidate.code === 'string' ? candidate.code : undefined
    const message =
      typeof candidate.message === 'string' ? candidate.message : undefined

    if (code && message) {
      return `${code}: ${message}`
    }

    if (message) {
      return message
    }

    if (code) {
      return code
    }
  }

  return 'Unknown realtime error.'
}

const extractRealtimeErrorMessage = (payload: Record<string, unknown>) => {
  const error = payload.error

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return 'Realtime transcription error.'
}

const formatRealtimeHealthLabel = (
  status: RealtimeConnectionStatus,
  hasTranscriptActivity: boolean,
  isAnalyzing: boolean,
  isReady: boolean
) => {
  if (isAnalyzing) {
    return 'Analyzing'
  }

  if (status === 'error') {
    return 'Error'
  }

  if (status === 'connecting') {
    return 'Connecting'
  }

  if (status === 'connected' || status === 'listening') {
    return hasTranscriptActivity
      ? 'Receiving transcript'
      : 'Connected, waiting for speech'
  }

  if (status === 'stopped') {
    return 'Stopped'
  }

  if (isReady) {
    return 'Ready'
  }

  return 'Not started'
}

const getHealthTone = (label: string) => {
  if (label === 'Error') {
    return 'danger'
  }

  if (
    label === 'Connecting' ||
    label === 'Connected, waiting for speech' ||
    label === 'Receiving transcript' ||
    label === 'Analyzing'
  ) {
    return 'active'
  }

  if (label === 'Ready') {
    return 'ready'
  }

  return 'muted'
}

const getListeningStatus = (
  realtimeStatus: RealtimeConnectionStatus,
  isMockRunning: boolean,
  hasError: boolean
): ControlState['listeningStatus'] => {
  if (hasError) {
    return 'Error'
  }

  if (
    realtimeStatus === 'connecting' ||
    realtimeStatus === 'connected' ||
    realtimeStatus === 'listening'
  ) {
    return 'Listening'
  }

  if (isMockRunning) {
    return 'Mock running'
  }

  return 'Idle'
}

const clampTrailingText = (text: string, maxChars: number) => {
  const trimmed = text.trim()

  if (trimmed.length <= maxChars) {
    return trimmed
  }

  return trimmed.slice(trimmed.length - maxChars).trim()
}

const getSessionContextText = (context: SessionContext) => {
  return [
    context.company,
    context.role,
    context.context,
    context.goal,
    context.notes
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n')
}

const getSessionContextLabel = (context: SessionContext) => {
  const company = context.company.trim()
  const role = context.role.trim()

  if (company && role) {
    return `${company} · ${role}`
  }

  return company || role || 'No session'
}

const getSessionContextWithImportedCandidates = (
  context: SessionContext,
  availablePacks: CounterpartyContextPack[],
  importedCandidates: CounterpartyContextPackDraft[] = []
) =>
  getSessionContextWithCounterpartyPacks(
    context,
    availablePacks,
    importedCandidates
  )

const getSessionContextRetrievalKinds = (
  context: SessionContext
): CounterpartyContextPackKind[] | undefined => {
  const sessionText = [
    context.company,
    context.role,
    context.context,
    context.goal,
    context.notes
  ]
    .join(' ')
    .toLowerCase()

  const isJobContext = [
    'interview',
    'job',
    'vacancy',
    'hiring',
    'senior',
    'pm',
    'product manager',
    'head hunter',
    'recruit'
  ].some((token) => sessionText.includes(token))

  const isPartnerContext = [
    'partner',
    'collaboration',
    'cooperation',
    'client',
    'vendor',
    'provider',
    'supplier',
    'b2b',
    'pilot'
  ].some((token) => sessionText.includes(token))

  const isInvestorContext = [
    'investor',
    'seed',
    'angel',
    'venture',
    'capital',
    'fund',
    'accelerator',
    'grant',
    'funding'
  ].some((token) => sessionText.includes(token))

  const isAcceleratorContext = [
    'accelerator',
    'incubator',
    'venture studio',
    'incubation',
    'program'
  ].some((token) => sessionText.includes(token))

  const kinds: CounterpartyContextPackKind[] = []

  if (isPartnerContext) {
    kinds.push('partner')
  }

  if (isInvestorContext) {
    kinds.push('investor')
  }

  if (isAcceleratorContext) {
    kinds.push('accelerator')
  }

  if (isJobContext) {
    kinds.push('job')
  }

  if (kinds.length === 0) {
    return undefined
  }

  return Array.from(new Set(kinds))
}

export const App = () => {
  const realtimeClientRef = useRef<RealtimeTranscriptionClient | null>(null)
  const noEventTimeoutRef = useRef<number | null>(null)
  const autoAnalysisTimeoutRef = useRef<number | null>(null)
  const lastAutoAnalyzedFingerprintRef = useRef<string | null>(null)
  const scheduledAutoAnalysisFingerprintRef = useRef<string | null>(null)
  const runAssistantAnalysisRef = useRef<
    ((options: RunAssistantAnalysisOptions) => Promise<boolean>) | null
  >(null)
  const hasReceivedFirstRealtimeEventRef = useRef(false)
  const contextSourceMutationRef = useRef(false)

  if (!realtimeClientRef.current) {
    realtimeClientRef.current = new RealtimeTranscriptionClient()
  }

  const [activeTab, setActiveTab] = useState<
    'live' | 'prepare' | 'context' | 'settings'
  >('live')
  const [controls, setControls] = useState<ControlState>(defaultControlState)
  const [configStatus, setConfigStatus] =
    useState<ConfigStatus>(missingConfigStatus)
  const [keyStatus, setKeyStatus] = useState<OpenAIKeyStatus>(defaultKeyStatus)
  const [settingsForm, setSettingsForm] =
    useState<AppUserSettings>(defaultSettings)
  const [settingsMeta, setSettingsMeta] = useState<SettingsMeta | null>(null)
  const [profileContext, setProfileContext] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isReloadingProfile, setIsReloadingProfile] = useState(false)
  const [sessionContext, setSessionContext] =
    useState<SessionContext>(emptySessionContext)
  const [sessionContextDraft, setSessionContextDraft] =
    useState<SessionContext>(emptySessionContext)
  const [sessionContextError, setSessionContextError] = useState<string | null>(
    null
  )
  const [sessionContextNotice, setSessionContextNotice] = useState<
    string | null
  >(null)
  const [isSavingSessionContext, setIsSavingSessionContext] = useState(false)
  const [counterpartyPacks, setCounterpartyPacks] = useState<
    CounterpartyContextPack[]
  >([])
  const [counterpartyPackDraft, setCounterpartyPackDraft] = useState(
    emptyCounterpartyPackDraft
  )
  const [counterpartyPackFinderPayload, setCounterpartyPackFinderPayload] = useState(
    ''
  )
  const [counterpartyPackDraftingId, setCounterpartyPackDraftingId] = useState<
    string | null
  >(null)
  const [counterpartyPackDraftError, setCounterpartyPackDraftError] = useState<
    string | null
  >(null)
  const [counterpartyPackDraftNotice, setCounterpartyPackDraftNotice] = useState<
    string | null
  >(null)
  const [counterpartyFinderPayloadPreview, setCounterpartyFinderPayloadPreview] =
    useState<CounterpartyFinderPayloadPreviewResult | null>(null)
  const [counterpartyFinderPayloadItems, setCounterpartyFinderPayloadItems] =
    useState<CounterpartyFinderPreviewItem[]>([])
  const [counterpartyPackImportErrors, setCounterpartyPackImportErrors] = useState<
    string[]
  >([])
  const [isSavingCounterpartyPacks, setIsSavingCounterpartyPacks] = useState(false)
  const finderPayloadCandidatesCount = counterpartyFinderPayloadItems.length
  const finderPayloadSelectionStats =
    getFinderPreviewSelectionStats(counterpartyFinderPayloadItems)
  const finderPayloadCandidateCountNonDuplicate =
    finderPayloadSelectionStats.nonDuplicate
  const selectedFinderCandidatesCount = finderPayloadSelectionStats.selected
  const areAllFinderCandidatesSelected =
    finderPayloadSelectionStats.areAllSelected
  const [contextSources, setContextSources] = useState<ContextSource[]>([])
  const [contextSourceDraft, setContextSourceDraft] = useState(
    emptyContextSourceDraft
  )
  const [contextSourcesError, setContextSourcesError] = useState<string | null>(
    null
  )
  const [contextSourcesNotice, setContextSourcesNotice] = useState<string | null>(
    null
  )
  const [isSavingContextSources, setIsSavingContextSources] = useState(false)
  const [audioPermissionStatus, setAudioPermissionStatus] =
    useState<AudioInputPermissionStatus>('unknown')
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([])
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(
    () => getStoredSelectedAudioInputId() ?? ''
  )
  const [audioLevel, setAudioLevel] = useState<AudioLevelReading>(
    defaultAudioLevelReading
  )
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false)
  const [isRequestingAudioPermission, setIsRequestingAudioPermission] =
    useState(false)
  const [isMockModeEnabled, setIsMockModeEnabled] = useState(false)
  const [isMockRunning, setIsMockRunning] = useState(false)
  const [mockTranscriptScenarioId, setMockTranscriptScenarioId] =
    useState<MockTranscriptScenarioId>('default')
  const [mockError, setMockError] = useState<string | null>(null)
  const [testResetNotice, setTestResetNotice] = useState<string | null>(null)
  const [smokeNoteDraft, setSmokeNoteDraft] =
    useState<SmokeTestNoteDraft>(emptySmokeNoteDraft)
  const [smokeNotes, setSmokeNotes] = useState<SmokeTestNote[]>([])
  const [smokeNoteError, setSmokeNoteError] = useState<string | null>(null)
  const [smokeNoteNotice, setSmokeNoteNotice] = useState<string | null>(null)
  const [isSavingSmokeNote, setIsSavingSmokeNote] = useState(false)
  const [smokeChecklistMarks, setSmokeChecklistMarks] = useState<
    Partial<Record<SmokeChecklistStepId, SmokeChecklistMark>>
  >({})
  const [transcriptUtterances, setTranscriptUtterances] = useState<
    TranscriptUtterance[]
  >([])
  const [includeProfileContext, setIncludeProfileContext] = useState(
    defaultSettings.includeProfileContextByDefault
  )
  const [costMode, setCostMode] = useState<AssistantCostMode>(
    defaultSettings.costMode
  )
  const [assistantState, setAssistantState] = useState<AssistantState>('idle')
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [assistantErrorCode, setAssistantErrorCode] =
    useState<AssistantStatusCode>(null)
  const [assistantErrorSource, setAssistantErrorSource] = useState<string | null>(
    null
  )
  const [assistantResult, setAssistantResult] =
    useState<AssistantAnalysisResult>(emptyAnalysis)
  const [assistantResultUpdatedAt, setAssistantResultUpdatedAt] = useState<
    string | null
  >(null)
  const [lastAnalyzedUtteranceId, setLastAnalyzedUtteranceId] = useState<
    string | null
  >(null)
  const [copiedAnswerText, setCopiedAnswerText] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>('idle')
  const [realtimeError, setRealtimeError] = useState<string | null>(null)
  const [realtimeEventTypes, setRealtimeEventTypes] = useState<string[]>([])
  const [peerConnectionState, setPeerConnectionState] =
    useState<RTCPeerConnectionState>('new')
  const [iceConnectionState, setIceConnectionState] =
    useState<RTCIceConnectionState>('new')
  const [iceGatheringState, setIceGatheringState] =
    useState<RTCIceGatheringState>('new')
  const [dataChannelState, setDataChannelState] =
    useState<RTCDataChannelState>('closed')
  const [realtimeLifecycleLog, setRealtimeLifecycleLog] = useState<string[]>([])
  const [realtimeEventCounters, setRealtimeEventCounters] = useState({
    ...emptyRealtimeEventCounters
  })
  const [lastSanitizedRealtimeError, setLastSanitizedRealtimeError] = useState<
    string | null
  >(null)
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    ...emptySessionStats
  })
  const [realtimeStartedAt, setRealtimeStartedAt] = useState<number | null>(
    null
  )
  const [accumulatedRealtimeMs, setAccumulatedRealtimeMs] = useState(0)
  const [uiNow, setUiNow] = useState(Date.now())
  const [analysisCooldownUntil, setAnalysisCooldownUntil] = useState(0)
  const [costNotice, setCostNotice] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [isDeletingKey, setIsDeletingKey] = useState(false)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
  const [miniPane, setMiniPane] = useState<
    'transcript' | 'assist' | 'answers' | 'controls'
  >('transcript')
  const [activePopover, setActivePopover] = useState<
    'mic' | 'call' | 'answer' | null
  >(null)
  const [settingsSection, setSettingsSection] = useState<
    'key' | 'defaults' | 'test' | 'profile' | 'cost' | 'debug' | 'about'
  >('key')

  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [
          status,
          profile,
          session,
          contextSourcePayload,
          settingsPayload,
          keyState,
          smokeNotePayload
        ] =
          await Promise.all([
            window.coqpi.config.getStatus(),
            window.coqpi.profile.getContext(),
            window.coqpi.session.getContext(),
            window.coqpi.contextSources.get(),
            window.coqpi.settings.get(),
            window.coqpi.secrets.getOpenAIKeyStatus(),
            window.coqpi.smokeNotes.get()
          ])

        setConfigStatus(status)
        setProfileContext(profile.content)
        setProfileError(null)
        const packs = contextSourcePayload.manifest.counterpartyPacks ?? []
        const syncedSessionContext = {
          ...session.context,
          selectedCounterpartyPackIds:
            getSessionSelectedCounterpartyPackIds(session.context, packs)
        }

        setCounterpartyPacks(packs)
        setSessionContext(syncedSessionContext)
        setSessionContextDraft(syncedSessionContext)
        setSessionContextError(null)
        setContextSources(contextSourcePayload.manifest.sources)
        setContextSourcesError(null)
        setCounterpartyPackDraftError(null)
        setCounterpartyPackDraftNotice(null)
        setCounterpartyPackFinderPayload('')
        setKeyStatus(keyState)
        setSettingsForm(settingsPayload.settings)
        setSettingsMeta(settingsPayload.meta)
        setSmokeNotes(smokeNotePayload.notes)
        setIncludeProfileContext(
          settingsPayload.settings.includeProfileContextByDefault
        )
        setCostMode(settingsPayload.settings.costMode)
        setControls((currentControls) => ({
          ...currentControls,
          callLanguage: settingsPayload.settings.defaultCallLanguage,
          answerLanguage: settingsPayload.settings.defaultAnswerLanguage
        }))
      } catch (error) {
        setConfigStatus(missingConfigStatus)
        setProfileContext('')
        setSessionContext(emptySessionContext)
        setSessionContextDraft(emptySessionContext)
        setContextSources([])
        setCounterpartyPacks([])
        setCounterpartyPackDraft(emptyCounterpartyPackDraft)
        setCounterpartyPackDraftingId(null)
        setCounterpartyPackFinderPayload('')
        setSmokeNotes([])
        setProfileError(
          error instanceof Error
            ? error.message
            : 'Unable to load initial application state.'
        )
      }
    }

    void loadInitialState()
  }, [])

  useEffect(() => {
    const loadAudioDeviceState = async () => {
      if (!isAudioInputApiAvailable()) {
        setAudioPermissionStatus('error')
        setAudioError(rendererMediaApiError)
        return
      }

      const [permissionStatus, devices] = await Promise.all([
        queryAudioInputPermissionStatus(),
        listAudioInputDevices()
      ])

      const storedDeviceId = getStoredSelectedAudioInputId() ?? ''
      const matchedStoredDevice = devices.find(
        (device) => device.deviceId === storedDeviceId
      )
      const nextSelectedDeviceId =
        matchedStoredDevice?.deviceId ?? devices[0]?.deviceId ?? ''

      startTransition(() => {
        setAudioPermissionStatus(permissionStatus)
        setAudioDevices(devices)
        setSelectedAudioDeviceId(nextSelectedDeviceId)
      })

      storeSelectedAudioInputId(nextSelectedDeviceId)

      if (devices.length === 0) {
        setAudioError('No audio input devices found.')
        return
      }

      if (storedDeviceId && !matchedStoredDevice) {
        setAudioError(
          'Selected audio input is unavailable. Refresh the device list or choose another device.'
        )
        return
      }

      if (permissionStatus === 'denied') {
        setAudioError(
          'Microphone permission was denied. Grant access and try again.'
        )
        return
      }

      setAudioError(null)
    }

    void loadAudioDeviceState()
  }, [])

  useEffect(() => {
    if (!isAudioInputApiAvailable()) {
      setAudioLevel(defaultAudioLevelReading)
      return
    }

    if (audioPermissionStatus !== 'granted' || !selectedAudioDeviceId) {
      setAudioLevel(defaultAudioLevelReading)
      return
    }

    const selectedDeviceExists = audioDevices.some(
      (device) => device.deviceId === selectedAudioDeviceId
    )

    if (!selectedDeviceExists) {
      setAudioLevel(defaultAudioLevelReading)
      setAudioError(
        'Selected audio input is unavailable. Refresh the device list or choose another device.'
      )
      return
    }

    const monitor = new AudioLevelMonitor((nextLevel) => {
      setAudioLevel(nextLevel)
    })
    let isDisposed = false

    const startMonitor = async () => {
      try {
        await monitor.start(selectedAudioDeviceId)

        if (isDisposed) {
          monitor.stop()
          return
        }

        setAudioError(null)
      } catch (error) {
        if (isDisposed) {
          return
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Unable to start the audio level meter.'

        setAudioLevel(defaultAudioLevelReading)
        setAudioError(message)

        if (message.includes('permission')) {
          setAudioPermissionStatus('denied')
        } else if (message.includes('AudioContext')) {
          setAudioPermissionStatus('error')
        }
      }
    }

    void startMonitor()

    return () => {
      isDisposed = true
      monitor.stop()
    }
  }, [audioDevices, audioPermissionStatus, selectedAudioDeviceId])

  useEffect(() => {
    if (!isMockModeEnabled || !isMockRunning) {
      return
    }

    let timeoutId: number | null = null
    let isDisposed = false

    const pushMockLine = () => {
      if (isDisposed) {
        return
      }

      try {
        const nextLine = getNextMockTranscriptLine(
          controls.callLanguage,
          mockTranscriptScenarioId
        )
        const timestamp = new Date().toISOString()

        setTranscriptUtterances((currentUtterances) =>
          appendUtterance(currentUtterances, {
            id: createTranscriptId(),
            speaker: nextLine.speaker,
            text: nextLine.text,
            language: nextLine.language,
            isFinal: true,
            timestampStart: timestamp,
            timestampEnd: timestamp,
            source: 'mock'
          })
        )
        setMockError(null)
      } catch (error) {
        setIsMockRunning(false)
        setMockError(
          error instanceof Error
            ? error.message
            : 'Unable to generate a mock transcript line.'
        )
      }

      const nextDelay = 3000 + Math.round(Math.random() * 2000)
      timeoutId = window.setTimeout(pushMockLine, nextDelay)
    }

    const initialDelay = 3000 + Math.round(Math.random() * 2000)
    timeoutId = window.setTimeout(pushMockLine, initialDelay)

    return () => {
      isDisposed = true

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [
    controls.callLanguage,
    isMockModeEnabled,
    isMockRunning,
    mockTranscriptScenarioId
  ])

  useEffect(() => {
    const needsTick =
      realtimeStartedAt !== null || Date.now() < analysisCooldownUntil

    if (!needsTick) {
      return
    }

    const intervalId = window.setInterval(() => {
      setUiNow(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [analysisCooldownUntil, realtimeStartedAt])

  useEffect(() => {
    setControls((currentControls) => ({
      ...currentControls,
      listeningStatus: getListeningStatus(
        realtimeStatus,
        isMockRunning,
        Boolean(realtimeError || mockError)
      )
    }))
  }, [isMockRunning, mockError, realtimeError, realtimeStatus])

  useEffect(() => {
    return () => {
      if (noEventTimeoutRef.current !== null) {
        window.clearTimeout(noEventTimeoutRef.current)
      }

      if (autoAnalysisTimeoutRef.current !== null) {
        window.clearTimeout(autoAnalysisTimeoutRef.current)
      }

      void realtimeClientRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof HTMLElement)) {
        return
      }

      if (target.closest('[data-popover-root="true"]')) {
        return
      }

      setActivePopover(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePopover(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const refreshSecretAndConfigStatus = async () => {
    const [status, secretState] = await Promise.all([
      window.coqpi.config.getStatus(),
      window.coqpi.secrets.getOpenAIKeyStatus()
    ])

    setConfigStatus(status)
    setKeyStatus(secretState)
  }

  const pushRealtimeLifecycleLog = (entry: string) => {
    const timestampedEntry = makeTimestampedLog(entry)

    setRealtimeLifecycleLog((currentEntries) =>
      [timestampedEntry, ...currentEntries].slice(0, 20)
    )
  }

  const clearNoEventTimeout = () => {
    if (noEventTimeoutRef.current !== null) {
      window.clearTimeout(noEventTimeoutRef.current)
      noEventTimeoutRef.current = null
    }
  }

  const armNoEventTimeout = () => {
    clearNoEventTimeout()
    noEventTimeoutRef.current = window.setTimeout(() => {
      const message =
        'No transcription events were received after 20 seconds of listening.'
      setRealtimeStatus('error')
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
    }, 20000)
  }

  const handleRealtimeEventType = (eventType: string) => {
    setRealtimeEventTypes((currentTypes) =>
      [eventType, ...currentTypes].slice(0, 20)
    )
  }

  const currentTranscriptLanguage = toTranscriptLanguage(controls.callLanguage)

  const handleRealtimeEvent = (event: Record<string, unknown>) => {
    setRealtimeEventCounters((current) => ({
      ...current,
      total: current.total + 1
    }))

    if (!hasReceivedFirstRealtimeEventRef.current) {
      hasReceivedFirstRealtimeEventRef.current = true
      pushRealtimeLifecycleLog('first server event received')
    }

    clearNoEventTimeout()

    if (
      event.type === 'conversation.item.input_audio_transcription.delta' ||
      event.type === 'conversation.item.input_audio_transcription.completed'
    ) {
      armNoEventTimeout()
    }

    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      setRealtimeEventCounters((current) => ({
        ...current,
        delta: current.delta + 1
      }))

      const itemId =
        typeof event.item_id === 'string' ? event.item_id : undefined
      const delta = typeof event.delta === 'string' ? event.delta : ''

      if (!itemId || !delta) {
        return
      }

      setTranscriptUtterances((currentUtterances) => {
        const existingIndex = currentUtterances.findIndex(
          (utterance) => utterance.sourceItemId === itemId && !utterance.isFinal
        )

        if (existingIndex === -1) {
          return appendUtterance(currentUtterances, {
            id: createTranscriptId(),
            speaker: 'other',
            text: delta,
            language: currentTranscriptLanguage,
            isFinal: false,
            timestampStart: new Date().toISOString(),
            source: 'realtime',
            sourceItemId: itemId
          })
        }

        const nextUtterances = [...currentUtterances]
        const currentUtterance = nextUtterances[existingIndex]

        nextUtterances[existingIndex] = {
          ...currentUtterance,
          text: `${currentUtterance.text}${delta}`
        }

        return nextUtterances
      })

      return
    }

    if (
      event.type === 'conversation.item.input_audio_transcription.completed'
    ) {
      setRealtimeEventCounters((current) => ({
        ...current,
        completed: current.completed + 1
      }))

      const itemId =
        typeof event.item_id === 'string' ? event.item_id : undefined
      const transcript =
        typeof event.transcript === 'string' ? event.transcript.trim() : ''

      if (!itemId || !transcript) {
        return
      }

      setTranscriptUtterances((currentUtterances) => {
        const existingIndex = currentUtterances.findIndex(
          (utterance) => utterance.sourceItemId === itemId
        )
        const completedAt = new Date().toISOString()

        if (existingIndex === -1) {
          return appendUtterance(currentUtterances, {
            id: createTranscriptId(),
            speaker: 'other',
            text: transcript,
            language: currentTranscriptLanguage,
            isFinal: true,
            timestampStart: completedAt,
            timestampEnd: completedAt,
            source: 'realtime',
            sourceItemId: itemId
          })
        }

        const nextUtterances = [...currentUtterances]
        const existingUtterance = nextUtterances[existingIndex]

        nextUtterances[existingIndex] = {
          ...existingUtterance,
          text: transcript,
          isFinal: true,
          timestampEnd: completedAt
        }

        return nextUtterances
      })

      return
    }

    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      setRealtimeEventCounters((current) => ({
        ...current,
        failed: current.failed + 1
      }))

      const itemId =
        typeof event.item_id === 'string' ? ` item_id=${event.item_id}` : ''
      const errorMessage = sanitizeRealtimeErrorValue(
        (event as { error?: unknown }).error
      )
      const message = `Transcription failed.${itemId}${itemId ? ' ' : ''}${errorMessage}`

      setRealtimeStatus('error')
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
      return
    }

    if (event.type === 'error') {
      setRealtimeEventCounters((current) => ({
        ...current,
        genericError: current.genericError + 1
      }))

      const message = extractRealtimeErrorMessage(event)
      setRealtimeStatus('error')
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
    }
  }

  const reloadProfileContext = async () => {
    setIsReloadingProfile(true)

    try {
      const profile = await window.coqpi.profile.reloadContext()
      setProfileContext(profile.content)
      setProfileError(null)
    } catch (error) {
      setProfileContext('')
      setProfileError(
        error instanceof Error
          ? error.message
          : 'Unable to reload profile context.'
      )
    } finally {
      setIsReloadingProfile(false)
    }
  }

  const saveCurrentSessionContext = async () => {
    setIsSavingSessionContext(true)
    setSessionContextError(null)
    setSessionContextNotice(null)

    try {
      const payload = await window.coqpi.session.saveContext(
        sessionContextDraft
      )

      setSessionContext(payload.context)
      setSessionContextDraft(payload.context)
      setSessionContextNotice('Session context saved locally.')
    } catch (error) {
      setSessionContextError(
        error instanceof Error
          ? error.message
          : 'Unable to save session context.'
      )
    } finally {
      setIsSavingSessionContext(false)
    }
  }

  const clearCurrentSessionContext = async () => {
    setSessionContextDraft(emptySessionContext)
    setIsSavingSessionContext(true)
    setSessionContextError(null)
    setSessionContextNotice(null)

    try {
      const payload = await window.coqpi.session.saveContext(
        emptySessionContext
      )

      setSessionContext(payload.context)
      setSessionContextDraft(payload.context)
      setSessionContextNotice('Session context cleared.')
    } catch (error) {
      setSessionContextError(
        error instanceof Error
          ? error.message
          : 'Unable to clear session context.'
      )
    } finally {
      setIsSavingSessionContext(false)
    }
  }

  const saveSmokeNote = async () => {
    setIsSavingSmokeNote(true)
    setSmokeNoteError(null)
    setSmokeNoteNotice(null)

    try {
      const note = await window.coqpi.smokeNotes.save({
        ...smokeNoteDraft,
        sessionLabel: activeSessionPrepPreview.sessionLabel,
        selectedPackLabel: selectedCounterpartyPackNamesLabel
      })
      const payload = await window.coqpi.smokeNotes.get()

      setSmokeNotes(payload.notes.length > 0 ? payload.notes : [note])
      setSmokeNoteDraft(emptySmokeNoteDraft)
      setSmokeNoteNotice('Smoke note saved locally.')
    } catch (error) {
      setSmokeNoteError(
        error instanceof Error ? error.message : 'Unable to save smoke note.'
      )
    } finally {
      setIsSavingSmokeNote(false)
    }
  }

  const applyContextSourceManifest = (sources: ContextSource[]) => {
    setContextSources(sources)
    setContextSourcesError(null)
  }

  const applyCounterpartyPackManifest = (
    packs: CounterpartyContextPack[],
    importedCandidates: CounterpartyContextPackDraft[] = []
  ) => {
    setCounterpartyPacks(packs)
    setCounterpartyPackDraftError(null)
    setSessionContext((current) =>
      getSessionContextWithImportedCandidates(current, packs, importedCandidates)
    )
    setSessionContextDraft((current) =>
      getSessionContextWithImportedCandidates(current, packs, importedCandidates)
    )
  }

  const getContextSourceErrorMessage = (error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unable to update context sources.'

    return message.replace(
      /^Error invoking remote method '[^']+': Error: /,
      ''
    )
  }

  const getCounterpartyPackErrorMessage = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to update counterparty packs.'

    return message.replace(
      /^Error invoking remote method '[^']+': Error: /,
      ''
    )
  }

  const normalizeCounterpartyPackDraft = (
    draft: CounterpartyPackFormDraft
  ): CounterpartyContextPackDraft => {
    const next: CounterpartyContextPackDraft = {
      sourceId: draft.sourceId.trim(),
      kind: draft.kind,
      partnerName: draft.partnerName.trim(),
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      selected: draft.selected
    }

    if (draft.context?.trim()) {
      next.context = draft.context.trim()
    }

    const links = normalizeLinksText(draft.linksText)

    if (links.length > 0) {
      next.links = links
    }

    return next
  }

  const convertPackDraftForForm = (pack: CounterpartyContextPack): CounterpartyPackFormDraft => ({
    sourceId: pack.sourceId,
    kind: pack.kind,
    partnerName: pack.partnerName,
    title: pack.title,
    summary: pack.summary,
    context: pack.context,
    linksText: pack.links.join('\n'),
    selected: pack.selected
  })

  const resetCounterpartyPackDraft = () => {
    setCounterpartyPackDraft(emptyCounterpartyPackDraft)
    setCounterpartyPackDraftingId(null)
  }

  const editCounterpartyPack = (pack: CounterpartyContextPack) => {
    setCounterpartyPackDraft(convertPackDraftForForm(pack))
    setCounterpartyPackDraftingId(pack.id)
    setCounterpartyPackDraftNotice('Editing selected counterparty pack.')
  }

  const mapFinderErrorsToMessages = (errors: CounterpartyFinderPayloadPreviewResult['errors']) =>
    errors.slice(0, 5).map((failure, index) => {
      const prefix =
        failure.index === undefined
          ? `Issue #${index + 1}`
          : `Item ${failure.index + 1}`

      return `${prefix}: ${failure.reason}`
    })

  const stageCounterpartyPack = async (
    draft = counterpartyPackDraft,
    resetDraft = true
  ) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingCounterpartyPacks(true)
    setCounterpartyPackDraftError(null)
    setCounterpartyPackDraftNotice(null)
    setCounterpartyPackImportErrors([])

    try {
      const nextDraft = normalizeCounterpartyPackDraft(draft)
      const payload = await window.coqpi.contextPacks.add([nextDraft])

      if (counterpartyPackDraftingId) {
        await window.coqpi.contextPacks.remove(counterpartyPackDraftingId)
      }

      applyCounterpartyPackManifest(
        payload.manifest.counterpartyPacks ?? [],
        nextDraft.selected === false ? [] : [nextDraft]
      )

      if (resetDraft) {
        resetCounterpartyPackDraft()
      }

      setCounterpartyPackDraftNotice(
        counterpartyPackDraftingId
          ? 'Counterparty pack updated.'
          : 'Counterparty pack recorded for EN/FR interview retrieval.'
      )
    } catch (error) {
      setCounterpartyPackDraftError(getCounterpartyPackErrorMessage(error))
      setCounterpartyPackImportErrors([])
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingCounterpartyPacks(false)
    }
  }

  const previewFinderPayload = async (
    payloadText = counterpartyPackFinderPayload
  ) => {
    if (!payloadText.trim() || contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingCounterpartyPacks(true)
    setCounterpartyPackDraftError(null)
    setCounterpartyPackDraftNotice(null)
    setCounterpartyPackImportErrors([])
    try {
      const preview = await window.coqpi.contextPacks.parseFinderPayload(
        payloadText
      )

      const nextItems = createFinderPreviewItems(preview)

      setCounterpartyFinderPayloadPreview(preview)
      setCounterpartyFinderPayloadItems(nextItems)

      const notices = [] as string[]
      const nonDuplicateCount = nextItems.filter((item) => !item.duplicate).length
      const hasItems = nextItems.length > 0
      const hasValid = preview.validCount > 0
      const allDuplicate =
        hasItems &&
        preview.validCount === 0 &&
        preview.duplicateCount === preview.requestedCount
      const hasOnlyDuplicates =
        hasItems && preview.validCount > 0 && nonDuplicateCount === 0

      if (preview.requestedCount > 0) {
        notices.push(
          `${preview.requestedCount} total entries parsed. ${preview.validCount} valid.`
        )
      }

      if (!hasValid && hasItems) {
        if (allDuplicate) {
          notices.push('0 valid entries, всё дубликаты / already imported.')
        } else if (preview.errors.length > 0) {
          notices.push(
            `0 valid entries. ${preview.errors.length} invalid entries.`
          )
        }
      }

      if (preview.errors.length > 0) {
        const failures = mapFinderErrorsToMessages(preview.errors)
        setCounterpartyPackImportErrors(failures)
      } else {
        setCounterpartyPackImportErrors([])
      }

      if (preview.duplicateCount > 0) {
        notices.push(
          `${preview.duplicateCount} duplicate or already-recorded entr${
            preview.duplicateCount === 1 ? 'y' : 'ies'
          }. Skipped.`
        )
      }

      if (preview.errors.length > 0) {
        notices.push(`Invalid entries: ${preview.errors.length}`)
      }

      if (hasOnlyDuplicates) {
        notices.push(
          'No new non-duplicate candidates found; everything is already imported.'
        )
      }

      if (preview.errors.length === 0 && preview.duplicateCount === 0) {
        notices.push('No issues found in preview.')
      }

      setCounterpartyPackDraftNotice(
        notices.length > 0 ? notices.join(' ') : 'Nothing to import from this payload.'
      )
    } catch (error) {
      setCounterpartyPackDraftError(getCounterpartyPackErrorMessage(error))
      setCounterpartyFinderPayloadItems([])
      setCounterpartyFinderPayloadPreview(null)
      setCounterpartyPackImportErrors([])
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingCounterpartyPacks(false)
    }
  }

  const importFinderCandidates = async () => {
    await previewFinderPayload()
  }

  const setCounterpartyFinderCandidateSelection = (
    index: number,
    selected: boolean
  ) => {
    setCounterpartyFinderPayloadItems((current) =>
      current.map((item) =>
        item.index === index ? { ...item, selected } : item
      )
    )
  }

  const toggleSelectAllFinderCandidates = () => {
    if (isSavingCounterpartyPacks) {
      return
    }

    if (finderPayloadCandidateCountNonDuplicate === 0) {
      return
    }

    setCounterpartyFinderPayloadItems((current) =>
      toggleSelectAllFinderCandidatesModel(
        current,
        areAllFinderCandidatesSelected
      )
    )
  }

  const clearFinderPayloadInput = () => {
    setCounterpartyPackFinderPayload('')
    setCounterpartyFinderPayloadItems([])
    setCounterpartyFinderPayloadPreview(null)
    setCounterpartyPackDraftError(null)
    setCounterpartyPackDraftNotice(null)
    setCounterpartyPackImportErrors([])
  }

  const canImportFinderCandidates =
    !isSavingCounterpartyPacks && selectedFinderCandidatesCount > 0

  const importSelectedFinderCandidates = async () => {
    const selected = counterpartyFinderPayloadItems.filter(
      (candidate) => candidate.selected && !candidate.duplicate
    )

    if (selected.length === 0) {
      setCounterpartyPackDraftNotice('Select at least one non-duplicate candidate.')
      return
    }

    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingCounterpartyPacks(true)
    setCounterpartyPackDraftError(null)
    setCounterpartyPackDraftNotice(null)
    setCounterpartyPackImportErrors([])
    try {
      const payload = await window.coqpi.contextPacks.add(
        selected.map((candidate) => candidate.draft)
      )
      const importedCandidates = selected.map((candidate) => candidate.draft)
      const nextPacks = payload.manifest.counterpartyPacks ?? []
      const nextSessionContext = getSessionContextWithImportedCandidates(
        sessionContext,
        nextPacks,
        importedCandidates
      )

      applyCounterpartyPackManifest(
        nextPacks,
        importedCandidates
      )
      setSessionContext(nextSessionContext)
      setSessionContextDraft(nextSessionContext)
      try {
        const saved = await window.coqpi.session.saveContext(nextSessionContext)
        setSessionContext(saved.context)
        setSessionContextDraft(saved.context)
      } catch (error) {
        setSessionContextError(
          error instanceof Error
            ? error.message
            : 'Unable to save session selection for imported candidates.'
        )
      }

      const previewDuplicateCount = counterpartyFinderPayloadPreview?.duplicateCount ?? 0
      const previewErrorCount = counterpartyFinderPayloadPreview?.errors.length ?? 0

      const selectedCount = selected.length
      setCounterpartyPackDraftNotice(
        `Imported ${selectedCount} selected counterparty pack${
          selectedCount === 1 ? '' : 's'
        }.`
      )

      if (previewDuplicateCount > 0 || previewErrorCount > 0) {
        const duplicateSuffix =
          previewDuplicateCount > 0
            ? ` ${previewDuplicateCount} duplicate/recorded entr${
                previewDuplicateCount === 1 ? 'y' : 'ies'
              } skipped.`
            : ''
        const errorSuffix =
          previewErrorCount > 0
            ? ` ${previewErrorCount} invalid entr${
                previewErrorCount === 1 ? 'y' : 'ies'
              } skipped.`
            : ''

        setCounterpartyPackDraftNotice((current) =>
          `${current ?? ''}${duplicateSuffix}${errorSuffix}`.trim()
        )
      }

      setCounterpartyPackFinderPayload('')
      setCounterpartyFinderPayloadItems([])
      setCounterpartyFinderPayloadPreview(null)
    } catch (error) {
      setCounterpartyPackDraftError(getCounterpartyPackErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingCounterpartyPacks(false)
    }
  }

  const setCounterpartyPackSelection = async (
    id: string,
    selected: boolean
  ) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingCounterpartyPacks(true)
    setCounterpartyPackDraftError(null)

    try {
      const payload = await window.coqpi.contextPacks.setSelected(id, selected)
      applyCounterpartyPackManifest(payload.manifest.counterpartyPacks ?? [])
    } catch (error) {
      setCounterpartyPackDraftError(getCounterpartyPackErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingCounterpartyPacks(false)
    }
  }

  const setSessionCounterpartyPackSelection = (id: string, selected: boolean) => {
    setSessionContextDraft((current) => {
      const selectedSet = new Set(current.selectedCounterpartyPackIds)

      if (selected) {
        selectedSet.add(id)
      } else {
        selectedSet.delete(id)
      }

      return {
        ...current,
        selectedCounterpartyPackIds: [...selectedSet]
      }
    })
  }

  const removeCounterpartyPack = async (id: string) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingCounterpartyPacks(true)
    setCounterpartyPackDraftError(null)

    try {
      const payload = await window.coqpi.contextPacks.remove(id)
      applyCounterpartyPackManifest(payload.manifest.counterpartyPacks ?? [])
      setCounterpartyPackDraftNotice('Counterparty pack removed from manifest.')

      if (counterpartyPackDraftingId === id) {
        resetCounterpartyPackDraft()
      }
    } catch (error) {
      setCounterpartyPackDraftError(getCounterpartyPackErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingCounterpartyPacks(false)
    }
  }

  const stageContextSource = async (
    draft = contextSourceDraft,
    resetDraft = true
  ) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingContextSources(true)
    setContextSourcesError(null)
    setContextSourcesNotice(null)

    try {
      const payload = await window.coqpi.contextSources.add(draft)
      applyContextSourceManifest(payload.manifest.sources)

      if (resetDraft) {
        setContextSourceDraft(emptyContextSourceDraft)
      }

      setContextSourcesNotice(
        'Source recorded for shared RAG classification. Contents are not read or sent yet.'
      )
    } catch (error) {
      setContextSourcesError(getContextSourceErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingContextSources(false)
    }
  }

  const chooseContextFiles = async () => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingContextSources(true)
    setContextSourcesError(null)
    setContextSourcesNotice(null)

    try {
      const filePaths = await window.coqpi.contextSources.pickFiles()

      if (filePaths.length === 0) {
        return
      }

      let latestSources = contextSources
      for (const location of filePaths) {
        const payload = await window.coqpi.contextSources.add({
          kind: 'file',
          location
        })
        latestSources = payload.manifest.sources
      }

      applyContextSourceManifest(latestSources)
      setContextSourcesNotice(
        `${filePaths.length} file${filePaths.length === 1 ? '' : 's'} recorded for shared RAG classification. Contents were not read.`
      )
    } catch (error) {
      setContextSourcesError(getContextSourceErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingContextSources(false)
    }
  }

  const chooseContextFolder = async () => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingContextSources(true)
    setContextSourcesError(null)
    setContextSourcesNotice(null)

    try {
      const location = await window.coqpi.contextSources.pickFolder()

      if (!location) {
        return
      }

      const payload = await window.coqpi.contextSources.add({
        kind: 'folder',
        location
      })
      applyContextSourceManifest(payload.manifest.sources)
      setContextSourcesNotice(
        'Folder recorded for shared RAG classification. It was not scanned.'
      )
    } catch (error) {
      setContextSourcesError(getContextSourceErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingContextSources(false)
    }
  }

  const setContextSourceSelection = async (id: string, selected: boolean) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingContextSources(true)
    setContextSourcesError(null)

    try {
      const payload = await window.coqpi.contextSources.setSelected(id, selected)
      applyContextSourceManifest(payload.manifest.sources)
    } catch (error) {
      setContextSourcesError(getContextSourceErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingContextSources(false)
    }
  }

  const removeStagedContextSource = async (id: string) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingContextSources(true)
    setContextSourcesError(null)

    try {
      const payload = await window.coqpi.contextSources.remove(id)
      applyContextSourceManifest(payload.manifest.sources)
      setContextSourcesNotice('Source removed from the local manifest.')
    } catch (error) {
      setContextSourcesError(getContextSourceErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingContextSources(false)
    }
  }

  const captureAndClassifySource = async (id: string) => {
    if (contextSourceMutationRef.current) {
      return
    }

    contextSourceMutationRef.current = true
    setIsSavingContextSources(true)
    setContextSourcesError(null)
    setContextSourcesNotice(null)

    try {
      const payload = await window.coqpi.contextSources.captureAndClassify(id)
      applyContextSourceManifest(payload.manifest.sources)
      setContextSourcesNotice(
        'Local content hash captured. Retrieval is enabled only for supported text in EN/FR interview assistance.'
      )
    } catch (error) {
      setContextSourcesError(getContextSourceErrorMessage(error))
    } finally {
      contextSourceMutationRef.current = false
      setIsSavingContextSources(false)
    }
  }

  const refreshAudioDevices = async () => {
    if (!isAudioInputApiAvailable()) {
      setAudioPermissionStatus('error')
      setAudioError(rendererMediaApiError)
      return
    }

    setIsRefreshingDevices(true)

    try {
      const devices = await listAudioInputDevices()
      const matchedSelectedDevice = devices.find(
        (device) => device.deviceId === selectedAudioDeviceId
      )
      const nextSelectedDeviceId =
        matchedSelectedDevice?.deviceId ?? devices[0]?.deviceId ?? ''

      startTransition(() => {
        setAudioDevices(devices)
        setSelectedAudioDeviceId(nextSelectedDeviceId)
      })

      storeSelectedAudioInputId(nextSelectedDeviceId)

      if (devices.length === 0) {
        setAudioLevel(defaultAudioLevelReading)
        setAudioError('No audio input devices found.')
        return
      }

      if (selectedAudioDeviceId && !matchedSelectedDevice) {
        setAudioError(
          'Selected audio input is unavailable. Refresh the device list or choose another device.'
        )
        return
      }

      setAudioError(null)
    } catch (error) {
      setAudioError(
        error instanceof Error
          ? error.message
          : 'Unable to refresh audio input devices.'
      )
    } finally {
      setIsRefreshingDevices(false)
    }
  }

  const requestAudioPermission = async () => {
    if (!isAudioInputApiAvailable()) {
      setAudioPermissionStatus('error')
      setAudioError(rendererMediaApiError)
      return
    }

    setIsRequestingAudioPermission(true)

    try {
      const permissionStatus = await requestAudioInputPermission()
      setAudioPermissionStatus(permissionStatus)

      if (permissionStatus === 'granted') {
        await refreshAudioDevices()
        return
      }

      if (permissionStatus === 'denied') {
        setAudioError(
          'Microphone permission was denied. Grant access and try again.'
        )
        return
      }

      setAudioError(
        'Unable to access microphone permission. Check system settings and try again.'
      )
    } finally {
      setIsRequestingAudioPermission(false)
    }
  }

  const handleAudioDeviceChange = async (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const nextDeviceId = event.target.value

    setSelectedAudioDeviceId(nextDeviceId)
    storeSelectedAudioInputId(nextDeviceId)

    if (audioDevices.length === 0) {
      setAudioError('No audio input devices found.')
      return
    }

    if (audioPermissionStatus === 'granted') {
      setAudioError(null)
      return
    }

    await requestAudioPermission()
  }

  const addOneMockLine = () => {
    try {
      const nextLine = getNextMockTranscriptLine(
        controls.callLanguage,
        mockTranscriptScenarioId
      )
      const timestamp = new Date().toISOString()

      setTranscriptUtterances((currentUtterances) =>
        appendUtterance(currentUtterances, {
          id: createTranscriptId(),
          speaker: nextLine.speaker,
          text: nextLine.text,
          language: nextLine.language,
          isFinal: true,
          timestampStart: timestamp,
          timestampEnd: timestamp,
          source: 'mock'
        })
      )
      setMockError(null)
    } catch (error) {
      setMockError(
        error instanceof Error
          ? error.message
          : 'Unable to add a mock transcript line.'
      )
    }
  }

  const startMockTranscript = () => {
    if (!isMockModeEnabled) {
      setMockError('Enable Mock Transcript Mode before starting mock playback.')
      return
    }

    if (
      realtimeStatus === 'connecting' ||
      realtimeStatus === 'connected' ||
      realtimeStatus === 'listening'
    ) {
      setMockError(
        'Stop realtime listening before starting mock transcript mode.'
      )
      return
    }

    setMockError(null)
    setIsMockRunning(true)
  }

  const stopMockTranscript = () => {
    setIsMockRunning(false)
  }

  const handleMockModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked

    setIsMockModeEnabled(enabled)
    setMockError(null)
    setTestResetNotice(null)

    if (!enabled) {
      setIsMockRunning(false)
    }
  }

  const clearTranscriptState = () => {
    resetAssistantConversationState({
      clearTranscriptState: true
    })
  }

  const resetForTest = () => {
    setIsMockRunning(false)
    setSmokeChecklistMarks({})
    resetAssistantConversationState({
      clearTranscriptState: true,
      lastAnalyzedUtteranceId: null
    })
    setSessionStats({ ...emptySessionStats })
    setAccumulatedRealtimeMs(0)
    setRealtimeStartedAt(null)
    setTestResetNotice(
      'Test state reset. Profile, session context, selected packs, key, and audio device were preserved.'
    )
  }

  const resetAssistantConversationState = ({
    clearTranscriptState = false,
    lastAnalyzedUtteranceId
  }: {
    clearTranscriptState?: boolean
    lastAnalyzedUtteranceId?: string | null
  } = {}) => {
    if (autoAnalysisTimeoutRef.current !== null) {
      window.clearTimeout(autoAnalysisTimeoutRef.current)
      autoAnalysisTimeoutRef.current = null
    }

    const latestUtteranceId =
      lastAnalyzedUtteranceId === undefined
        ? getLastUtterance(transcriptUtterances)?.id
        : lastAnalyzedUtteranceId

    lastAutoAnalyzedFingerprintRef.current = null
    scheduledAutoAnalysisFingerprintRef.current = null
    setAssistantErrorCode(null)
    setAssistantErrorSource(null)

    if (clearTranscriptState) {
      setTranscriptUtterances(clearTranscript())
      setRealtimeEventTypes([])
      setRealtimeEventCounters({ ...emptyRealtimeEventCounters })
    }

    setMockError(null)
    setCostNotice(null)
    setAssistantState('idle')
    setAssistantError(null)
    setAssistantErrorSource(null)
    setAssistantResult(emptyAnalysis)
    setAssistantResultUpdatedAt(null)
    setLastAnalyzedUtteranceId(latestUtteranceId ?? null)
    setAnalysisCooldownUntil(0)
  }

  const startRealtimeListening = async () => {
    if (!configStatus.effectiveKeyAvailable) {
      const message =
        'Missing OpenAI API key. Save a secure local key in Settings or set OPENAI_API_KEY in .env.'
      setRealtimeStatus('error')
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
      setActiveTab('settings')
      return
    }

    if (audioPermissionStatus === 'denied') {
      const message =
        'Microphone permission was denied. Allow microphone access and try again.'
      setRealtimeStatus('error')
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
      return
    }

    if (!selectedAudioDeviceId) {
      const message =
        'No selected audio input. Choose an input device before starting listening.'
      setRealtimeStatus('error')
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
      return
    }

    if (isMockRunning) {
      setIsMockRunning(false)
      setMockError(
        'Mock transcript mode was stopped before realtime listening started.'
      )
    }

    setRealtimeError(null)
    setRealtimeEventTypes([])
    setRealtimeLifecycleLog([])
    setRealtimeEventCounters({
      total: 0,
      delta: 0,
      completed: 0,
      failed: 0,
      genericError: 0
    })
    hasReceivedFirstRealtimeEventRef.current = false
    setLastSanitizedRealtimeError(null)
    setPeerConnectionState('new')
    setIceConnectionState('new')
    setIceGatheringState('new')
    setDataChannelState('closed')
    pushRealtimeLifecycleLog('Start Listening clicked')

    try {
      setRealtimeStartedAt(Date.now())
      await realtimeClientRef.current?.start({
        selectedAudioDeviceId,
        callLanguage: toAssistantCallLanguage(controls.callLanguage),
        onStatusChange: (status) => setRealtimeStatus(status),
        onDebugEventType: handleRealtimeEventType,
        onLifecycleLog: pushRealtimeLifecycleLog,
        onPeerConnectionStateChange: setPeerConnectionState,
        onIceConnectionStateChange: setIceConnectionState,
        onIceGatheringStateChange: setIceGatheringState,
        onDataChannelStateChange: setDataChannelState,
        onEvent: handleRealtimeEvent,
        onError: (message) => {
          setRealtimeStatus('error')
          setRealtimeError(message)
          setLastSanitizedRealtimeError(message)
        }
      })
      armNoEventTimeout()
    } catch (error) {
      setRealtimeStartedAt(null)
      setRealtimeStatus('error')
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to start realtime transcription.'
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
    }
  }

  const stopRealtimeListening = async () => {
    setRealtimeStatus('stopping')
    setRealtimeError(null)
    clearNoEventTimeout()
    pushRealtimeLifecycleLog('Stop Listening clicked')

    try {
      await realtimeClientRef.current?.stop()
      if (realtimeStartedAt !== null) {
        setAccumulatedRealtimeMs(
          (currentValue) => currentValue + (Date.now() - realtimeStartedAt)
        )
      }
      setRealtimeStartedAt(null)
      setRealtimeStatus('stopped')
      setDataChannelState('closed')
      setPeerConnectionState('closed')
      pushRealtimeLifecycleLog('media tracks stopped')
      pushRealtimeLifecycleLog('peer connection closed')
    } catch (error) {
      setRealtimeStartedAt(null)
      setRealtimeStatus('error')
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to stop realtime transcription cleanly.'
      setRealtimeError(message)
      setLastSanitizedRealtimeError(message)
    }
  }

  const saveCurrentSettings = async () => {
    setIsSavingSettings(true)
    setSettingsError(null)
    setSettingsNotice(null)

    try {
      const payload = await window.coqpi.settings.save(settingsForm)

      setSettingsMeta(payload.meta)
      setSettingsForm(payload.settings)
      setCostMode(payload.settings.costMode)
      setIncludeProfileContext(payload.settings.includeProfileContextByDefault)
      setControls((currentControls) => ({
        ...currentControls,
        callLanguage: payload.settings.defaultCallLanguage,
        answerLanguage: payload.settings.defaultAnswerLanguage
      }))
      setSettingsNotice('Settings saved locally.')
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : 'Unable to save settings.'
      )
    } finally {
      setIsSavingSettings(false)
    }
  }

  const saveOpenAIKeyFromSettings = async () => {
    setIsSavingKey(true)
    setSettingsError(null)
    setSettingsNotice(null)

    try {
      await window.coqpi.secrets.saveOpenAIKey(apiKeyDraft)
      await refreshSecretAndConfigStatus()
      setApiKeyDraft('')
      setSettingsNotice('Secure OpenAI API key saved locally.')
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : 'Unable to save OpenAI API key.'
      )
    } finally {
      setIsSavingKey(false)
    }
  }

  const deleteOpenAIKeyFromSettings = async () => {
    setIsDeletingKey(true)
    setSettingsError(null)
    setSettingsNotice(null)

    try {
      await window.coqpi.secrets.deleteOpenAIKey()
      await refreshSecretAndConfigStatus()
      setSettingsNotice('Stored OpenAI API key deleted.')
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : 'Unable to delete stored OpenAI API key.'
      )
    } finally {
      setIsDeletingKey(false)
    }
  }

  const runAssistantAnalysis = async ({
    recentWindowLabel,
    seconds,
    mode,
    trigger = 'manual',
    targetUtteranceId = null,
    bypassCooldown = false
  }: RunAssistantAnalysisOptions): Promise<boolean> => {
    const setErrorState = (
      message: string,
      code: AssistantStatusCode = 'assistant_error',
      source: string | null = null
    ) => {
      setAssistantState('error')
      setAssistantError(message)
      setAssistantErrorCode(code)
      setAssistantErrorSource(source)
    }

    if (assistantState === 'analyzing') {
      return false
    }

    if (!bypassCooldown && Date.now() < analysisCooldownUntil) {
      if (trigger === 'manual') {
        setCostNotice('Assistant analysis is on cooldown for a few seconds.')
      }
      return false
    }

    const assistantCallLanguage = toAssistantCallLanguage(controls.callLanguage)
    const transcriptWindowUtterances =
      trigger === 'auto'
        ? getAutoAnalysisTranscriptUtterances(
            transcriptUtterances,
            assistantCallLanguage
          )
        : transcriptUtterances
    const recentTranscript = getRecentTranscriptText(
      transcriptWindowUtterances,
      seconds
    )

    if (!recentTranscript.trim()) {
      if (trigger === 'manual') {
        setErrorState('No transcript is available for analysis yet.', 'empty_transcript')
      }
      return false
    }

    if (!configStatus.effectiveKeyAvailable) {
      setErrorState(
        'Missing OpenAI API key. Save a secure local key in Settings or set OPENAI_API_KEY in .env.',
        'missing_api_key'
      )
      if (trigger === 'manual') {
        setActiveTab('settings')
      }
      return false
    }

    let effectiveMode = mode

    if (
      costMode === 'economy' &&
      mode === 'full' &&
      recentWindowLabel === '30s'
    ) {
      effectiveMode = 'keywords'
      setCostNotice(
        'Economy mode downgraded the quick action to keywords-only to reduce cost.'
      )
    } else {
      setCostNotice(null)
    }

    let transcriptToSend = recentTranscript
    const estimatedProfileChars = includeProfileContext
      ? profileContext.length
      : 0
    const estimatedSessionContextChars =
      getSessionContextText(sessionContext).length
    const totalChars =
      transcriptToSend.length +
      estimatedProfileChars +
      estimatedSessionContextChars

    if (totalChars > COST_GUARDRAILS.assistantWarnChars) {
      setCostNotice(
        `Large assistant request: about ${totalChars} characters before backend compaction.`
      )
    }

    if (totalChars > COST_GUARDRAILS.assistantHardCapChars) {
      const allowedTranscriptChars = Math.max(
        1200,
        COST_GUARDRAILS.assistantHardCapChars -
          estimatedProfileChars -
          estimatedSessionContextChars
      )
      const confirmed = window.confirm(
        `This request is larger than ${COST_GUARDRAILS.assistantHardCapChars} characters. Continue with an automatic cap to the most recent transcript text?`
      )

      if (!confirmed) {
        return false
      }

      transcriptToSend = clampTrailingText(
        transcriptToSend,
        allowedTranscriptChars
      )
      setCostNotice(
        `Request was capped to the most recent ${transcriptToSend.length} transcript characters.`
      )
    }

    const request: AssistantAnalysisRequest = {
      transcriptText: transcriptToSend,
      callLanguage: assistantCallLanguage,
      answerLanguage: toAssistantAnswerLanguage(controls.answerLanguage),
      mode: effectiveMode,
      includeProfileContext,
      sessionContext,
      retrievalKinds: getSessionContextRetrievalKinds(sessionContext),
      selectedCounterpartyPackIds: sessionContext.selectedCounterpartyPackIds,
      recentWindowLabel,
      costMode
    }

    setAssistantState('analyzing')
    setAssistantError(null)
    setAssistantErrorCode(null)
    setAssistantErrorSource(null)
    setAnalysisCooldownUntil(Date.now() + ANALYSIS_COOLDOWN_MS)

    try {
      const response =
        await window.coqpi.assistant.analyzeRecentTranscript(request)

      if (!response.ok) {
        setErrorState(
          response.error.message,
          response.error.code,
          response.error.source ?? null
        )
        return false
      }

      setAssistantResult(response.data)
      setAssistantResultUpdatedAt(new Date().toISOString())
      setLastAnalyzedUtteranceId(
        targetUtteranceId ?? getLastUtterance(transcriptUtterances)?.id ?? null
      )
      setAssistantState('done')
      setSessionStats((current) => ({
        assistantRequests: current.assistantRequests + 1,
        keywordsRequests:
          current.keywordsRequests + (effectiveMode === 'keywords' ? 1 : 0),
        transcriptCharsSent:
          current.transcriptCharsSent + transcriptToSend.length,
        profileCharsSent:
          current.profileCharsSent +
          (includeProfileContext ? estimatedProfileChars : 0),
        sessionContextCharsSent:
          current.sessionContextCharsSent + estimatedSessionContextChars
      }))

      return true
    } catch (error) {
      setErrorState(
        error instanceof Error
          ? error.message
          : 'Unable to analyze the transcript.',
        'assistant_error',
        'local / renderer failure'
      )
    }

    return false
  }

  const runManualAssistantRetry = () => {
    const latestUtteranceId = getLastUtterance(transcriptUtterances)?.id ?? null

    return runAssistantAnalysis({
      recentWindowLabel: '30s',
      seconds: 30,
      mode: 'full',
      trigger: 'manual',
      targetUtteranceId: latestUtteranceId
    })
  }

  const runManualAssistantRetryNow = () => {
    const latestUtteranceId = getLastUtterance(transcriptUtterances)?.id ?? null

    return runAssistantAnalysis({
      recentWindowLabel: '30s',
      seconds: 30,
      mode: 'full',
      trigger: 'manual',
      targetUtteranceId: latestUtteranceId,
      bypassCooldown: true
    })
  }

  runAssistantAnalysisRef.current = runAssistantAnalysis

  useEffect(() => {
    const assistantCallLanguage = toAssistantCallLanguage(controls.callLanguage)
    const latestFinalUtterance = getLatestAutoAnalysisUtterance(
      transcriptUtterances,
      assistantCallLanguage
    )

    if (!latestFinalUtterance) {
      return
    }

    const analysisText = getRecentTranscriptText(transcriptUtterances, 30)
    const plan = buildAutoAnalysisSchedule({
      latestFinalUtterance,
      transcriptText: analysisText,
      callLanguage: assistantCallLanguage,
      lastAutoAnalyzedFingerprint: lastAutoAnalyzedFingerprintRef.current,
      scheduledAutoAnalysisFingerprint: scheduledAutoAnalysisFingerprintRef.current,
      assistantState,
      analysisCooldownUntil,
      selectedCounterpartyPackIds: sessionContext.selectedCounterpartyPackIds
    })

    if (!plan.shouldRun || plan.fingerprint === null) {
      return
    }

    if (autoAnalysisTimeoutRef.current !== null) {
      window.clearTimeout(autoAnalysisTimeoutRef.current)
    }

    autoAnalysisTimeoutRef.current = window.setTimeout(() => {
      if (!runAssistantAnalysisRef.current) {
        return
      }

      const activeFingerprint = plan.fingerprint
      scheduledAutoAnalysisFingerprintRef.current = activeFingerprint

      void runAssistantAnalysisRef.current({
        recentWindowLabel: '30s',
        seconds: 30,
        mode: 'full',
        trigger: 'auto',
        targetUtteranceId: latestFinalUtterance.id
      }).then((didRun) => {
        if (didRun) {
          lastAutoAnalyzedFingerprintRef.current = activeFingerprint
        }

        if (
          scheduledAutoAnalysisFingerprintRef.current === activeFingerprint
        ) {
          scheduledAutoAnalysisFingerprintRef.current = null
        }
      })
    }, plan.delayMs ?? AUTO_ANALYSIS_DEBOUNCE_MS)

    return () => {
      if (autoAnalysisTimeoutRef.current !== null) {
        window.clearTimeout(autoAnalysisTimeoutRef.current)
        autoAnalysisTimeoutRef.current = null
      }
    }
  }, [
    analysisCooldownUntil,
    assistantState,
    controls.callLanguage,
    transcriptUtterances,
    sessionContext.selectedCounterpartyPackIds
  ])

  const realtimeMinutes =
    (accumulatedRealtimeMs +
      (realtimeStartedAt !== null ? uiNow - realtimeStartedAt : 0)) /
    60000
  const estimatedSessionCost = estimateSessionCost(
    realtimeMinutes,
    sessionStats.transcriptCharsSent,
    sessionStats.profileCharsSent + sessionStats.sessionContextCharsSent,
    costMode
  )
  const lastUtterance = getLastUtterance(transcriptUtterances)
  const assistantCallLanguage = toAssistantCallLanguage(controls.callLanguage)
  const assistantRelevantLastUtterance = getLatestAutoAnalysisUtterance(
    transcriptUtterances,
    assistantCallLanguage
  )
  const activeSessionLabel = getSessionContextLabel(sessionContext)
  const hasSessionContext = Boolean(getSessionContextText(sessionContext))
  const isAssistantResultStale =
    Boolean(assistantRelevantLastUtterance?.isFinal) &&
    assistantState === 'done' &&
    lastAnalyzedUtteranceId !== assistantRelevantLastUtterance?.id
  const assistantStatus = getAssistantStatusLabel(
    assistantState,
    lastAnalyzedUtteranceId,
    assistantRelevantLastUtterance?.id,
    assistantErrorCode
  )
  const assistantFreshnessLabel = assistantStatus.label
  const hasTranscript = transcriptUtterances.length > 0
  const cooldownRemainingSeconds = Math.max(
    0,
    Math.ceil((analysisCooldownUntil - uiNow) / 1000)
  )
  const retryButtonDisabled = isRetryButtonDisabled({
    assistantState,
    cooldownRemainingSeconds,
    hasTranscript
  })
  const retryNowButtonDisabled = isRetryNowButtonDisabled({
    assistantState,
    hasTranscript
  })
  const assistantRunHint = getAssistantRunHint(
    assistantState,
    assistantErrorCode,
    assistantError,
    lastAnalyzedUtteranceId,
    assistantRelevantLastUtterance?.id,
    cooldownRemainingSeconds,
    assistantErrorSource
  )
  const assistantRecoveryGuide = getAssistantStatusRecoveryGuide(
    assistantState,
    assistantErrorCode,
    assistantError,
    assistantErrorSource
  )
  const canStartListening =
    realtimeStatus !== 'connecting' &&
    realtimeStatus !== 'connected' &&
    realtimeStatus !== 'listening' &&
    realtimeStatus !== 'stopping'
  const canStopListening =
    realtimeStatus === 'connecting' ||
    realtimeStatus === 'connected' ||
    realtimeStatus === 'listening' ||
    realtimeStatus === 'error'
  const hasTranscriptActivity = transcriptUtterances.length > 0
  const isRealtimeReady =
    audioPermissionStatus === 'granted' &&
    Boolean(selectedAudioDeviceId) &&
    configStatus.effectiveKeyAvailable
  const realtimeHealthLabel = formatRealtimeHealthLabel(
    realtimeStatus,
    hasTranscriptActivity,
    assistantState === 'analyzing',
    isRealtimeReady
  )
  const selectedDeviceLabel =
    audioDevices.find((device) => device.deviceId === selectedAudioDeviceId)
      ?.label || 'No device selected'
  const selectedCounterpartyPackNames = sessionContext.selectedCounterpartyPackIds
    .map((packId) => counterpartyPacks.find((pack) => pack.id === packId)?.partnerName)
    .filter((label): label is string => Boolean(label))
    .slice(0, 3)
  const selectedCounterpartyPackNamesLabel =
    selectedCounterpartyPackNames.length > 0
      ? selectedCounterpartyPackNames.join(', ')
      : 'No pack selected'
  const selectedCounterpartyPacksLabel =
    sessionContext.selectedCounterpartyPackIds.length > 0
      ? `Packs: ${selectedCounterpartyPackNamesLabel}`
      : 'No packs selected'
  const autoAnalysisTranscriptText = getRecentTranscriptText(
    getAutoAnalysisTranscriptUtterances(
      transcriptUtterances,
      assistantCallLanguage
    ),
    30
  )
  const liveTestCockpitItems = buildLiveTestCockpitItems({
    callLanguage: assistantCallLanguage,
    realtimeLabel:
      realtimeStatus === 'idle' ? 'idle' : realtimeHealthLabel.toLowerCase(),
    assistantStatus,
    autoTranscriptText: autoAnalysisTranscriptText,
    selectedPackLabel: selectedCounterpartyPackNamesLabel,
    selectedPackCount: sessionContext.selectedCounterpartyPackIds.length,
    transcriptUtterances,
    latestRelevantUtteranceId: assistantRelevantLastUtterance?.id,
    lastAnalyzedUtteranceId,
    cooldownRemainingSeconds
  })
  const smokeChecklistSummary = buildSmokeChecklistSummary(
    {
      apiKeyAvailable: configStatus.effectiveKeyAvailable,
      mockModeEnabled: isMockModeEnabled,
      transcriptCount: transcriptUtterances.length,
      autoWindowChars: autoAnalysisTranscriptText.trim().length,
      assistantLabel: assistantStatus.label,
      assistantFreshness: assistantRelevantLastUtterance?.id
        ? lastAnalyzedUtteranceId === assistantRelevantLastUtterance.id
          ? 'fresh'
          : 'stale'
        : 'waiting',
      selectedPackCount: sessionContext.selectedCounterpartyPackIds.length,
      realtimeReady: isRealtimeReady
    },
    smokeChecklistMarks
  )
  const setSmokeChecklistMark = (
    stepId: SmokeChecklistStepId,
    mark: SmokeChecklistMark
  ) => {
    setSmokeChecklistMarks((current) => ({
      ...current,
      [stepId]: mark
    }))
  }
  const activeSessionPrepPreview = buildManualPrepPreview({
    context: sessionContext,
    availablePacks: counterpartyPacks,
    includeProfileContext,
    profileChars: profileContext.length
  })
  const manualPrepPreview = buildManualPrepPreview({
    context: sessionContextDraft,
    availablePacks: counterpartyPacks,
    includeProfileContext,
    profileChars: profileContext.length
  })
  const smokeReadinessPack = buildSmokeReadinessPack({
    apiKeyAvailable: configStatus.effectiveKeyAvailable,
    selectedPackCount: sessionContext.selectedCounterpartyPackIds.length,
    selectedPackLabel: selectedCounterpartyPackNamesLabel,
    selectedPackQualityLevel:
      activeSessionPrepPreview.selectedPackQualityLevel,
    weakFieldCount: activeSessionPrepPreview.weakFields.length,
    mockModeEnabled: isMockModeEnabled,
    transcriptCount: transcriptUtterances.length,
    autoWindowChars: autoAnalysisTranscriptText.trim().length,
    assistantFreshness: assistantRelevantLastUtterance?.id
      ? lastAnalyzedUtteranceId === assistantRelevantLastUtterance.id
        ? 'fresh'
        : 'stale'
      : 'waiting',
    realtimeReady: isRealtimeReady
  })
  const canResetForTest =
    realtimeStatus === 'idle' ||
    realtimeStatus === 'stopped' ||
    realtimeStatus === 'error'
  const requestCostPreview = estimateAssistantRequestCost(
    lastUtterance?.text.length ?? 0,
    (includeProfileContext ? profileContext.length : 0) +
      getSessionContextText(sessionContext).length,
    costMode
  )
  const isMiniLayout = viewportSize.width < 620
  const layoutLabel = `${viewportSize.width}×${viewportSize.height} · ${
    isMiniLayout ? 'Mini' : 'Sidecar'
  }`

  useEffect(() => {
    if (!isMiniLayout) {
      return
    }

    if (
      realtimeStatus === 'connecting' ||
      realtimeStatus === 'connected' ||
      realtimeStatus === 'listening'
    ) {
      setMiniPane('transcript')
      return
    }

    if (assistantState === 'done') {
      setMiniPane('answers')
      return
    }

    setMiniPane('transcript')
  }, [assistantState, isMiniLayout, realtimeStatus])

  const copyAnswerText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAnswerText(text)
      window.setTimeout(() => {
        setCopiedAnswerText((current) => (current === text ? null : current))
      }, 1400)
    } catch {
      setCopiedAnswerText(null)
    }
  }

  const topStatusItems = [
    `Key: ${configStatus.effectiveKeyAvailable ? 'ok' : 'no'}`,
    `P: ${profileError ? 'err' : profileContext ? 'ok' : 'no'}`,
    `S: ${hasSessionContext ? 'ok' : 'no'}`
  ]
  const compactCallLabel =
    controls.callLanguage === 'English'
      ? 'EN'
      : controls.callLanguage === 'French'
        ? 'FR'
        : 'Auto'
  const compactAnswerLabel = controls.answerLanguage === 'French' ? 'FR' : 'EN'
  const compactMicLabel =
    selectedDeviceLabel === 'No device selected'
      ? 'Mic'
      : selectedDeviceLabel.split(' ')[0]

  const transcriptPanel = (
    <article className="panel-card transcript-card">
      <div className="panel-header">
        <div>
          <h2>Transcript {transcriptUtterances.length}</h2>
        </div>
        <button
          className="secondary-button"
          onClick={clearTranscriptState}
          type="button"
        >
          Reset conversation
        </button>
      </div>
      {transcriptUtterances.length === 0 ? (
        <div className="empty-state">No transcript.</div>
      ) : (
        <div className="transcript-list">
          {transcriptUtterances.map((utterance) => {
            const eligibility =
              utterance.isFinal && utterance.speaker === 'other'
                ? getAutoAnalysisUtteranceEligibility(
                    utterance,
                    toAssistantCallLanguage(controls.callLanguage)
                  )
                : null

            return (
              <article
                className={`transcript-item ${
                  utterance.isFinal ? '' : 'transcript-item-partial'
                }`}
                key={utterance.id}
              >
                <div className="transcript-item-meta">
                  <span>{formatTranscriptTime(utterance.timestampStart)}</span>
                  <span>{speakerLabels[utterance.speaker]}</span>
                  {utterance.language ? (
                    <span className="language-badge">
                      {languageBadgeLabels[utterance.language]}
                    </span>
                  ) : null}
                  <span>{utterance.isFinal ? 'Final' : 'Partial'}</span>
                  {eligibility && !eligibility.eligible ? (
                    <span className="transcript-ignore-badge">
                      ignored for auto
                    </span>
                  ) : null}
                </div>
                <p className="transcript-item-text">{utterance.text}</p>
              </article>
            )
          })}
        </div>
      )}
    </article>
  )

  const assistPanel = (
    <article
      className={`panel-card compact-panel ${
        isAssistantResultStale ? 'panel-stale' : ''
      }`}
    >
      <div className="panel-header">
        <div>
          <h2>Assist</h2>
        </div>
        <button
          type="button"
          onClick={() =>
            resetAssistantConversationState({
              clearTranscriptState: false
            })
          }
          title="Reset assistant result without clearing transcript."
        >
          Reset
        </button>
        <span
          className={`assist-status assist-status-${assistantStatus.classNameSuffix}`}
        >
          {assistantFreshnessLabel}
        </span>
      </div>
      {assistantRecoveryGuide ? (
        <div className="assist-recovery">
          <strong>Recovery</strong>
          <p>{assistantRecoveryGuide.reason}</p>
          {assistantRecoveryGuide.source ? (
            <p>Источник: {assistantRecoveryGuide.source}</p>
          ) : null}
          <p>{assistantRecoveryGuide.recovery}</p>
        </div>
      ) : null}
      <div className="assist-rows">
        <div className="assist-row">
          <strong>Meaning RU</strong>
          <p>{assistantResult.meaningRu || 'Waiting.'}</p>
        </div>
        <div className="assist-row">
          <strong>Q</strong>
          <p>{assistantResult.detectedQuestion || 'Waiting.'}</p>
        </div>
        <div className="assist-row">
          <strong>Risk</strong>
          <p>
            {(assistantResult.intent || 'Waiting.') +
              (assistantResult.risk ? `\n${assistantResult.risk}` : '')}
          </p>
        </div>
      </div>
    </article>
  )

  const answersPanel = (
    <article
      className={`panel-card compact-panel answers-panel-card ${
        isAssistantResultStale ? 'panel-stale' : ''
      }`}
    >
      <div className="panel-header">
        <div>
          <h2>Answers</h2>
        </div>
        {assistantResultUpdatedAt ? (
          <span>{formatTranscriptTime(assistantResultUpdatedAt)}</span>
        ) : null}
      </div>
      <div className="answers-list">
        {assistantResult.openingPhrase ? (
          <div className="answer-card answer-card-opening">
            <div className="answer-card-header">
              <span className="answer-label">Opening</span>
              <button
                className="copy-button"
                onClick={() =>
                  void copyAnswerText(assistantResult.openingPhrase ?? '')
                }
                type="button"
              >
                {copiedAnswerText === assistantResult.openingPhrase
                  ? 'Copied'
                  : 'Copy'}
              </button>
            </div>
            <p>{assistantResult.openingPhrase}</p>
          </div>
        ) : null}
        {assistantResult.suggestedAnswers.length === 0 ? (
          <div className="empty-state">No suggestions.</div>
        ) : (
          assistantResult.suggestedAnswers.map((answer, index) => (
            <div className="answer-card" key={`${answer.label}-${index}`}>
              <div className="answer-card-header">
                <span className="answer-label">
                  {answer.label === 'clarifying'
                    ? 'Clarify'
                    : suggestionLabelTitles[answer.label]}
                </span>
                <button
                  className="copy-button"
                  onClick={() => void copyAnswerText(answer.text)}
                  type="button"
                >
                  {copiedAnswerText === answer.text ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p>{answer.text}</p>
              {answer.answerMeaningRu ? (
                <p className="answer-meaning">{answer.answerMeaningRu}</p>
              ) : null}
            </div>
          ))
        )}
        <div className="keywords-line">
          <strong>KW</strong>
          <div className="keyword-list">
            {assistantResult.keywordsToRemember.length === 0 ? (
              <span className="keywords-muted">Waiting.</span>
            ) : (
              assistantResult.keywordsToRemember.map((keyword) => (
                <span className="keyword-chip" key={keyword}>
                  {keyword}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </article>
  )

  const testCockpitPanel = (
    <section className="test-cockpit" aria-label="Live test cockpit">
      {liveTestCockpitItems.map((item) => (
        <div
          className={`test-cockpit-item test-cockpit-item-${item.tone}`}
          key={item.id}
          title={item.title}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  )

  const settingsNavItems = [
    ['key', 'Key'],
    ['defaults', 'Defaults'],
    ['test', 'Test'],
    ['profile', 'Profile'],
    ['cost', 'Cost'],
    ['debug', 'Debug'],
    ['about', 'About']
  ] as const

  const settingsSectionContent = {
    key: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>API Key</h2>
          </div>
        </div>
        <div className="stack">
          <div className="status-list">
            <div>
              Stored:{' '}
              <strong>
                {keyStatus.hasStoredKey ? 'Available' : 'Missing'}
              </strong>
            </div>
            <div>
              Env:{' '}
              <strong>{keyStatus.hasEnvKey ? 'Available' : 'Missing'}</strong>
            </div>
            <div>
              Effective:{' '}
              <strong>
                {keyStatus.effectiveKeyAvailable ? 'Available' : 'Missing'}
              </strong>
            </div>
          </div>
          <label className="settings-row settings-row-input">
            <span className="settings-row-label">Key</span>
            <input
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder="sk-..."
              type="password"
              value={apiKeyDraft}
            />
            <div className="button-row button-row-inline">
              <button
                disabled={isSavingKey || !apiKeyDraft.trim()}
                onClick={() => void saveOpenAIKeyFromSettings()}
                type="button"
              >
                Save
              </button>
              <button
                disabled={isDeletingKey || !keyStatus.hasStoredKey}
                onClick={() => void deleteOpenAIKeyFromSettings()}
                type="button"
              >
                Delete
              </button>
            </div>
          </label>
        </div>
      </article>
    ),
    defaults: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>Defaults</h2>
          </div>
        </div>
        <div className="form-grid compact-form-grid">
          <label className="settings-row">
            <span className="settings-row-label">Cost mode</span>
            <select
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  costMode: event.target.value as AssistantCostMode
                }))
              }
              value={settingsForm.costMode}
            >
              <option value="economy">economy</option>
              <option value="balanced">balanced</option>
              <option value="quality">quality</option>
            </select>
          </label>
          <label className="settings-row">
            <span className="settings-row-label">Call</span>
            <select
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  defaultCallLanguage: event.target.value as CallLanguage
                }))
              }
              value={settingsForm.defaultCallLanguage}
            >
              <option value="Auto">Auto</option>
              <option value="English">English</option>
              <option value="French">French</option>
            </select>
          </label>
          <label className="settings-row">
            <span className="settings-row-label">Answer</span>
            <select
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  defaultAnswerLanguage: event.target
                    .value as AppUserSettings['defaultAnswerLanguage']
                }))
              }
              value={settingsForm.defaultAnswerLanguage}
            >
              <option value="English">English</option>
              <option value="French">French</option>
            </select>
          </label>
          <label className="settings-row settings-row-checkbox">
            <span className="settings-row-label">Profile</span>
            <input
              checked={settingsForm.includeProfileContextByDefault}
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  includeProfileContextByDefault: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span className="checkbox-label">Include profile</span>
          </label>
          <label className="settings-row settings-row-checkbox">
            <span className="settings-row-label">Transcript</span>
            <input
              checked={settingsForm.saveTranscriptByDefault}
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  saveTranscriptByDefault: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span className="checkbox-label">Save transcript</span>
          </label>
          <div className="button-row settings-actions">
            <button
              disabled={isSavingSettings}
              onClick={() => void saveCurrentSettings()}
              type="button"
            >
              Save
            </button>
          </div>
        </div>
      </article>
    ),
    test: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>Test</h2>
          </div>
        </div>
        <div className="stack">
          <label className="inline-toggle">
            <input
              checked={isMockModeEnabled}
              onChange={handleMockModeChange}
              type="checkbox"
            />
            Mock Transcript Mode
          </label>
          <label className="settings-row">
            <span className="settings-row-label">Scenario</span>
            <select
              disabled={isMockRunning}
              onChange={(event) => {
                setMockTranscriptScenarioId(
                  event.target.value as MockTranscriptScenarioId
                )
                setMockError(null)
                setTestResetNotice(null)
              }}
              value={mockTranscriptScenarioId}
            >
              {mockTranscriptScenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>
          <p className="privacy-note">
            {
              mockTranscriptScenarios.find(
                (scenario) => scenario.id === mockTranscriptScenarioId
              )?.description
            }
          </p>
          {testResetNotice ? (
            <div className="info-box">{testResetNotice}</div>
          ) : null}
          <div className={`smoke-readiness smoke-readiness-${smokeReadinessPack.status}`}>
            <div className="smoke-readiness-header">
              <div>
                <strong>{smokeReadinessPack.headline}</strong>
                <span>{smokeReadinessPack.nextAction}</span>
              </div>
              <span>{smokeReadinessPack.status.replaceAll('_', ' ')}</span>
            </div>
            <div className="smoke-readiness-gates">
              {smokeReadinessPack.gates.map((gate) => (
                <div
                  className={`smoke-readiness-gate smoke-readiness-gate-${gate.status}`}
                  key={gate.id}
                >
                  <span>{gate.label}</span>
                  <strong>{gate.detail}</strong>
                </div>
              ))}
            </div>
            <div className="smoke-readiness-scenario">
              {smokeReadinessPack.scenario.map((step) => (
                <div
                  className={`smoke-readiness-step smoke-readiness-step-${step.status}`}
                  key={step.id}
                >
                  <span>{step.title}</span>
                  <strong>{step.action}</strong>
                </div>
              ))}
            </div>
            <div className="real-test-script">
              <div className="real-test-script-header">
                <strong>Real test minimal script</strong>
                <span>5 actions when you are ready for a live check</span>
              </div>
              <div className="real-test-script-list">
                {smokeReadinessPack.realTestScript.map((step) => (
                  <div className="real-test-script-item" key={step.id}>
                    <strong>{step.title}</strong>
                    <span>{step.action}</span>
                    <code>ok: {step.successSignal}</code>
                    <code>error: {step.errorSignal}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="smoke-checklist">
            <div className="smoke-checklist-header">
              <div>
                <strong>Live smoke checklist</strong>
                <span>
                  {smokeChecklistSummary.progressLabel} · Next:{' '}
                  {smokeChecklistSummary.activeTitle}
                </span>
              </div>
              <button
                className="secondary-button"
                onClick={() => setSmokeChecklistMarks({})}
                type="button"
              >
                Reset
              </button>
            </div>
            <div className="smoke-checklist-list">
              {smokeChecklistSummary.items.map((item) => (
                <div
                  className={`smoke-checklist-item smoke-checklist-item-${item.status}`}
                  key={item.id}
                >
                  <div className="smoke-checklist-body">
                    <strong>{item.title}</strong>
                    <span>{item.action}</span>
                    <code>{item.expected}</code>
                  </div>
                  <div className="smoke-checklist-status">
                    <span>{item.readiness}</span>
                    <div className="button-row button-row-inline">
                      <button
                        disabled={item.status === 'done'}
                        onClick={() => setSmokeChecklistMark(item.id, 'done')}
                        type="button"
                      >
                        Done
                      </button>
                      <button
                        disabled={item.status === 'blocked'}
                        onClick={() =>
                          setSmokeChecklistMark(item.id, 'blocked')
                        }
                        type="button"
                      >
                        Blocker
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="button-row">
            <button
              className="secondary-button"
              disabled={!canResetForTest}
              onClick={resetForTest}
              title={
                canResetForTest
                  ? `Clears ${preTestResetPlan.clears.join(', ')}. Preserves ${preTestResetPlan.preserves.join(', ')}.`
                  : 'Stop realtime before resetting test state.'
              }
              type="button"
            >
              {preTestResetPlan.label}
            </button>
            <button
              disabled={!isMockModeEnabled || isMockRunning}
              onClick={() => {
                setTestResetNotice(null)
                startMockTranscript()
              }}
              type="button"
            >
              Start Mock
            </button>
            <button
              disabled={!isMockRunning}
              onClick={() => {
                setTestResetNotice(null)
                stopMockTranscript()
              }}
              type="button"
            >
              Stop Mock
            </button>
            <button
              disabled={!isMockModeEnabled}
              onClick={() => {
                setTestResetNotice(null)
                addOneMockLine()
              }}
              type="button"
            >
              Add Line
            </button>
            <button
              onClick={() => {
                setTestResetNotice(null)
                clearTranscriptState()
              }}
              type="button"
            >
              Clear
            </button>
            <button
              disabled={cooldownRemainingSeconds > 0}
              onClick={() => {
                setTestResetNotice(null)
                void runAssistantAnalysis({
                  recentWindowLabel: '2m',
                  seconds: 120,
                  mode: 'full'
                })
              }}
              type="button"
            >
              Analyze 2m
            </button>
            <button
              disabled={cooldownRemainingSeconds > 0}
              onClick={() => {
                setTestResetNotice(null)
                void runAssistantAnalysis({
                  recentWindowLabel: '2m',
                  seconds: 120,
                  mode: 'keywords'
                })
              }}
              type="button"
            >
              KW
            </button>
          </div>
          <div className="smoke-note-capture">
            <div className="smoke-note-header">
              <div>
                <strong>Smoke result note</strong>
                <span>Saved locally after a mock or real mic test.</span>
              </div>
              <button
                disabled={
                  isSavingSmokeNote ||
                  !(
                    smokeNoteDraft.worked.trim() ||
                    smokeNoteDraft.broken.trim() ||
                    smokeNoteDraft.nextFix.trim()
                  )
                }
                onClick={() => void saveSmokeNote()}
                type="button"
              >
                Save smoke note
              </button>
            </div>
            <div className="smoke-note-grid">
              <label>
                <span>Worked</span>
                <textarea
                  onChange={(event) => {
                    setSmokeNoteNotice(null)
                    setSmokeNoteError(null)
                    setSmokeNoteDraft((current) => ({
                      ...current,
                      worked: event.target.value
                    }))
                  }}
                  placeholder="What worked?"
                  value={smokeNoteDraft.worked}
                />
              </label>
              <label>
                <span>Broken</span>
                <textarea
                  onChange={(event) => {
                    setSmokeNoteNotice(null)
                    setSmokeNoteError(null)
                    setSmokeNoteDraft((current) => ({
                      ...current,
                      broken: event.target.value
                    }))
                  }}
                  placeholder="What failed or felt wrong?"
                  value={smokeNoteDraft.broken}
                />
              </label>
              <label>
                <span>Next fix</span>
                <textarea
                  onChange={(event) => {
                    setSmokeNoteNotice(null)
                    setSmokeNoteError(null)
                    setSmokeNoteDraft((current) => ({
                      ...current,
                      nextFix: event.target.value
                    }))
                  }}
                  placeholder="What should be fixed next?"
                  value={smokeNoteDraft.nextFix}
                />
              </label>
            </div>
            {smokeNoteError ? (
              <div className="error-box">{smokeNoteError}</div>
            ) : null}
            {smokeNoteNotice ? (
              <div className="info-box">{smokeNoteNotice}</div>
            ) : null}
            {smokeNotes[0] ? (
              <div className="smoke-note-latest">
                <span>Latest saved</span>
                <strong>{new Date(smokeNotes[0].createdAt).toLocaleString()}</strong>
                <code>
                  {[
                    smokeNotes[0].sessionLabel,
                    smokeNotes[0].selectedPackLabel
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No session label'}
                </code>
                <p>{smokeNotes[0].nextFix || smokeNotes[0].broken || smokeNotes[0].worked}</p>
              </div>
            ) : null}
          </div>
          {mockError ? <div className="error-box">{mockError}</div> : null}
        </div>
      </article>
    ),
    profile: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>Profile</h2>
          </div>
        </div>
        <div className="button-row">
          <button
            disabled={isReloadingProfile}
            onClick={() => void reloadProfileContext()}
            type="button"
          >
            Reload
          </button>
        </div>
        {profileError ? (
          <div className="error-box">{profileError}</div>
        ) : (
          <pre className="markdown-viewer">{profileContext}</pre>
        )}
      </article>
    ),
    cost: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>Cost</h2>
          </div>
        </div>
        <div className="metric-grid">
          <div className="metric-card">
            <strong>{formatMinutes(realtimeMinutes)}</strong>
            <span>Realtime listening</span>
          </div>
          <div className="metric-card">
            <strong>{sessionStats.assistantRequests}</strong>
            <span>Assistant requests</span>
          </div>
          <div className="metric-card">
            <strong>{sessionStats.keywordsRequests}</strong>
            <span>Keywords requests</span>
          </div>
          <div className="metric-card">
            <strong>{sessionStats.transcriptCharsSent}</strong>
            <span>Transcript chars</span>
          </div>
          <div className="metric-card">
            <strong>{sessionStats.profileCharsSent}</strong>
            <span>Profile chars</span>
          </div>
          <div className="metric-card">
            <strong>{sessionStats.sessionContextCharsSent}</strong>
            <span>Session chars</span>
          </div>
          <div className="metric-card">
            <strong>{formatEuroEstimate(estimatedSessionCost)}</strong>
            <span>Approx. cost</span>
          </div>
        </div>
        <div className="info-box">
          Latest preview: {formatEuroEstimate(requestCostPreview)}
        </div>
      </article>
    ),
    debug: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>Debug</h2>
          </div>
        </div>
        <div className="stack">
          <div className="form-grid">
            <label>
              Audio permission
              <div className="status-chip">
                {permissionLabels[audioPermissionStatus]}
              </div>
            </label>
            <label>
              Input device
              <select
                onChange={handleAudioDeviceChange}
                value={selectedAudioDeviceId}
              >
                {audioDevices.length === 0 ? (
                  <option value="">No devices available</option>
                ) : (
                  audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || 'Unnamed input'}{' '}
                      {device.isDefault ? '(Default)' : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          <div className="button-row">
            <button
              disabled={isRequestingAudioPermission}
              onClick={() => void requestAudioPermission()}
              type="button"
            >
              Grant Access
            </button>
            <button
              disabled={isRefreshingDevices}
              onClick={() => void refreshAudioDevices()}
              type="button"
            >
              Refresh Devices
            </button>
          </div>
          <div className="audio-meter">
            <div className="audio-meter-header">
              <strong>Selected input</strong>
              <span>{selectedDeviceLabel}</span>
            </div>
            <div className="audio-meter-track">
              <div
                className={`audio-meter-fill audio-meter-fill-${audioLevel.status}`}
                style={{ width: `${audioLevel.percentage}%` }}
              />
            </div>
            <div className="audio-meter-meta">
              <span>{audioLevelDescriptions[audioLevel.status]}</span>
              <span>{audioLevel.percentage}%</span>
            </div>
          </div>
          {audioError ? <div className="error-box">{audioError}</div> : null}
          <div className="debug-grid">
            <div className="metric-card">
              <strong>{realtimeStatus}</strong>
              <span>Realtime status</span>
            </div>
            <div className="metric-card">
              <strong>{selectedDeviceLabel}</strong>
              <span>Selected input</span>
            </div>
            <div className="metric-card">
              <strong>{peerConnectionState}</strong>
              <span>Peer connection</span>
            </div>
            <div className="metric-card">
              <strong>{iceConnectionState}</strong>
              <span>ICE connection</span>
            </div>
            <div className="metric-card">
              <strong>{iceGatheringState}</strong>
              <span>ICE gathering</span>
            </div>
            <div className="metric-card">
              <strong>{dataChannelState}</strong>
              <span>Data channel</span>
            </div>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <strong>{realtimeEventCounters.total}</strong>
              <span>Total events</span>
            </div>
            <div className="metric-card">
              <strong>{realtimeEventCounters.delta}</strong>
              <span>Delta events</span>
            </div>
            <div className="metric-card">
              <strong>{realtimeEventCounters.completed}</strong>
              <span>Completed events</span>
            </div>
            <div className="metric-card">
              <strong>{realtimeEventCounters.failed}</strong>
              <span>Failed events</span>
            </div>
            <div className="metric-card">
              <strong>{realtimeEventCounters.genericError}</strong>
              <span>Error events</span>
            </div>
          </div>
          {lastSanitizedRealtimeError ? (
            <div className="error-box">
              Last sanitized error: {lastSanitizedRealtimeError}
            </div>
          ) : null}
          <div className="debug-columns">
            <div>
              <h3>Lifecycle log</h3>
              <ul className="debug-list">
                {realtimeLifecycleLog.length === 0 ? (
                  <li>No lifecycle entries yet.</li>
                ) : (
                  realtimeLifecycleLog.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <h3>Last 20 event types</h3>
              <ul className="debug-list">
                {realtimeEventTypes.length === 0 ? (
                  <li>No realtime events yet.</li>
                ) : (
                  realtimeEventTypes.map((type, index) => (
                    <li key={`${type}-${index}`}>{type}</li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      </article>
    ),
    about: (
      <article className="panel-card settings-card">
        <div className="panel-header">
          <div>
            <h2>About</h2>
          </div>
        </div>
        <div className="status-list">
          <div>
            Product name:{' '}
            <strong>{settingsMeta?.productName ?? 'CoqPi'}</strong>
          </div>
          <div>
            Version: <strong>{settingsMeta?.appVersion ?? '0.1.0'}</strong>
          </div>
          <div>
            safeStorage:{' '}
            <strong>
              {settingsMeta?.safeStorageAvailable ? 'Available' : 'Unavailable'}
            </strong>
          </div>
          <div>
            Layout: <strong>{layoutLabel}</strong>
          </div>
          <div>
            Cost profile:{' '}
            <strong>
              transcript {APPROXIMATE_COST_MODEL[costMode].transcriptPer1kChars}
              /1k chars
            </strong>
          </div>
        </div>
        <p className="privacy-note">
          Audio only while Start is active. Transcript analysis sends text and
          optional profile context. Audio is not saved.
        </p>
      </article>
    )
  } satisfies Record<string, ReactNode>

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-bar-left">
          <span className="app-brand">
            <img
              alt="CoqPi logo"
              className="app-logo"
              src={coqPiLogoSrc}
            />
            <strong className="app-title">CoqPi</strong>
          </span>
          <div
            className={`health-pill health-${getHealthTone(realtimeHealthLabel)}`}
          >
            <span className="health-dot" />
            {`RT: ${
              realtimeStatus === 'idle'
                ? 'idle'
                : realtimeHealthLabel.toLowerCase()
            }`}
          </div>
          {topStatusItems.map((item) => (
            <span className="status-chip" key={item}>
              {item}
            </span>
          ))}
        </div>

        <nav className="tab-bar" aria-label="Application sections">
          <button
            className={activeTab === 'live' ? 'tab-active' : ''}
            onClick={() => setActiveTab('live')}
            type="button"
          >
            Live
          </button>
          <button
            className={activeTab === 'prepare' ? 'tab-active' : ''}
            onClick={() => setActiveTab('prepare')}
            type="button"
          >
            Prep
          </button>
          <button
            className={activeTab === 'context' ? 'tab-active' : ''}
            onClick={() => setActiveTab('context')}
            type="button"
          >
            Context
          </button>
          <button
            className={activeTab === 'settings' ? 'tab-active' : ''}
            onClick={() => setActiveTab('settings')}
            type="button"
          >
            Settings
          </button>
        </nav>
      </header>

      {activeTab === 'live' ? (
        <section className="live-layout">
          <section className="control-strip">
            <div className="control-group live-primary-actions">
              <button
                className="primary-button"
                disabled={!canStartListening}
                onClick={() => void startRealtimeListening()}
                type="button"
              >
                Start
              </button>
              <button
                disabled={!canStopListening}
                onClick={() => void stopRealtimeListening()}
                type="button"
              >
                Stop
              </button>
              <button
                title="Analyze last 30 seconds"
                disabled={cooldownRemainingSeconds > 0}
                onClick={() =>
                  void runAssistantAnalysis({
                    recentWindowLabel: '30s',
                    seconds: 30,
                    mode: 'full'
                  })
                }
                type="button"
              >
                A30
              </button>
              <button
                title="Generate keywords only"
                disabled={cooldownRemainingSeconds > 0}
                onClick={() =>
                  void runAssistantAnalysis({
                    recentWindowLabel: '30s',
                    seconds: 30,
                    mode: 'keywords'
                  })
                }
                type="button"
              >
                KW
              </button>
              <button
                title="Retry last analysis with current context"
                disabled={retryButtonDisabled}
                onClick={() => {
                  void runManualAssistantRetry()
                }}
                type="button"
              >
                Retry
              </button>
              <button
                title="Run retry now"
                disabled={retryNowButtonDisabled}
                onClick={() => {
                  void runManualAssistantRetryNow()
                }}
                type="button"
              >
                Retry now
              </button>
            </div>

            <div className="control-group live-selectors">
              <span
                className={`session-chip ${
                  hasSessionContext ? 'session-chip-active' : ''
                }`}
                title={activeSessionLabel}
              >
                {activeSessionLabel}
              </span>
              <span
                className="session-chip"
                title={selectedCounterpartyPacksLabel}
              >
                {selectedCounterpartyPacksLabel}
              </span>

              <div className="popover-anchor" data-popover-root="true">
                <button
                  className="compact-toggle-button"
                  onClick={() =>
                    setActivePopover((current) =>
                      current === 'mic' ? null : 'mic'
                    )
                  }
                  type="button"
                >
                  Mic: {compactMicLabel}
                </button>
                {activePopover === 'mic' ? (
                  <div className="popover-menu">
                    <div className="popover-title">Audio input</div>
                    <select
                      onChange={async (event) => {
                        await handleAudioDeviceChange(event)
                        setActivePopover(null)
                      }}
                      value={selectedAudioDeviceId}
                    >
                      {audioDevices.length === 0 ? (
                        <option value="">No devices available</option>
                      ) : (
                        audioDevices.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || 'Unnamed input'}{' '}
                            {device.isDefault ? '(Default)' : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="button-row">
                      <button
                        disabled={isRefreshingDevices}
                        onClick={() => void refreshAudioDevices()}
                        type="button"
                      >
                        Refresh
                      </button>
                      <button
                        disabled={isRequestingAudioPermission}
                        onClick={() => void requestAudioPermission()}
                        type="button"
                      >
                        Access
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="popover-anchor" data-popover-root="true">
                <button
                  className="compact-toggle-button"
                  onClick={() =>
                    setActivePopover((current) =>
                      current === 'call' ? null : 'call'
                    )
                  }
                  type="button"
                >
                  Call: {compactCallLabel}
                </button>
                {activePopover === 'call' ? (
                  <div className="popover-menu popover-menu-small">
                    <div className="popover-title">Call language</div>
                    <button
                      onClick={() => {
                        setControls((current) => ({
                          ...current,
                          callLanguage: 'Auto'
                        }))
                        setActivePopover(null)
                      }}
                      type="button"
                    >
                      Auto
                    </button>
                    <button
                      onClick={() => {
                        setControls((current) => ({
                          ...current,
                          callLanguage: 'English'
                        }))
                        setActivePopover(null)
                      }}
                      type="button"
                    >
                      English
                    </button>
                    <button
                      onClick={() => {
                        setControls((current) => ({
                          ...current,
                          callLanguage: 'French'
                        }))
                        setActivePopover(null)
                      }}
                      type="button"
                    >
                      French
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="popover-anchor" data-popover-root="true">
                <button
                  className="compact-toggle-button"
                  onClick={() =>
                    setActivePopover((current) =>
                      current === 'answer' ? null : 'answer'
                    )
                  }
                  type="button"
                >
                  Ans: {compactAnswerLabel}
                </button>
                {activePopover === 'answer' ? (
                  <div className="popover-menu popover-menu-small">
                    <div className="popover-title">Answer language</div>
                    <button
                      onClick={() => {
                        setControls((current) => ({
                          ...current,
                          answerLanguage: 'English'
                        }))
                        setActivePopover(null)
                      }}
                      type="button"
                    >
                      English
                    </button>
                    <button
                      onClick={() => {
                        setControls((current) => ({
                          ...current,
                          answerLanguage: 'French'
                        }))
                        setActivePopover(null)
                      }}
                      type="button"
                    >
                      French
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mini-meter" aria-label="Audio level meter">
                <span className="mini-meter-label">
                  {audioLevelDescriptions[audioLevel.status]}
                </span>
                <div className="mini-meter-track">
                  <div
                    className={`mini-meter-fill mini-meter-fill-${audioLevel.status}`}
                    style={{ width: `${audioLevel.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          </section>

          {(assistantRunHint || realtimeError || assistantError || costNotice) && (
            <div className="stack live-alerts">
              {assistantRunHint ? (
                <div
                  className={`assistant-diagnostic assistant-diagnostic-${assistantRunHint.tone}`}
                >
                  <strong>{assistantRunHint.title}</strong>
                  <p>{assistantRunHint.message}</p>
                  {assistantRunHint.actionHint ? (
                    <p>{assistantRunHint.actionHint}</p>
                  ) : null}
                </div>
              ) : null}
              {realtimeError ? (
                <div className="error-box">{realtimeError}</div>
              ) : null}
              {costNotice ? <div className="info-box">{costNotice}</div> : null}
            </div>
          )}

          {testCockpitPanel}

          {!isMiniLayout ? (
            <section className="live-main">
              {transcriptPanel}
              <div className="live-side">
                {assistPanel}
                {answersPanel}
              </div>
            </section>
          ) : (
            <section className="mini-main">
              <nav className="mini-pane-tabs" aria-label="Mini panes">
                <button
                  className={miniPane === 'transcript' ? 'tab-active' : ''}
                  onClick={() => setMiniPane('transcript')}
                  type="button"
                >
                  T
                </button>
                <button
                  className={miniPane === 'assist' ? 'tab-active' : ''}
                  onClick={() => setMiniPane('assist')}
                  type="button"
                >
                  A
                </button>
                <button
                  className={miniPane === 'answers' ? 'tab-active' : ''}
                  onClick={() => setMiniPane('answers')}
                  type="button"
                >
                  Ans
                </button>
                <button
                  className={miniPane === 'controls' ? 'tab-active' : ''}
                  onClick={() => setMiniPane('controls')}
                  type="button"
                >
                  Ctrl
                </button>
              </nav>
              <div className="mini-pane-body">
                {miniPane === 'transcript' ? transcriptPanel : null}
                {miniPane === 'assist' ? assistPanel : null}
                {miniPane === 'answers' ? answersPanel : null}
                {miniPane === 'controls' ? (
                  <article className="panel-card compact-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Ctrl</h2>
                      </div>
                    </div>
                    <div className="mini-controls-panel">
                      <div className="status-list">
                        <div>Mic: {selectedDeviceLabel}</div>
                        <div>Call: {compactCallLabel}</div>
                        <div>Ans: {compactAnswerLabel}</div>
                      </div>
                      <div className="button-row">
                        <button
                          onClick={() => {
                            setSettingsSection('debug')
                            setActiveTab('settings')
                          }}
                          type="button"
                        >
                          Debug
                        </button>
                        <button
                          onClick={() => {
                            setSettingsSection('key')
                            setActiveTab('settings')
                          }}
                          type="button"
                        >
                          Settings
                        </button>
                      </div>
                      <div className="audio-meter audio-meter-mini">
                        <div className="audio-meter-track">
                          <div
                            className={`audio-meter-fill audio-meter-fill-${audioLevel.status}`}
                            style={{ width: `${audioLevel.percentage}%` }}
                          />
                        </div>
                        <div className="audio-meter-meta">
                          <span>
                            {audioLevelDescriptions[audioLevel.status]}
                          </span>
                          <span>{audioLevel.percentage}%</span>
                        </div>
                      </div>
                    </div>
                  </article>
                ) : null}
              </div>
            </section>
          )}

          <div className="live-footnote">Audio only while Start is active.</div>
        </section>
      ) : null}

      {activeTab === 'prepare' ? (
        <section className="prepare-layout scroll-section">
          <section className="prepare-grid prepare-grid-single">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <h2>Prep</h2>
                </div>
                <span>{hasSessionContext ? 'Active' : 'Empty'}</span>
              </div>
              {(sessionContextError || sessionContextNotice) && (
                <div className="stack">
                  {sessionContextError ? (
                    <div className="error-box">{sessionContextError}</div>
                  ) : null}
                  {sessionContextNotice ? (
                    <div className="info-box">{sessionContextNotice}</div>
                  ) : null}
                </div>
              )}
              <div className="prepare-placeholder compact-form-grid">
                <div className="manual-prep-preview">
                  <div className="manual-prep-preview-header">
                    <div>
                      <strong>{manualPrepPreview.sessionLabel}</strong>
                      <span>{manualPrepPreview.goalLabel}</span>
                    </div>
                    <span
                      className={`context-pack-quality context-pack-quality-${manualPrepPreview.selectedPackQualityLevel}`}
                    >
                      {manualPrepPreview.selectedPackQualityLabel}
                    </span>
                  </div>
                  <div className="manual-prep-preview-grid">
                    <div>
                      <span>Context</span>
                      <strong>{manualPrepPreview.contextLabel}</strong>
                    </div>
                    <div>
                      <span>Selected pack</span>
                      <strong>{manualPrepPreview.selectedPackLabel}</strong>
                    </div>
                    <div>
                      <span>Assistant payload</span>
                      <strong>{manualPrepPreview.assistantPayloadLabel}</strong>
                    </div>
                  </div>
                  {manualPrepPreview.weakFields.length > 0 ? (
                    <div className="manual-prep-fixes">
                      {manualPrepPreview.weakFields.slice(0, 4).map((field) => (
                        <span key={field.id} title={field.fix}>
                          {field.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="manual-prep-fixes manual-prep-fixes-ready">
                      Ready for a focused call.
                    </div>
                  )}
                </div>
                <label className="settings-row">
                  <span className="settings-row-label">Company</span>
                  <input
                    onChange={(event) =>
                      setSessionContextDraft((current) => ({
                        ...current,
                        company: event.target.value
                      }))
                    }
                    placeholder="Company or partner"
                    value={sessionContextDraft.company}
                  />
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Role</span>
                  <input
                    onChange={(event) =>
                      setSessionContextDraft((current) => ({
                        ...current,
                        role: event.target.value
                      }))
                    }
                    placeholder="Role, meeting type, or counterpart"
                    value={sessionContextDraft.role}
                  />
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Context</span>
                  <input
                    onChange={(event) =>
                      setSessionContextDraft((current) => ({
                        ...current,
                        context: event.target.value
                      }))
                    }
                    placeholder="Vacancy, project, investor, partner"
                    value={sessionContextDraft.context}
                  />
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Goal</span>
                  <input
                    onChange={(event) =>
                      setSessionContextDraft((current) => ({
                        ...current,
                        goal: event.target.value
                      }))
                    }
                    placeholder="What you want from this call"
                    value={sessionContextDraft.goal}
                  />
                </label>
                <label className="settings-row settings-row-textarea">
                  <span className="settings-row-label">Notes</span>
                  <textarea
                    className="prepare-textarea"
                    onChange={(event) =>
                      setSessionContextDraft((current) => ({
                        ...current,
                        notes: event.target.value
                      }))
                    }
                    placeholder="Key facts, constraints, strong points, questions to ask"
                    value={sessionContextDraft.notes}
                  />
                </label>
                <div className="context-source-list">
                  <div className="settings-row-label">Counterparty packs for this call</div>
                  {counterpartyPacks.length === 0 ? (
                    <div className="context-source-empty">
                      Add counterparty packs in Context tab first.
                    </div>
                  ) : (
                    counterpartyPacks.map((pack) => {
                      const eligibility = getCounterpartyPackSessionEligibility(pack)
                      const quality = evaluateCounterpartyPackQuality(pack)
                      const isChecked = sessionContextDraft.selectedCounterpartyPackIds.includes(
                        pack.id
                      )

                      return (
                        <div className="context-source-item" key={`session-${pack.id}`}>
                          <label className="context-source-select">
                            <input
                              checked={isChecked}
                              disabled={isSavingSessionContext}
                              onChange={(event) => {
                                setSessionCounterpartyPackSelection(
                                  pack.id,
                                  event.target.checked
                                )
                              }}
                              type="checkbox"
                            />
                            <span>{isChecked ? 'In session' : 'Not in session'}</span>
                          </label>
                          <div className="context-source-details">
                            <strong>{pack.partnerName}</strong>
                            <span>
                              {pack.kind} · {pack.title}
                            </span>
                            <span
                              className={
                                eligibility.eligible
                                  ? 'context-source-status-ready'
                                  : 'context-source-status-blocked'
                              }
                            >
                              session: {formatCounterpartyPackSessionEligibility(eligibility)}
                            </span>
                            <span
                              className={`context-pack-quality context-pack-quality-${quality.level}`}
                              title={formatCounterpartyPackQualityFixes(quality)}
                            >
                              quality: {quality.label}
                            </span>
                            {quality.issues.length > 0 ? (
                              <code>
                                fix: {formatCounterpartyPackQualityFixes(quality)}
                              </code>
                            ) : null}
                            <code>{pack.sourceId}</code>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="button-row settings-actions">
                  <button
                    disabled={isSavingSessionContext}
                    onClick={() => void saveCurrentSessionContext()}
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    disabled={isSavingSessionContext}
                    onClick={() => void clearCurrentSessionContext()}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </article>
          </section>
        </section>
      ) : null}

      {activeTab === 'context' ? (
        <section className="prepare-layout scroll-section">
          <section className="prepare-grid prepare-grid-single">
            <article className="panel-card context-sources-card">
              <div className="panel-header">
                <div>
                  <h2>Context Sources</h2>
                </div>
                <span>{contextSources.length} pending</span>
              </div>
              <p className="context-sources-description">
                Shared RAG ingress. Every record stays CoqPi-only and pending classification until an explicit audited promotion.
              </p>
              {(contextSourcesError || contextSourcesNotice) && (
                <div className="stack">
                  {contextSourcesError ? (
                    <div className="error-box">{contextSourcesError}</div>
                  ) : null}
                  {contextSourcesNotice ? (
                    <div className="info-box">{contextSourcesNotice}</div>
                  ) : null}
                </div>
              )}
              <div className="compact-form-grid context-source-form">
                <label className="settings-row">
                  <span className="settings-row-label">Type</span>
                  <select
                    onChange={(event) =>
                      setContextSourceDraft((current) => ({
                        ...current,
                        kind: event.target.value as ContextSourceKind
                      }))
                    }
                    value={contextSourceDraft.kind}
                  >
                    <option value="link">Public link</option>
                    <option value="path">Local path</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Location</span>
                  <input
                    onChange={(event) =>
                      setContextSourceDraft((current) => ({
                        ...current,
                        location: event.target.value
                      }))
                    }
                    placeholder={
                      contextSourceDraft.kind === 'link'
                        ? 'https://linkedin.com/in/...'
                        : '/Users/.../materials'
                    }
                    value={contextSourceDraft.location}
                  />
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Label</span>
                  <input
                    onChange={(event) =>
                      setContextSourceDraft((current) => ({
                        ...current,
                        label: event.target.value
                      }))
                    }
                    placeholder="Optional local label"
                    value={contextSourceDraft.label}
                  />
                </label>
                <div className="button-row settings-actions">
                  <button
                    disabled={
                      isSavingContextSources ||
                      !contextSourceDraft.location.trim()
                    }
                    onClick={() => void stageContextSource()}
                    type="button"
                  >
                    Stage source
                  </button>
                  <button
                    disabled={isSavingContextSources}
                    onClick={() => void chooseContextFiles()}
                    type="button"
                  >
                    Choose files
                  </button>
                  <button
                    disabled={isSavingContextSources}
                    onClick={() => void chooseContextFolder()}
                    type="button"
                  >
                    Choose folder
                  </button>
                </div>
              </div>
              <div className="context-source-list" aria-live="polite">
                {contextSources.length === 0 ? (
                  <div className="context-source-empty">No sources recorded.</div>
                ) : (
                  contextSources.map((source) => (
                    <div className="context-source-item" key={source.id}>
                      <label className="context-source-select">
                        <input
                          checked={source.selected}
                          disabled={isSavingContextSources}
                          onChange={(event) =>
                            void setContextSourceSelection(
                              source.id,
                              event.target.checked
                            )
                          }
                          type="checkbox"
                        />
                        <span>{source.selected ? 'Selected' : 'Not selected'}</span>
                      </label>
                      <div className="context-source-details">
                        <strong>{source.label}</strong>
                        <span>{source.kind} · {source.status.replaceAll('_', ' ')}</span>
                        <span>
                          scope: {source.retrievalScopes[0] ?? 'none'} · content hash{' '}
                          {source.contentHash ? 'captured' : 'pending'}
                        </span>
                        <code>{source.location}</code>
                      </div>
                      <div className="context-source-actions">
                        {source.kind === 'file' &&
                        source.status === 'pending_classification' ? (
                          <button
                            disabled={isSavingContextSources}
                            onClick={() =>
                              void captureAndClassifySource(source.id)
                            }
                            type="button"
                          >
                            Capture & classify
                          </button>
                        ) : null}
                        <button
                          disabled={isSavingContextSources}
                          onClick={() => void removeStagedContextSource(source.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel-card counterparty-packs-card">
              <div className="panel-header">
                <div>
                  <h2>Context Packs</h2>
                </div>
                <span>{counterpartyPacks.length} active</span>
              </div>
              <p className="context-sources-description">
                Compact partner/job/investor packets. Use these to scope which context is visible during a specific interview or negotiation.
              </p>
                {(counterpartyPackDraftError || counterpartyPackDraftNotice ||
                counterpartyPackImportErrors.length > 0) && (
                <div className="stack">
                  {counterpartyPackDraftError ? (
                    <div className="error-box">{counterpartyPackDraftError}</div>
                  ) : null}
                  {counterpartyPackDraftNotice ? (
                    <div className="info-box">{counterpartyPackDraftNotice}</div>
                  ) : null}
                  {counterpartyPackImportErrors.length > 0 ? (
                    <div className="error-box">
                      <div style={{ marginBottom: '6px' }}>
                        Import issues (showing first 5):
                      </div>
                      <ul className="error-list">
                        {counterpartyPackImportErrors.map((errorMessage, errorIndex) => (
                          <li key={`${errorIndex}-${errorMessage}`}>{errorMessage}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
              {counterpartyFinderPayloadItems.length > 0 ? (
                <div className="context-source-list">
                  {counterpartyFinderPayloadItems.map((item) => (
                    <div className="context-source-item" key={item.index}>
                      <label className="context-source-select">
                        <input
                          checked={item.selected}
                          disabled={isSavingCounterpartyPacks || item.duplicate}
                          onChange={(event) =>
                            setCounterpartyFinderCandidateSelection(
                              item.index,
                              event.target.checked
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          {item.duplicate ? 'Duplicate' : 'Import'}
                        </span>
                      </label>
                      <div className="context-source-details">
                        <strong>{item.draft.partnerName}</strong>
                        <span>
                          {item.draft.kind} · {item.draft.title}
                        </span>
                        <span>
                          source: {item.draft.sourceId}
                        </span>
                        {item.duplicate ? (
                          <span>status: duplicate</span>
                        ) : null}
                        <code>{item.draft.summary}</code>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="compact-form-grid context-source-form">
                {counterpartyFinderPayloadItems.length > 0 ? (
                  <div className="settings-row settings-row-inline">
                    <div className="settings-row-label">
                      Preview status:
                      {' '}
                      {finderPayloadCandidateCountNonDuplicate} of
                      {' '}
                      {finderPayloadCandidatesCount}
                      {' '}
                      candidates are currently selectable. selected:
                      {' '}
                      {selectedFinderCandidatesCount}
                    </div>
                    <div className="button-row settings-actions">
                      <button
                        className="button-small"
                        disabled={
                          isSavingCounterpartyPacks ||
                          finderPayloadCandidateCountNonDuplicate === 0
                        }
                        onClick={() => {
                          toggleSelectAllFinderCandidates()
                        }}
                        type="button"
                      >
                        {areAllFinderCandidatesSelected
                          ? 'Deselect all'
                          : 'Select all'}
                      </button>
                    </div>
                  </div>
                ) : null}
                <label className="settings-row settings-row-textarea">
                  <span className="settings-row-label">Finder payload (paste JSON)</span>
                  <textarea
                    className="prepare-textarea"
                    onChange={(event) => {
                      setCounterpartyPackFinderPayload(event.target.value)
                      setCounterpartyPackDraftError(null)
                      setCounterpartyPackDraftNotice(null)
                      setCounterpartyFinderPayloadPreview(null)
                      setCounterpartyFinderPayloadItems([])
                      setCounterpartyPackImportErrors([])
                    }}
                    placeholder='{"kind":"job","sourceId":"finder:job:uuid","partnerName":"Acme","title":"Senior PM","summary":"...","linksText":"https://...\\nhttps://..."}'
                    rows={3}
                    value={counterpartyPackFinderPayload}
                  />
                </label>
                <div className="button-row settings-actions">
                  <button
                    disabled={isSavingCounterpartyPacks || !counterpartyPackFinderPayload.trim()}
                    onClick={() => void importFinderCandidates()}
                    type="button"
                  >
                    Preview Finder JSON
                  </button>
                  <button
                    disabled={!canImportFinderCandidates}
                    onClick={() => void importSelectedFinderCandidates()}
                    type="button"
                  >
                    Import selected candidates
                  </button>
                  <button
                    disabled={isSavingCounterpartyPacks}
                    onClick={() => {
                      clearFinderPayloadInput()
                    }}
                    type="button"
                  >
                    Clear finder input
                  </button>
                </div>
              </div>
              <div className="compact-form-grid context-source-form">
                <label className="settings-row">
                  <span className="settings-row-label">Kind</span>
                  <select
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        kind: event.target.value as CounterpartyContextPackKind
                      }))
                    }
                    value={counterpartyPackDraft.kind}
                  >
                    <option value="job">Job</option>
                    <option value="partner">Partner</option>
                    <option value="investor">Investor</option>
                    <option value="accelerator">Accelerator</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Source ID</span>
                  <input
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        sourceId: event.target.value
                      }))
                    }
                    placeholder="finder:job:uuid or finder:investor:domain"
                    value={counterpartyPackDraft.sourceId}
                  />
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Partner</span>
                  <input
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        partnerName: event.target.value
                      }))
                    }
                    placeholder="Acme Ventures / John Smith"
                    value={counterpartyPackDraft.partnerName}
                  />
                </label>
                <label className="settings-row">
                  <span className="settings-row-label">Title</span>
                  <input
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        title: event.target.value
                      }))
                    }
                    placeholder="Role, opportunity, campaign, or project name"
                    value={counterpartyPackDraft.title}
                  />
                </label>
                <label className="settings-row settings-row-textarea">
                  <span className="settings-row-label">Summary</span>
                  <textarea
                    className="prepare-textarea"
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        summary: event.target.value
                      }))
                    }
                    placeholder="Shortly describe the specific context for this counterparty"
                    value={counterpartyPackDraft.summary}
                  />
                </label>
                <label className="settings-row settings-row-textarea">
                  <span className="settings-row-label">Context</span>
                  <textarea
                    className="prepare-textarea"
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        context: event.target.value
                      }))
                    }
                    placeholder="Notes, constraints, current status"
                    value={counterpartyPackDraft.context}
                  />
                </label>
                <label className="settings-row settings-row-textarea">
                  <span className="settings-row-label">Links</span>
                  <textarea
                    className="prepare-textarea"
                    onChange={(event) =>
                      setCounterpartyPackDraft((current) => ({
                        ...current,
                        linksText: event.target.value
                      }))
                    }
                    placeholder="One link per line"
                    value={counterpartyPackDraft.linksText}
                  />
                </label>
                <div className="settings-row settings-row-checkbox">
                  <span className="settings-row-label">Selected</span>
                  <label className="inline-toggle">
                    <input
                      checked={counterpartyPackDraft.selected !== false}
                      onChange={(event) =>
                        setCounterpartyPackDraft((current) => ({
                          ...current,
                          selected: event.target.checked
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Use this pack in retrieval</span>
                  </label>
                </div>
                <div className="button-row settings-actions">
                  <button
                    disabled={
                      isSavingCounterpartyPacks ||
                      !counterpartyPackDraft.sourceId.trim() ||
                      !counterpartyPackDraft.partnerName.trim() ||
                      !counterpartyPackDraft.title.trim() ||
                      !counterpartyPackDraft.summary.trim()
                    }
                    onClick={() => void stageCounterpartyPack()}
                    type="button"
                  >
                    {counterpartyPackDraftingId ? 'Update pack' : 'Add pack'}
                  </button>
                  <button
                    disabled={
                      isSavingCounterpartyPacks ||
                      counterpartyPackDraftingId === null
                    }
                    onClick={() => resetCounterpartyPackDraft()}
                    type="button"
                  >
                    Cancel edit
                  </button>
                </div>
              </div>

              <div className="context-source-list" aria-live="polite">
                {counterpartyPacks.length === 0 ? (
                  <div className="context-source-empty">
                    No compact packs recorded.
                  </div>
                ) : (
                  counterpartyPacks.map((pack) => {
                    const eligibility = getCounterpartyPackSessionEligibility(pack)
                    const quality = evaluateCounterpartyPackQuality(pack)

                    return (
                      <div className="context-source-item" key={pack.id}>
                        <label className="context-source-select">
                          <input
                            checked={pack.selected}
                            disabled={isSavingCounterpartyPacks}
                            onChange={(event) =>
                              void setCounterpartyPackSelection(
                                pack.id,
                                event.target.checked
                              )
                            }
                            type="checkbox"
                          />
                          <span>{pack.selected ? 'Selected' : 'Not selected'}</span>
                        </label>
                        <div className="context-source-details">
                          <strong>{pack.partnerName}</strong>
                          <span>
                            {pack.kind} · {pack.title}
                          </span>
                          <span>
                            source: {pack.sourceId} · {pack.classification} · scope:{' '}
                            {pack.retrievalScopes[0] ?? 'none'}
                          </span>
                          <span
                            className={
                              eligibility.eligible
                                ? 'context-source-status-ready'
                                : 'context-source-status-blocked'
                            }
                          >
                            session: {formatCounterpartyPackSessionEligibility(eligibility)}
                          </span>
                          <span
                            className={`context-pack-quality context-pack-quality-${quality.level}`}
                            title={formatCounterpartyPackQualityFixes(quality)}
                          >
                            quality: {quality.label}
                          </span>
                          {quality.issues.length > 0 ? (
                            <code>
                              fix: {formatCounterpartyPackQualityFixes(quality)}
                            </code>
                          ) : null}
                          <code>{pack.summary}</code>
                        </div>
                        <div className="context-source-actions">
                          <button
                            disabled={isSavingCounterpartyPacks}
                            onClick={() => editCounterpartyPack(pack)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            disabled={isSavingCounterpartyPacks}
                            onClick={() => void removeCounterpartyPack(pack.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </article>
          </section>
        </section>
      ) : null}

      {activeTab === 'settings' ? (
        <section className="settings-layout scroll-section">
          {(settingsError || settingsNotice) && (
            <div className="stack">
              {settingsError ? (
                <div className="error-box">{settingsError}</div>
              ) : null}
              {settingsNotice ? (
                <div className="info-box">{settingsNotice}</div>
              ) : null}
            </div>
          )}

          <section className="settings-shell">
            <nav className="settings-nav" aria-label="Settings sections">
              {settingsNavItems.map(([id, label]) => (
                <button
                  className={settingsSection === id ? 'tab-active' : ''}
                  key={id}
                  onClick={() =>
                    setSettingsSection(
                      id as
                        | 'key'
                        | 'defaults'
                        | 'test'
                        | 'profile'
                        | 'cost'
                        | 'debug'
                        | 'about'
                    )
                  }
                  type="button"
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="settings-content">
              {settingsSectionContent[settingsSection]}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  )
}

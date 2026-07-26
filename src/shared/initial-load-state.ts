import type {
  ConfigStatus,
  ContextSourceManifestResult,
  FinderSearchStore,
  FinderSearchStoreResult,
  OpenAIKeyStatus,
  ProfileContextResult,
  SessionContext,
  SessionContextResult,
  SettingsPayload,
  SmokeTestNote,
  SmokeTestNotesResult
} from './app-types'
import { buildSessionPayloadInspector } from './session-payload-inspector'
import { getSessionSelectedCounterpartyPackIds } from './session-pack-selection'

export type InitialLoadState = {
  configStatus: ConfigStatus
  profileContext: string
  counterpartyPacks: ContextSourceManifestResult['manifest']['counterpartyPacks']
  knowledgePackLifecycle: NonNullable<
    ContextSourceManifestResult['manifest']['knowledgePackLifecycle']
  >
  sessionContext: SessionContext
  sessionContextDraft: SessionContext
  sessionRecoveryNotice: string | null
  activeSessionDroppedPackAudit: ReturnType<
    typeof buildSessionPayloadInspector
  >['droppedPacks']
  draftSessionDroppedPackAudit: ReturnType<
    typeof buildSessionPayloadInspector
  >['droppedPacks']
  contextSources: ContextSourceManifestResult['manifest']['sources']
  keyStatus: OpenAIKeyStatus
  settingsForm: SettingsPayload['settings']
  settingsMeta: SettingsPayload['meta']
  smokeNotes: SmokeTestNote[]
  finderSearchStore: FinderSearchStore
  includeProfileContext: boolean
  costMode: SettingsPayload['settings']['costMode']
  controlPatch: {
    callLanguage: SettingsPayload['settings']['defaultCallLanguage']
    answerLanguage: SettingsPayload['settings']['defaultAnswerLanguage']
  }
}

const formatSessionRecoveryNotice = (
  droppedPacks: ReturnType<typeof buildSessionPayloadInspector>['droppedPacks']
) => {
  if (droppedPacks.length === 0) {
    return null
  }

  const labels = droppedPacks
    .slice(0, 2)
    .map((pack) => pack.label)
    .join(', ')
  const remainingCount = droppedPacks.length - Math.min(droppedPacks.length, 2)
  const suffix = remainingCount > 0 ? ` +${remainingCount} more` : ''
  const noun = droppedPacks.length === 1 ? 'pack' : 'packs'
  const recoveryHint =
    droppedPacks.length === 1
      ? 'Open Prepare to review or replace the dropped pack.'
      : 'Open Prepare to review or replace the dropped packs.'

  return `Restored session without ${droppedPacks.length} ${noun}: ${labels}${suffix}. ${recoveryHint}`
}

export const buildInitialLoadState = ({
  status,
  profile,
  session,
  contextSourcePayload,
  settingsPayload,
  keyState,
  smokeNotePayload,
  finderSearchPayload
}: {
  status: ConfigStatus
  profile: ProfileContextResult
  session: SessionContextResult
  contextSourcePayload: ContextSourceManifestResult
  settingsPayload: SettingsPayload
  keyState: OpenAIKeyStatus
  smokeNotePayload: SmokeTestNotesResult
  finderSearchPayload: FinderSearchStoreResult
}): InitialLoadState => {
  const counterpartyPacks = contextSourcePayload.manifest.counterpartyPacks ?? []
  const persistedSessionContext = session.persistedContext ?? session.context
  const activeSessionDroppedPackAudit = buildSessionPayloadInspector({
    context: persistedSessionContext,
    availablePacks: counterpartyPacks,
    availableOutreachDrafts: finderSearchPayload.store.outreachDrafts,
    includeProfileContext:
      settingsPayload.settings.includeProfileContextByDefault,
    profileChars: profile.content.length
  }).droppedPacks
  const syncedSessionContext = {
    ...session.context,
    selectedCounterpartyPackIds: getSessionSelectedCounterpartyPackIds(
      session.context,
      counterpartyPacks
    )
  }

  return {
    configStatus: status,
    profileContext: profile.content,
    counterpartyPacks,
    knowledgePackLifecycle:
      contextSourcePayload.manifest.knowledgePackLifecycle ?? [],
    sessionContext: syncedSessionContext,
    sessionContextDraft: syncedSessionContext,
    sessionRecoveryNotice: formatSessionRecoveryNotice(
      activeSessionDroppedPackAudit
    ),
    activeSessionDroppedPackAudit,
    draftSessionDroppedPackAudit: activeSessionDroppedPackAudit,
    contextSources: contextSourcePayload.manifest.sources,
    keyStatus: keyState,
    settingsForm: settingsPayload.settings,
    settingsMeta: settingsPayload.meta,
    smokeNotes: smokeNotePayload.notes,
    finderSearchStore: finderSearchPayload.store,
    includeProfileContext:
      settingsPayload.settings.includeProfileContextByDefault,
    costMode: settingsPayload.settings.costMode,
    controlPatch: {
      callLanguage: settingsPayload.settings.defaultCallLanguage,
      answerLanguage: settingsPayload.settings.defaultAnswerLanguage
    }
  }
}

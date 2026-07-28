import type {
  CounterpartyContextPack,
  FinderCandidateResult,
  FinderOutreachDraft,
  SessionContext
} from './app-types'
import {
  buildManualPrepPreview,
  type ManualPrepPreview
} from './manual-prep-preview'
import {
  buildSessionPayloadInspector,
  buildSessionPayloadPackSummary,
  type SessionPayloadInspector,
  type SessionPayloadPackItem,
  type SessionPayloadPackSummary
} from './session-payload-inspector'

export type SessionSelectionSurface = {
  activePayloadInspector: SessionPayloadInspector
  draftPayloadInspector: SessionPayloadInspector
  activePackSummary: SessionPayloadPackSummary
  draftPackSummary: SessionPayloadPackSummary
  activePrepPreview: ManualPrepPreview
  draftPrepPreview: ManualPrepPreview
}

export const buildSessionSelectionSurface = ({
  activeContext,
  draftContext,
  availablePacks,
  availableFinderResults = [],
  availableOutreachDrafts = [],
  activeAuditedDroppedPacks = [],
  draftAuditedDroppedPacks = [],
  includeProfileContext,
  profileChars
}: {
  activeContext: SessionContext
  draftContext: SessionContext
  availablePacks: CounterpartyContextPack[]
  availableFinderResults?: FinderCandidateResult[]
  availableOutreachDrafts?: FinderOutreachDraft[]
  activeAuditedDroppedPacks?: SessionPayloadPackItem[]
  draftAuditedDroppedPacks?: SessionPayloadPackItem[]
  includeProfileContext: boolean
  profileChars: number
}): SessionSelectionSurface => {
  const activePayloadInspector = buildSessionPayloadInspector({
    context: activeContext,
    availablePacks,
    availableFinderResults,
    availableOutreachDrafts,
    auditedDroppedPacks: activeAuditedDroppedPacks,
    includeProfileContext,
    profileChars
  })
  const draftPayloadInspector = buildSessionPayloadInspector({
    context: draftContext,
    availablePacks,
    availableFinderResults,
    availableOutreachDrafts,
    auditedDroppedPacks: draftAuditedDroppedPacks,
    includeProfileContext,
    profileChars
  })

  return {
    activePayloadInspector,
    draftPayloadInspector,
    activePackSummary: buildSessionPayloadPackSummary(activePayloadInspector),
    draftPackSummary: buildSessionPayloadPackSummary(draftPayloadInspector),
    activePrepPreview: buildManualPrepPreview({
      context: activeContext,
      availablePacks,
      availableFinderResults,
      availableOutreachDrafts,
      auditedDroppedPacks: activeAuditedDroppedPacks,
      includeProfileContext,
      profileChars
    }),
    draftPrepPreview: buildManualPrepPreview({
      context: draftContext,
      availablePacks,
      availableFinderResults,
      availableOutreachDrafts,
      auditedDroppedPacks: draftAuditedDroppedPacks,
      includeProfileContext,
      profileChars
    })
  }
}

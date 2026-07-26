import type {
  CounterpartyContextPack,
  FinderOutreachDraft,
  SessionContext
} from './app-types'
import { buildFinderRelationshipMemory } from './finder-relationship-memory'
import {
  evaluateCounterpartyPackQuality,
  type CounterpartyPackQualityLevel
} from './context-pack-quality'
import {
  buildSessionPayloadInspector,
  buildSessionPayloadPackSummary,
  type SessionPayloadPackItem
} from './session-payload-inspector'

export type ManualPrepWeakField = {
  id:
    | 'missing_company'
    | 'missing_role'
    | 'missing_goal'
    | 'missing_context'
    | 'missing_notes'
    | 'missing_pack'
    | 'weak_pack'
    | 'blocked_pack'
    | 'missing_outreach_draft'
  label: string
  fix: string
}

export type ManualPrepPreview = {
  sessionLabel: string
  goalLabel: string
  contextLabel: string
  selectedPackCount: number
  selectedPackLabel: string
  selectedOutreachDraftLabel: string
  selectedOutreachDraftStatusLabel: string
  selectedOutreachDraftLastContactLabel: string
  selectedOutreachDraftFollowUpLabel: string
  selectedPackQualityLabel: string
  selectedPackQualityLevel: CounterpartyPackQualityLevel | 'none'
  assistantPayloadLabel: string
  weakFields: ManualPrepWeakField[]
}

const hasText = (value: string, minLength = 1) =>
  value.trim().length >= minLength

const getSessionLabel = (context: SessionContext) => {
  const company = context.company.trim()
  const role = context.role.trim()

  if (company && role) {
    return `${company} · ${role}`
  }

  return company || role || 'No company/role'
}

const getSessionTextLength = (context: SessionContext) =>
  [
    context.company,
    context.role,
    context.context,
    context.goal,
    context.notes
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n').length

const levelRank: Record<CounterpartyPackQualityLevel, number> = {
  blocked: 0,
  weak: 1,
  usable: 2,
  strong: 3
}

export const buildManualPrepPreview = ({
  context,
  availablePacks,
  availableOutreachDrafts = [],
  auditedDroppedPacks = [],
  includeProfileContext,
  profileChars
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
  availableOutreachDrafts?: FinderOutreachDraft[]
  auditedDroppedPacks?: SessionPayloadPackItem[]
  includeProfileContext: boolean
  profileChars: number
}): ManualPrepPreview => {
  const payloadInspector = buildSessionPayloadInspector({
    context,
    availablePacks,
    availableOutreachDrafts,
    auditedDroppedPacks,
    includeProfileContext,
    profileChars
  })
  const packSummary = buildSessionPayloadPackSummary(payloadInspector)
  const weakFields: ManualPrepWeakField[] = []
  const selectedPacks = payloadInspector.includedPacks
    .map((item) => availablePacks.find((pack) => pack.id === item.id))
    .filter((pack): pack is CounterpartyContextPack => Boolean(pack))
  const selectedPackQualities = selectedPacks.map((pack) => ({
    pack,
    quality: evaluateCounterpartyPackQuality(pack)
  }))
  const selectedOutreachDraft = context.selectedFinderOutreachDraftId
    ? availableOutreachDrafts.find(
        (draft) => draft.id === context.selectedFinderOutreachDraftId
      )
    : null
  const selectedOutreachRelationshipMemory = selectedOutreachDraft
    ? buildFinderRelationshipMemory(selectedOutreachDraft)
    : null
  const worstQuality = selectedPackQualities
    .map(({ quality }) => quality)
    .sort((left, right) => levelRank[left.level] - levelRank[right.level])[0]

  if (!hasText(context.company)) {
    weakFields.push({
      id: 'missing_company',
      label: 'company missing',
      fix: 'Add company or partner name.'
    })
  }

  if (!hasText(context.role)) {
    weakFields.push({
      id: 'missing_role',
      label: 'role missing',
      fix: 'Add role, meeting type, or counterpart.'
    })
  }

  if (!hasText(context.goal, 20)) {
    weakFields.push({
      id: 'missing_goal',
      label: 'goal thin',
      fix: 'Add what you want from this call.'
    })
  }

  if (!hasText(context.context, 20)) {
    weakFields.push({
      id: 'missing_context',
      label: 'context thin',
      fix: 'Add vacancy/project/investor context.'
    })
  }

  if (!hasText(context.notes, 20)) {
    weakFields.push({
      id: 'missing_notes',
      label: 'notes thin',
      fix: 'Add facts, constraints, strong points, or questions to ask.'
    })
  }

  if (packSummary.state === 'none') {
    weakFields.push({
      id: 'missing_pack',
      label: 'no selected pack',
      fix: 'Select one counterparty pack for this call.'
    })
  } else if (packSummary.state === 'dropped') {
    weakFields.push({
      id: 'blocked_pack',
      label: 'selected pack dropped',
      fix: 'Restore or replace the dropped selected pack before the live call.'
    })
  }

  if (context.selectedFinderOutreachDraftId && !selectedOutreachDraft) {
    weakFields.push({
      id: 'missing_outreach_draft',
      label: 'draft missing',
      fix: 'Select an existing outreach draft or clear the stale draft link.'
    })
  }

  for (const { pack, quality } of selectedPackQualities) {
    if (quality.level === 'blocked') {
      weakFields.push({
        id: 'blocked_pack',
        label: `${pack.partnerName}: blocked`,
        fix: 'Fix blocked selected pack before the live call.'
      })
    } else if (quality.level === 'weak') {
      weakFields.push({
        id: 'weak_pack',
        label: `${pack.partnerName}: weak`,
        fix: 'Improve selected pack summary/context/links.'
      })
    }
  }

  const selectedPackLabel = packSummary.detailLabel
  const selectedPackQualityLevel =
    packSummary.state === 'dropped'
      ? 'blocked'
      : worstQuality?.level ?? 'none'
  const selectedPackQualityLabel =
    packSummary.state === 'dropped'
      ? 'dropped from assistant payload'
      : worstQuality
        ? `${worstQuality.label}${selectedPacks.length > 1 ? ' worst' : ''}`
        : 'none'
  const sessionChars = getSessionTextLength(context)

  return {
    sessionLabel: getSessionLabel(context),
    goalLabel: context.goal.trim() || 'No goal',
    contextLabel: context.context.trim() || 'No context',
    selectedPackCount: packSummary.includedCount,
    selectedPackLabel,
    selectedOutreachDraftLabel: selectedOutreachDraft
      ? `${selectedOutreachDraft.targetName} · ${selectedOutreachDraft.opportunity}`
      : context.selectedFinderOutreachDraftId
        ? 'Missing selected draft'
        : 'No selected outreach draft',
    selectedOutreachDraftStatusLabel: selectedOutreachRelationshipMemory
      ? selectedOutreachRelationshipMemory.statusLabel
      : selectedOutreachDraft
        ? 'working draft'
        : 'none',
    selectedOutreachDraftLastContactLabel: selectedOutreachRelationshipMemory
      ? selectedOutreachRelationshipMemory.lastContactLabel
      : context.selectedFinderOutreachDraftId
        ? 'Draft missing from local Finder source truth.'
        : 'No contact recorded yet.',
    selectedOutreachDraftFollowUpLabel: selectedOutreachRelationshipMemory
      ? selectedOutreachRelationshipMemory.followUpContextLabel
      : context.selectedFinderOutreachDraftId
        ? 'Select a valid draft to restore follow-up context.'
        : 'No follow-up context selected.',
    selectedPackQualityLabel,
    selectedPackQualityLevel,
    assistantPayloadLabel: `session ${sessionChars} chars · packs ${packSummary.includedCount} · profile ${
      includeProfileContext ? `${profileChars} chars` : 'off'
    }`,
    weakFields
  }
}

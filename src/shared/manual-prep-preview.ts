import type {
  CounterpartyContextPack,
  SessionContext
} from './app-types'
import {
  evaluateCounterpartyPackQuality,
  type CounterpartyPackQualityLevel
} from './context-pack-quality'

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
  label: string
  fix: string
}

export type ManualPrepPreview = {
  sessionLabel: string
  goalLabel: string
  contextLabel: string
  selectedPackCount: number
  selectedPackLabel: string
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
  includeProfileContext,
  profileChars
}: {
  context: SessionContext
  availablePacks: CounterpartyContextPack[]
  includeProfileContext: boolean
  profileChars: number
}): ManualPrepPreview => {
  const weakFields: ManualPrepWeakField[] = []
  const selectedPacks = context.selectedCounterpartyPackIds
    .map((id) => availablePacks.find((pack) => pack.id === id))
    .filter((pack): pack is CounterpartyContextPack => Boolean(pack))
  const selectedPackQualities = selectedPacks.map((pack) => ({
    pack,
    quality: evaluateCounterpartyPackQuality(pack)
  }))
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

  if (selectedPacks.length === 0) {
    weakFields.push({
      id: 'missing_pack',
      label: 'no selected pack',
      fix: 'Select one counterparty pack for this call.'
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

  const selectedPackLabel =
    selectedPacks.length === 0
      ? 'No selected pack'
      : selectedPacks
          .map((pack) => `${pack.partnerName} · ${pack.title}`)
          .slice(0, 3)
          .join(', ')
  const selectedPackQualityLevel = worstQuality?.level ?? 'none'
  const selectedPackQualityLabel = worstQuality
    ? `${worstQuality.label}${selectedPacks.length > 1 ? ' worst' : ''}`
    : 'none'
  const sessionChars = getSessionTextLength(context)

  return {
    sessionLabel: getSessionLabel(context),
    goalLabel: context.goal.trim() || 'No goal',
    contextLabel: context.context.trim() || 'No context',
    selectedPackCount: selectedPacks.length,
    selectedPackLabel,
    selectedPackQualityLabel,
    selectedPackQualityLevel,
    assistantPayloadLabel: `session ${sessionChars} chars · packs ${selectedPacks.length} · profile ${
      includeProfileContext ? `${profileChars} chars` : 'off'
    }`,
    weakFields
  }
}

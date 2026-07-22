import type { CounterpartyContextPack } from './app-types'
import {
  formatCounterpartyPackSessionEligibility,
  getCounterpartyPackSessionEligibility
} from './session-pack-selection'

export type CounterpartyPackQualityLevel =
  | 'strong'
  | 'usable'
  | 'weak'
  | 'blocked'

export type CounterpartyPackQualityIssue = {
  id:
    | 'session_blocked'
    | 'short_summary'
    | 'missing_context'
    | 'missing_links'
    | 'weak_identity'
  label: string
  fix: string
}

export type CounterpartyPackQuality = {
  score: number
  level: CounterpartyPackQualityLevel
  label: string
  issues: CounterpartyPackQualityIssue[]
}

const hasUsefulText = (value: string, minLength: number) =>
  value.trim().length >= minLength

const hasWeakIdentity = (pack: CounterpartyContextPack) =>
  !pack.partnerName.trim() || !pack.title.trim() || !pack.sourceId.trim()

export const evaluateCounterpartyPackQuality = (
  pack: CounterpartyContextPack
): CounterpartyPackQuality => {
  const eligibility = getCounterpartyPackSessionEligibility(pack)
  const issues: CounterpartyPackQualityIssue[] = []
  let score = 0

  if (eligibility.eligible) {
    score += 25
  } else {
    issues.push({
      id: 'session_blocked',
      label: formatCounterpartyPackSessionEligibility(eligibility),
      fix: 'Fix selection/classification/scope before using this pack in a call.'
    })
  }

  if (hasWeakIdentity(pack)) {
    issues.push({
      id: 'weak_identity',
      label: 'weak identity',
      fix: 'Add partner name, title, and stable source ID.'
    })
  } else {
    score += 15
  }

  if (hasUsefulText(pack.summary, 40)) {
    score += 25
  } else {
    issues.push({
      id: 'short_summary',
      label: 'short summary',
      fix: 'Add a concrete 1-2 sentence summary of this opportunity.'
    })
  }

  if (hasUsefulText(pack.context, 80)) {
    score += 25
  } else {
    issues.push({
      id: 'missing_context',
      label: 'thin context',
      fix: 'Add what was sent, what they care about, and your goal for the call.'
    })
  }

  if (pack.links.length > 0) {
    score += 10
  } else {
    issues.push({
      id: 'missing_links',
      label: 'no links',
      fix: 'Add at least one source link such as vacancy, website, or partner page.'
    })
  }

  const level: CounterpartyPackQualityLevel =
    !eligibility.eligible
      ? 'blocked'
      : score >= 85
        ? 'strong'
        : score >= 60
          ? 'usable'
          : 'weak'

  return {
    score,
    level,
    label: `${level} ${score}/100`,
    issues
  }
}

export const formatCounterpartyPackQualityFixes = (
  quality: CounterpartyPackQuality,
  maxIssues = 3
) =>
  quality.issues.length === 0
    ? 'No obvious fixes.'
    : quality.issues
        .slice(0, maxIssues)
        .map((issue) => issue.fix)
        .join(' ')

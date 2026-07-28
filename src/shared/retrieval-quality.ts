export interface RetrievalQualitySection {
  label: string
  text: string
  weight: number
}

export interface RetrievalQualityCandidate {
  id: string
  sourceId: string
  label: string
  kind: string
  sections: RetrievalQualitySection[]
  fallbackPriority?: number
}

export interface RetrievalQualityMatchSection {
  label: string
  text: string
  score: number
}

export interface RetrievalQualityMatch {
  id: string
  sourceId: string
  label: string
  kind: string
  score: number
  fallbackUsed: boolean
  matchedTerms: string[]
  sections: RetrievalQualityMatchSection[]
}

export interface RetrievalQualityResult {
  matches: RetrievalQualityMatch[]
  queryTerms: string[]
}

const stopWords = new Set([
  'about',
  'avec',
  'avec',
  'been',
  'call',
  'cela',
  'cette',
  'dans',
  'des',
  'does',
  'dont',
  'from',
  'have',
  'into',
  'pour',
  'plus',
  'quoi',
  'role',
  'this',
  'tout',
  'very',
  'votre',
  'vous',
  'what',
  'when',
  'where',
  'will',
  'with',
  'your'
])

const sanitizeText = (value: string) => value.replace(/\s+/g, ' ').trim()

const tokenize = (value: string) =>
  sanitizeText(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu)?.filter((term) => !stopWords.has(term)) ?? []

const normalizeTerms = (value: string) => [...new Set(tokenize(value))]

const buildTermVariants = (term: string) => {
  const variants = new Set([term])
  if (term.length >= 5) {
    variants.add(term.slice(0, 5))
  }
  if (term.endsWith('ing') && term.length > 5) {
    variants.add(term.slice(0, -3))
  }
  if (term.endsWith('ion') && term.length > 5) {
    variants.add(term.slice(0, -3))
  }
  if (term.endsWith('es') && term.length > 4) {
    variants.add(term.slice(0, -2))
  }
  if (term.endsWith('s') && term.length > 4) {
    variants.add(term.slice(0, -1))
  }

  return [...variants].filter(Boolean)
}

const scoreSection = (
  section: RetrievalQualitySection,
  queryTerms: string[]
) => {
  const normalizedText = sanitizeText(section.text).toLowerCase()
  if (!normalizedText) {
    return null
  }

  const matchedTerms = queryTerms.filter((term) =>
    buildTermVariants(term).some((variant) => normalizedText.includes(variant))
  )

  if (matchedTerms.length === 0) {
    return null
  }

  const score = section.weight * matchedTerms.length

  return {
    label: section.label,
    text: sanitizeText(section.text),
    score,
    matchedTerms
  }
}

export const rankRetrievalCandidates = ({
  query,
  candidates,
  limit = 3
}: {
  query: string
  candidates: RetrievalQualityCandidate[]
  limit?: number
}): RetrievalQualityResult => {
  const queryTerms = normalizeTerms(query)

  const scored = candidates
    .map((candidate) => {
      const sections = candidate.sections
        .map((section) => scoreSection(section, queryTerms))
        .filter(
          (
            section
          ): section is {
            label: string
            text: string
            score: number
            matchedTerms: string[]
          } => Boolean(section)
        )
        .sort((left, right) => right.score - left.score)

      const matchedTerms = [...new Set(sections.flatMap((section) => section.matchedTerms))]
      const score = sections.reduce((total, section) => total + section.score, 0)

      return {
        candidate,
        sections,
        matchedTerms,
        score
      }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  const topScored = scored.slice(0, limit)

  if (topScored.length > 0) {
    return {
      queryTerms,
      matches: topScored.map(({ candidate, sections, matchedTerms, score }) => ({
        id: candidate.id,
        sourceId: candidate.sourceId,
        label: candidate.label,
        kind: candidate.kind,
        score,
        fallbackUsed: false,
        matchedTerms,
        sections: sections.slice(0, 3).map((section) => ({
          label: section.label,
          text: section.text,
          score: section.score
        }))
      }))
    }
  }

  const fallback = candidates
    .slice()
    .sort(
      (left, right) =>
        (right.fallbackPriority ?? 0) - (left.fallbackPriority ?? 0) ||
        right.sections.length - left.sections.length
    )
    .slice(0, Math.min(limit, candidates.length))

  return {
    queryTerms,
    matches: fallback.map((candidate) => ({
      id: candidate.id,
      sourceId: candidate.sourceId,
      label: candidate.label,
      kind: candidate.kind,
      score: candidate.fallbackPriority ?? 0,
      fallbackUsed: true,
      matchedTerms: [],
      sections: candidate.sections
        .filter((section) => sanitizeText(section.text))
        .slice(0, 3)
        .map((section) => ({
          label: section.label,
          text: sanitizeText(section.text),
          score: section.weight
        }))
    }))
  }
}

export const formatRetrievalQualityMatches = (
  result: RetrievalQualityResult,
  maxChars = 2200
) =>
  result.matches
    .map((match) => {
      const sectionLabel = match.sections
        .map((section) => `${section.label}: ${section.text}`)
        .join(' | ')
      const matchLabel = match.fallbackUsed
        ? 'selected fallback'
        : `matched ${match.matchedTerms.join(', ')}`

      return `[${match.sourceId}] ${match.label} (${match.kind}; ${matchLabel}) ${sectionLabel}`
    })
    .join('\n\n')
    .slice(0, maxChars)

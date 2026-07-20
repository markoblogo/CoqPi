export const finderCounterpartyKindValues = [
  'job',
  'partner',
  'investor',
  'accelerator',
  'other'
] as const

export type FinderCounterpartyKind = (typeof finderCounterpartyKindValues)[number]

export interface FinderCounterpartyDraftSource {
  kind: FinderCounterpartyKind
  sourceId: string
  partnerName: string
  title: string
  summary: string
  context?: string
  links?: string[]
  selected?: boolean
}

export const FINDER_COUNTERPARTY_REQUIRED_FIELDS_ERROR =
  'A counterparty pack requires kind, sourceId, partnerName, title and summary.'

const sanitizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeLinks = (value: unknown) => {
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((candidate) => sanitizeText(candidate))
    .filter(Boolean)
}

const isFinderCounterpartyKind = (value: string): value is FinderCounterpartyKind => {
  return finderCounterpartyKindValues.includes(value as FinderCounterpartyKind)
}

export const normalizeFinderCounterpartyDraft = (
  raw: Record<string, unknown>
): FinderCounterpartyDraftSource => {
  const kindCandidate = sanitizeText(raw.kind)
  const kind = isFinderCounterpartyKind(kindCandidate)
    ? kindCandidate
    : null
  const sourceId = sanitizeText(raw.sourceId) || sanitizeText(raw.id)
  const partnerName = sanitizeText(raw.partnerName) || sanitizeText(raw.partner)
  const title = sanitizeText(raw.title)
  const summary = sanitizeText(raw.summary)
  const context = sanitizeText(raw.context)
  const links = normalizeLinks(raw.links)

  const linksTextSource = sanitizeText(raw.linksText)
  const extraLinks = normalizeLinks(linksTextSource)
  const normalizedLinks = [
    ...links.filter(Boolean),
    ...extraLinks.filter(Boolean)
  ].filter((link, index, array) => array.indexOf(link) === index)

  if (!kind || !sourceId || !partnerName || !title || !summary) {
    throw new Error(FINDER_COUNTERPARTY_REQUIRED_FIELDS_ERROR)
  }

  const result: FinderCounterpartyDraftSource = {
    sourceId,
    kind,
    partnerName,
    title,
    summary,
    selected: raw.selected !== false
  }

  if (context) {
    result.context = context
  }

  if (normalizedLinks.length > 0) {
    result.links = normalizedLinks
  }

  return result
}

export const parseFinderCounterpartyPayloadText = (
  text: string
): FinderCounterpartyDraftSource[] => {
  const payload = JSON.parse(text) as unknown

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      normalizeFinderCounterpartyDraft(
        typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>)
          : {}
      )
    )
  }

  if (payload && typeof payload === 'object') {
    return [
      normalizeFinderCounterpartyDraft(payload as Record<string, unknown>)
    ]
  }

  throw new Error(
    'Finder payload must be a JSON object or array for counterparty packs.'
  )
}

export const normalizeFinderLinksText = (value: string) => {
  return normalizeLinks(value).filter(
    (line, index, lines) => lines.indexOf(line) === index
  )
}

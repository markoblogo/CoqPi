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

export interface FinderCounterpartyPayloadError {
  index?: number
  reason: string
}

export interface ParsedFinderCounterpartyPayload {
  requestedCount: number
  drafts: FinderCounterpartyDraftSource[]
  errors: FinderCounterpartyPayloadError[]
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

const asObject = (candidate: unknown): Record<string, unknown> => {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Finder payload item must be a JSON object for counterparty packs.')
  }

  return candidate as Record<string, unknown>
}

const parseFinderCounterpartyPayloadItemOrError = (
  raw: unknown,
  index?: number
): FinderCounterpartyDraftSource | FinderCounterpartyPayloadError => {
  try {
    return normalizeFinderCounterpartyDraft(asObject(raw))
  } catch (error) {
    const suffix = index === undefined ? '' : ` at index ${index}`
    const reason = error instanceof Error
      ? error.message
      : String(error)

    return {
      index,
      reason: `Invalid finder counterparty payload item${suffix}: ${reason}`
    }
  }
}

export const parseFinderCounterpartyPayloadText = (
  text: string
): FinderCounterpartyDraftSource[] => {
  const parsed = parseFinderCounterpartyPayloadTextPermissive(text)

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.reason ?? 'Invalid finder payload.')
  }

  return parsed.drafts
}

export const parseFinderCounterpartyPayloadTextPermissive = (
  text: string
): ParsedFinderCounterpartyPayload => {
  const payload = JSON.parse(text) as unknown
  let errors: FinderCounterpartyPayloadError[] = []
  let drafts: FinderCounterpartyDraftSource[] = []
  let requestedCount = 0

  if (Array.isArray(payload)) {
    requestedCount = payload.length
    for (let index = 0; index < payload.length; index += 1) {
      const parsed = parseFinderCounterpartyPayloadItemOrError(
        payload[index],
        index
      )

      if ('sourceId' in parsed && 'kind' in parsed && 'partnerName' in parsed) {
        drafts.push(parsed)
      } else {
        errors.push(parsed as FinderCounterpartyPayloadError)
      }
    }

    return { requestedCount, drafts, errors }
  }

  if (payload && typeof payload === 'object') {
    requestedCount = 1
    const parsed = parseFinderCounterpartyPayloadItemOrError(payload)

    if ('sourceId' in parsed && 'kind' in parsed && 'partnerName' in parsed) {
      drafts = [parsed]
    } else {
      errors = [parsed as FinderCounterpartyPayloadError]
    }

    return { requestedCount, drafts, errors }
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

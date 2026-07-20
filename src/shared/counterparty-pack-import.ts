import type {
  CounterpartyContextPackDraft,
  CounterpartyContextPackKind
} from './app-types'

const PACK_KIND_VALUES: CounterpartyContextPackKind[] = [
  'job',
  'partner',
  'investor',
  'accelerator',
  'other'
]

const REQUIRED_PACK_FIELDS_ERROR =
  'A counterparty pack requires kind, sourceId, partnerName, title and summary.'

const sanitizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

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

const isCounterpartyContextPackKind = (value: string): value is CounterpartyContextPackKind => {
  return PACK_KIND_VALUES.includes(value as CounterpartyContextPackKind)
}

const normalizeCounterpartyDraft = (
  raw: Record<string, unknown>
): CounterpartyContextPackDraft => {
  const kindCandidate = sanitizeText(raw.kind)
  const kind = isCounterpartyContextPackKind(kindCandidate)
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
    throw new Error(REQUIRED_PACK_FIELDS_ERROR)
  }

  const result: CounterpartyContextPackDraft = {
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

export const parseCounterpartyPackJsonPayload = (
  text: string
): CounterpartyContextPackDraft[] => {
  const payload = JSON.parse(text) as unknown

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      normalizeCounterpartyDraft(
        (typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>)
          : {})
      )
    )
  }

  if (payload && typeof payload === 'object') {
    return [normalizeCounterpartyDraft(payload as Record<string, unknown>)]
  }

  throw new Error(
    'Finder payload must be a JSON object or array for counterparty packs.'
  )
}

export const normalizeLinksText = (value: string) => {
  return normalizeLinks(value).filter(
    (line, index, lines) => lines.indexOf(line) === index
  )
}


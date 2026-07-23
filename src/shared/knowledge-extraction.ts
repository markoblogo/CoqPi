import type { ContextSourceExtraction } from './app-types'

type ExtractionBucket = {
  ownerFacts: string[]
  roleFacts: string[]
  links: string[]
  dates: string[]
}

const MAX_FACTS = 8
const MAX_LINKS = 10
const MAX_DATES = 10
const MAX_TEXT_CHARS = 180
const urlPattern = /\bhttps?:\/\/[^\s"',)\];}]+/giu
const datePattern =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/giu
const ownerSignals =
  /\b(owner|profile|cv|resume|about me|experience|skills?|achievements?|projects?|i\b|my\b|я\b|мой|опыт|навыки)\b/iu
const roleSignals =
  /\b(role|job|position|vacancy|company|responsibilit(?:y|ies)|requirements?|interview|partner|investor|accelerator|deadline|contact|роль|вакансия|компания|партнер|инвестор)\b/iu

const unique = (values: string[], max: number) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(
    0,
    max
  )

const compactText = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT_CHARS)
    : ''

const splitLines = (text: string) =>
  text
    .split(/\r?\n|[•]/u)
    .map((line) =>
      line
        .replace(/^[-*#>\d.)\s]+/u, '')
        .replace(/\|/gu, ' ')
        .trim()
    )
    .filter((line) => line.length >= 12)

const collectCommon = (text: string, bucket: ExtractionBucket) => {
  bucket.links.push(...(text.match(urlPattern) ?? []))
  bucket.dates.push(...(text.match(datePattern) ?? []))
}

const classifyLines = (lines: string[], bucket: ExtractionBucket) => {
  for (const line of lines) {
    const compact = compactText(line)
    if (!compact) {
      continue
    }

    if (ownerSignals.test(compact)) {
      bucket.ownerFacts.push(compact)
    }

    if (roleSignals.test(compact)) {
      bucket.roleFacts.push(compact)
    }
  }
}

const flattenJson = (value: unknown, prefix = ''): string[] => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [`${prefix}: ${String(value)}`]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJson(item, `${prefix}[${index}]`))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      flattenJson(item, prefix ? `${prefix}.${key}` : key)
    )
  }

  return []
}

const parseCsvRows = (text: string) => {
  const rows = text
    .split(/\r?\n/u)
    .map((line) => line.split(/[,;\t]/u).map((cell) => compactText(cell)))
    .filter((row) => row.some(Boolean))
  const header = rows[0] ?? []

  return rows.slice(1, 12).flatMap((row) =>
    row.map((cell, index) =>
      header[index] ? `${header[index]}: ${cell}` : cell
    )
  )
}

const formatForLocation = (location: string): ContextSourceExtraction['sourceFormat'] => {
  const extension = location.match(/\.[a-z0-9]+$/iu)?.[0]?.toLowerCase() ?? ''
  if (extension === '.md') {
    return 'markdown'
  }
  if (extension === '.json') {
    return 'json'
  }
  if (extension === '.csv') {
    return 'csv'
  }
  return 'text'
}

export const extractKnowledgeFieldsFromReadableText = (
  text: string,
  location: string,
  extractedAt = new Date().toISOString()
): ContextSourceExtraction => {
  const sourceFormat = formatForLocation(location)
  const bucket: ExtractionBucket = {
    ownerFacts: [],
    roleFacts: [],
    links: [],
    dates: []
  }
  const normalizedText = text.slice(0, 12000)

  collectCommon(normalizedText, bucket)

  if (sourceFormat === 'json') {
    try {
      classifyLines(flattenJson(JSON.parse(normalizedText)), bucket)
    } catch {
      classifyLines(splitLines(normalizedText), bucket)
    }
  } else if (sourceFormat === 'csv') {
    classifyLines(parseCsvRows(normalizedText), bucket)
  } else {
    classifyLines(splitLines(normalizedText), bucket)
  }

  const ownerFacts = unique(bucket.ownerFacts, MAX_FACTS)
  const roleFacts = unique(bucket.roleFacts, MAX_FACTS)
  const links = unique(bucket.links, MAX_LINKS)
  const dates = unique(bucket.dates, MAX_DATES)
  const missingFields = [
    ownerFacts.length === 0 ? 'owner facts' : '',
    roleFacts.length === 0 ? 'role/respondent facts' : '',
    links.length === 0 ? 'links' : '',
    dates.length === 0 ? 'dates/deadlines' : ''
  ].filter(Boolean)

  return {
    version: 1,
    sourceFormat,
    extractedAt,
    ownerFacts,
    roleFacts,
    links,
    dates,
    missingFields
  }
}

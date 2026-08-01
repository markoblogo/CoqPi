import type {
  FinderCandidateDecisionState,
  CounterpartyContextPackDraft,
  CounterpartyContextPackKind,
  FinderCandidateResult,
  FinderCandidateResultDraft,
  FinderSourceAdapterDetectedFormat,
  FinderSourceAdapterMode,
  FinderOutreachDraft,
  FinderOutreachDraftStatus,
  FinderSearchJob,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSourceAdapterRunSummary,
  FinderRunnerRunSummary,
  FinderSearchStatusCounts
} from './app-types'
import {
  buildFinderOutreachDraftSessionHandoff,
  buildFinderRelationshipMemory,
  type FinderOutreachDraftSessionHandoff,
  type FinderRelationshipMemory
} from './finder-relationship-memory'
import { inferFinderParserPackV1 } from './parser-pack-set'

export type FinderPipelineStatusFilter = 'all' | FinderCandidateResult['status']
export type FinderPipelineDecisionFilter = 'all' | 'import' | 'hold' | 'reject'

export type FinderPipelineSortMode =
  | 'fit_desc'
  | 'fit_asc'
  | 'status'
  | 'decision'
  | 'next_action'

export interface FinderPipelineFilters {
  status?: FinderPipelineStatusFilter
  decision?: FinderPipelineDecisionFilter
  sortMode?: FinderPipelineSortMode
  minFitScore?: number
  requiresNextAction?: boolean
}

export interface FinderOutreachPrepPack {
  targetName: string
  opportunity: string
  kind: CounterpartyContextPackKind
  fitLabel: string
  whyRelevant: string
  knownContext: string[]
  questionsToAsk: string[]
  openingMessage: string
  nextAction: string
  warnings: string[]
}

export interface FinderCandidateOutreachPipeline {
  result: FinderCandidateResult
  score: FinderCandidateScoreExplanation
  qualityReview: FinderPreviewQualityReview
  importDecision: FinderPreviewImportDecision
  queue: FinderDecisionQueueItem
  prep: FinderOutreachPrepPack
  draft: {
    exists: boolean
    status: FinderOutreachDraftStatus | 'missing'
    label: string
    warnings: string[]
  }
  sessionHandoff: Pick<
    FinderOutreachDraftSessionHandoff,
    'state' | 'included' | 'label' | 'hint'
  >
  relationshipMemory: FinderRelationshipMemory | null
  recommendedAction: string
  blockers: string[]
}

export interface FinderDecisionQueueItem {
  recommendation: 'import' | 'hold' | 'reject'
  priority: 'now' | 'soon' | 'later'
  score: number
  summary: string
  reasons: string[]
}

export type FinderQueueImportEligibilityReason =
  | 'eligible'
  | 'not-ready'
  | 'not-recommended'
  | 'weak-needs-confirmation'
  | 'duplicate-source'

export interface FinderQueueCandidateImportStatus {
  result: FinderCandidateResult
  canImport: boolean
  reason: FinderQueueImportEligibilityReason
  decision: FinderDecisionQueueItem
  qualityReview: FinderPreviewQualityReview
}

export interface FinderQueueImportPlan {
  importable: FinderCandidateResult[]
  skipped: FinderQueueCandidateImportStatus[]
}

export interface FinderDecisionQueueSummary {
  importCount: number
  holdCount: number
  rejectCount: number
  nowCount: number
  soonCount: number
  laterCount: number
}

export type FinderQueueReviewLane = 'import' | 'hold' | 'reject'

export interface FinderQueueReviewItem {
  result: FinderCandidateResult
  decision: FinderDecisionQueueItem
  lane: FinderQueueReviewLane
  explicitState: FinderCandidateDecisionState
  isExplicit: boolean
}

export interface FinderQueueReviewColumn {
  lane: FinderQueueReviewLane
  label: string
  items: FinderQueueReviewItem[]
  explicitCount: number
}

const sanitizeText = (value: unknown, maxLength = 1200) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const sanitizeLinks = (links: unknown) =>
  (Array.isArray(links) ? links : [])
    .map((link) => sanitizeText(link, 400))
    .filter(Boolean)
    .filter((link, index, list) => list.indexOf(link) === index)

const clampScore = (score: unknown) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return undefined
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

const slugify = (value: string, fallback: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  return slug || fallback
}

const stableTextHash = (value: string) => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

const normalizeFieldLabel = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const parseMaybeUrl = (value: string) => {
  try {
    const url = new URL(value)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url
  } catch {
    return null
  }
}

const splitDelimitedLine = (line: string) => {
  const delimiter = line.includes('\t') ? '\t' : ','
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())

  return values
}

const normalizeJob = (draft: FinderSearchJobDraft): FinderSearchJobDraft => {
  const label = sanitizeText(draft.label, 160)
  const query = sanitizeText(draft.query, 1200)

  if (!label || !query) {
    throw new Error('Finder search job requires label and query.')
  }

  return {
    kind: draft.kind,
    label,
    query,
    goal: sanitizeText(draft.goal),
    notes: sanitizeText(draft.notes)
  }
}

export const createFinderSearchJob = (
  draft: FinderSearchJobDraft,
  options: { id: string; now: string; status?: FinderSearchJobStatus }
): FinderSearchJob => {
  const normalized = normalizeJob(draft)
  const status = options.status ?? 'draft'

  return {
    version: 1,
    id: options.id,
    ...normalized,
    status,
    createdAt: options.now,
    updatedAt: options.now
  }
}

export const updateFinderSearchJobStatus = (
  job: FinderSearchJob,
  status: FinderSearchJobStatus,
  now: string
): FinderSearchJob => ({
  ...job,
  status,
  updatedAt: now
})

const normalizeCandidate = (
  candidate: FinderCandidateResultDraft,
  kind: CounterpartyContextPackKind
): FinderCandidateResultDraft & { kind: CounterpartyContextPackKind } => {
  const sourceId = sanitizeText(candidate.sourceId, 240)
  const partnerName = sanitizeText(candidate.partnerName, 240)
  const title = sanitizeText(candidate.title, 240)
  const summary = sanitizeText(candidate.summary, 1200)

  if (!sourceId || !partnerName || !title || !summary) {
    throw new Error(
      'Finder candidate result requires sourceId, partnerName, title and summary.'
    )
  }

  return {
    kind,
    sourceId,
    partnerName,
    title,
    summary,
    context: sanitizeText(candidate.context, 2000),
    links: sanitizeLinks(candidate.links),
    score: clampScore(candidate.score),
    fitScore: clampScore(candidate.fitScore),
    whyRelevant: sanitizeText(candidate.whyRelevant, 1200),
    missingInfo: sanitizeText(candidate.missingInfo, 1200),
    nextAction: sanitizeText(candidate.nextAction, 1200),
    ...(candidate.parserPack ? { parserPack: candidate.parserPack } : {})
  }
}

export const createFinderCandidateResult = (
  job: FinderSearchJob,
  candidate: FinderCandidateResultDraft,
  options: { id: string; now: string }
): FinderCandidateResult => {
  const normalized = normalizeCandidate(candidate, job.kind)

  return {
    version: 1,
    id: options.id,
    jobId: job.id,
    kind: normalized.kind,
    sourceId: normalized.sourceId,
    partnerName: normalized.partnerName,
    title: normalized.title,
    summary: normalized.summary,
    context: normalized.context,
    links: normalized.links,
    score: normalized.score,
    fitScore: normalized.fitScore,
    whyRelevant: normalized.whyRelevant,
    missingInfo: normalized.missingInfo,
    nextAction: normalized.nextAction,
    status: 'ready',
    decision: {
      state: 'auto',
      updatedAt: options.now
    },
    createdAt: options.now,
    ...(normalized.parserPack ? { parserPack: normalized.parserPack } : {})
  }
}

const buildFinderResultContext = (result: FinderCandidateResult) =>
  [
    result.context,
    result.fitScore === undefined ? '' : `Fit score: ${result.fitScore}/100`,
    result.whyRelevant ? `Why relevant: ${result.whyRelevant}` : '',
    result.missingInfo ? `Missing info: ${result.missingInfo}` : '',
    result.nextAction ? `Next action: ${result.nextAction}` : ''
  ]
    .map((line) => line?.trim() ?? '')
    .filter(Boolean)
    .join('\n')

export const createContextPackDraftFromFinderResult = (
  result: FinderCandidateResult
): CounterpartyContextPackDraft => ({
  sourceId: result.sourceId,
  kind: result.kind,
  partnerName: result.partnerName,
  title: result.title,
  summary: result.summary,
  context: buildFinderResultContext(result),
  links: result.links,
  selected: true,
  ...(result.parserPack ? { parserPack: result.parserPack } : {})
})

export type FinderRunnerPayloadError = {
  index?: number
  reason: string
}

export type FinderRunnerPayloadPreviewCandidate = {
  draft: FinderCandidateResultDraft
  index: number
}

export type FinderRunnerPayloadPreviewResult = {
  requestedCount: number
  validCount: number
  jobDraft: FinderSearchJobDraft | null
  candidates: FinderRunnerPayloadPreviewCandidate[]
  errors: FinderRunnerPayloadError[]
}

export type FinderRunnerPayloadRecords = {
  job: FinderSearchJob
  results: FinderCandidateResult[]
  errors: FinderRunnerPayloadError[]
}

const parseJsonObject = (text: string): Record<string, unknown> => {
  const payload = JSON.parse(text) as unknown

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Finder runner payload must be a JSON object.')
  }

  return payload as Record<string, unknown>
}

export const parseFinderRunnerPayloadText = (
  text: string
): FinderRunnerPayloadPreviewResult => {
  const payload = parseJsonObject(text)
  const errors: FinderRunnerPayloadError[] = []
  let jobDraft: FinderSearchJobDraft | null = null

  try {
    jobDraft = normalizeJob(
      (payload.job ?? {}) as FinderSearchJobDraft
    )
  } catch (error) {
    errors.push({
      reason:
        error instanceof Error
          ? error.message
          : 'Finder runner payload requires a valid job.'
    })
  }

  const rawResults = Array.isArray(payload.results) ? payload.results : []
  if (!Array.isArray(payload.results)) {
    errors.push({
      reason: 'Finder runner payload requires results as an array.'
    })
  }

  const candidates: FinderRunnerPayloadPreviewCandidate[] = []

  if (jobDraft) {
    rawResults.forEach((rawCandidate, index) => {
      try {
        const normalized = normalizeCandidate(
          rawCandidate as FinderCandidateResultDraft,
          jobDraft.kind
        )

        candidates.push({
          index,
          draft: {
            sourceId: normalized.sourceId,
            partnerName: normalized.partnerName,
            title: normalized.title,
            summary: normalized.summary,
            context: normalized.context,
            links: normalized.links,
            score: normalized.score,
            fitScore: normalized.fitScore,
            whyRelevant: normalized.whyRelevant,
            missingInfo: normalized.missingInfo,
            nextAction: normalized.nextAction
          }
        })
      } catch (error) {
        errors.push({
          index,
          reason:
            error instanceof Error
              ? error.message
              : 'Invalid finder runner candidate.'
        })
      }
    })
  }

  return {
    requestedCount: rawResults.length,
    validCount: candidates.length,
    jobDraft,
    candidates,
    errors
  }
}

export const createFinderRecordsFromRunnerPayload = (
  text: string,
  options: {
    jobId: string
    resultId: (index: number) => string
    now: string
  }
): FinderRunnerPayloadRecords => {
  const preview = parseFinderRunnerPayloadText(text)

  if (!preview.jobDraft) {
    throw new Error(
      preview.errors[0]?.reason ?? 'Finder runner payload requires a valid job.'
    )
  }

  const job = createFinderSearchJob(preview.jobDraft, {
    id: options.jobId,
    now: options.now,
    status: preview.validCount > 0 ? 'ready' : 'draft'
  })
  const results = preview.candidates.map((candidate) =>
    createFinderCandidateResult(job, candidate.draft, {
      id: options.resultId(candidate.index),
      now: options.now
    })
  )

  return {
    job,
    results,
    errors: preview.errors
  }
}

const kindLabel: Record<CounterpartyContextPackKind, string> = {
  job: 'job',
  partner: 'partner',
  investor: 'investor',
  accelerator: 'accelerator',
  other: 'opportunity'
}

const defaultNextAction: Record<CounterpartyContextPackKind, string> = {
  job: 'Review vacancy evidence, then decide whether to import this as an interview pack.',
  partner: 'Review partner evidence, then decide whether to import this as a negotiation pack.',
  investor: 'Review thesis and portfolio evidence, then decide whether to import this as an investor pack.',
  accelerator: 'Review eligibility and deadlines, then decide whether to import this as an accelerator pack.',
  other: 'Review source evidence, then decide whether to import this as a session pack.'
}

export const createManualFinderRunnerCandidates = (
  job: FinderSearchJob,
  options: { maxResults?: number } = {}
): FinderCandidateResultDraft[] => {
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 3, 5))
  const jobSlug = slugify(job.id, 'job')
  const label = sanitizeText(job.label, 180)
  const query = sanitizeText(job.query, 300)
  const goal = sanitizeText(job.goal, 300)
  const notes = sanitizeText(job.notes, 300)
  const baseSummary = [
    `Manual/mock ${kindLabel[job.kind]} candidate generated from the saved Finder job.`,
    `Query to review: ${query}.`,
    goal ? `Goal: ${goal}.` : ''
  ]
    .filter(Boolean)
    .join(' ')

  return Array.from({ length: maxResults }, (_unused, index) => {
    const ordinal = index + 1
    const fitScore = Math.max(52, 84 - index * 11)

    return {
      sourceId: `coqpi:manual-runner:${job.kind}:${jobSlug}:${ordinal}`,
      partnerName: `Manual ${kindLabel[job.kind]} target ${ordinal}`,
      title: `${label} candidate ${ordinal}`,
      summary: baseSummary,
      context: [
        'This is a bounded local placeholder, not an internet search result.',
        notes ? `Owner notes: ${notes}` : '',
        'Replace or enrich it with real source evidence before serious outreach.'
      ]
        .filter(Boolean)
        .join('\n'),
      links: [],
      score: fitScore,
      fitScore,
      whyRelevant: `Matches the local Finder query terms for "${query}". Requires manual evidence before use.`,
      missingInfo:
        'Real source link; verified contact or vacancy page; current fit evidence.',
      nextAction: defaultNextAction[job.kind]
    }
  })
}

export const summarizeManualFinderRunnerRun = (
  jobId: string,
  generatedCount: number,
  skippedDuplicateCount: number
): FinderRunnerRunSummary => ({
  jobId,
  mode: 'manual_mock',
  generatedCount,
  skippedDuplicateCount,
  reason:
    'Local manual/mock runner generated bounded candidate placeholders only; no web search, scraping, API call, or outbound action was performed.'
})

const splitOwnerPastedSourceEntries = (text: string) =>
  text
    .split(/\n{2,}/)
    .flatMap((block) => {
      const trimmed = block.trim()

      if (!trimmed) {
        return []
      }

      const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)

      const delimitedRows = lines.map(splitDelimitedLine)
      const header = delimitedRows[0] ?? []
      const normalizedHeader = header.map(normalizeFieldLabel)
      const looksLikeDelimitedTable =
        lines.length > 1 &&
        header.length > 1 &&
        delimitedRows
          .slice(1)
          .some((row) => row.filter(Boolean).length > 1) &&
        normalizedHeader.some((label) =>
          [
            'company',
            'name',
            'partner',
            'fund',
            'investor',
            'accelerator',
            'role',
            'title',
            'opportunity'
          ].includes(label)
        )

      if (looksLikeDelimitedTable) {
        return delimitedRows
          .slice(1)
          .map((row) =>
            row
              .map((value, index) => {
                const label = header[index]

                return label && value ? `${label}: ${value}` : ''
              })
              .filter(Boolean)
              .join('\n')
          )
          .filter(Boolean)
      }

      if (lines.length > 1 && lines.every((line) => parseMaybeUrl(line))) {
        return lines
      }

      return [trimmed]
    })
    .slice(0, 25)

const getFirstUrlFromText = (text: string) =>
  text
    .split(/\s+/)
    .map((part) => part.replace(/[),.;]+$/g, ''))
    .map(parseMaybeUrl)
    .find((url): url is URL => Boolean(url)) ?? null

const getAllUrlsFromText = (text: string) =>
  text
    .split(/\s+/)
    .map((part) => part.replace(/[),.;]+$/g, ''))
    .map(parseMaybeUrl)
    .filter((url): url is URL => Boolean(url))
    .map((url) => url.toString())
    .filter((url, index, list) => list.indexOf(url) === index)

const getEmailsFromText = (text: string) =>
  Array.from(
    text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    (match) => match[0]
  ).filter((email, index, list) => list.indexOf(email) === index)

const humanizeSlugText = (value: string) =>
  sanitizeText(
    value
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b[a-z]/g, (char) => char.toUpperCase()),
    180
  )

const normalizeSourceLine = (value: string) =>
  sanitizeText(
    value
      .replace(/^\s*(?:[>*•·▪◦‣\-–—]+\s*|\d+[.)]\s+)/, '')
      .replace(/\s+/g, ' '),
    240
  )

const getDeadlineFromText = (text: string) =>
  sanitizeText(
    text.match(
      /(?:(?:applications?|apply)(?:\s+(?:close|closing|by|before|date|on))?|deadline|closes?|closing(?:\s+date)?)\s*:?\s*(.+)$/i
    )?.[1] ?? '',
    180
  )

const getCompensationFromText = (text: string) =>
  sanitizeText(
    text.match(
      /(?:salary|compensation(?:\s*&\s*benefits)?|package|pay range|salary range)\s*:?\s*(.+)$/i
    )?.[1] ?? '',
    180
  )

const getRemotePolicyFromText = (text: string) =>
  sanitizeText(
    text.match(
      /(?:remote policy|work mode|working mode|remote|hybrid|on[- ]site)\s*:?\s*(.+)$/i
    )?.[1] ?? '',
    180
  )

const getContractTypeFromText = (text: string) =>
  sanitizeText(
    text.match(
      /(?:contract type|contract|employment type|job type)\s*:?\s*(.+)$/i
    )?.[1] ?? '',
    180
  )

const getNonUrlLines = (lines: string[]) =>
  lines.filter((line) => !parseMaybeUrl(line))

const inferEntityNameFromDomain = (url: URL | null) => {
  const domain = url?.hostname.replace(/^www\./, '') ?? ''

  if (!domain) {
    return ''
  }

  return humanizeSlugText(domain.split('.')[0] ?? domain)
}

const inferTitleFromUrl = (url: URL | null, kind: CounterpartyContextPackKind) => {
  if (!url) {
    return ''
  }

  const pathnameParts = url.pathname
    .split('/')
    .map((part) => sanitizeText(part))
    .filter(Boolean)
    .filter((part) => !/^(jobs?|careers?|opportunities?|apply|program|funds?)$/i.test(part))
  const leaf = pathnameParts[pathnameParts.length - 1] ?? ''
  const prettyLeaf = humanizeSlugText(leaf)

  if (!prettyLeaf) {
    return ''
  }

  if (kind === 'accelerator' && !/accelerator|program/i.test(prettyLeaf)) {
    return `${prettyLeaf} program`
  }

  return prettyLeaf
}

const parseLinkedInCompanyLocationLine = (line: string) => {
  const parts = line
    .split('·')
    .map((part) => normalizeSourceLine(part))
    .filter(Boolean)
  const company = parts[0] ?? ''
  const location = parts.find((part, index) => {
    if (index === 0) {
      return false
    }

    return /remote|france|paris|lyon|berlin|brussels|amsterdam|europe|uk|london|new york|san francisco/i.test(
      part
    )
  }) ?? ''

  return { company, location, parts }
}

const isLikelyJobRoleLine = (line: string) => {
  const normalized = normalizeSourceLine(line)

  if (!normalized || normalized.length > 120 || parseMaybeUrl(normalized)) {
    return false
  }

  return /manager|lead|director|head|owner|engineer|designer|product|marketing|operations|sales|analyst|researcher|developer|specialist|consultant/i.test(
    normalized
  )
}

const isLikelyCompanyLine = (line: string) => {
  const normalized = normalizeSourceLine(line)

  if (!normalized || normalized.length > 120 || parseMaybeUrl(normalized)) {
    return false
  }

  return !/apply|applications?|deadline|close|closing|full[- ]time|part[- ]time|contract|hybrid|remote|on[- ]site|salary|compensation|about the job|who should apply|selection criteria|program terms/i.test(
    normalized
  )
}

const extractOwnerSourceFields = (lines: string[]) => {
  const fields = new Map<string, string>()

  lines.forEach((line) => {
    const match = line.match(/^([A-Za-z][A-Za-z0-9 '&/,_-]{1,60})\s*:\s*(.+)$/)

    if (!match) {
      return
    }

    const key = normalizeFieldLabel(match[1])
    const value = normalizeSourceLine(match[2])

    if (value && !fields.has(key)) {
      fields.set(key, value)
    }
  })

  const firstOf = (aliases: string[]) =>
    aliases
      .map((alias) => fields.get(alias))
      .find((value): value is string => Boolean(value)) ?? ''

  const nonUrlLines = getNonUrlLines(lines)
  const bulletLine = nonUrlLines.find((line) => line.includes('·')) ?? ''
  const bulletParts = bulletLine
    .split('·')
    .map((part) => sanitizeText(part, 180))
    .filter(Boolean)
  const deadlineLine =
    nonUrlLines.find((line) =>
      /(?:applications?|apply|deadline|closes?|closing)\s+(?:close|by|date|on)?/i.test(
        line
      )
    ) ?? ''
  const inferredDeadline =
    getDeadlineFromText(deadlineLine)
  const compensationLine =
    nonUrlLines.find((line) =>
      /(?:salary|compensation|package|pay range|salary range)/i.test(line)
    ) ?? ''
  const inferredCompensation = getCompensationFromText(compensationLine)
  const remotePolicyLine =
    nonUrlLines.find((line) =>
      /(?:remote policy|work mode|working mode|hybrid|on[- ]site|remote)/i.test(line)
    ) ?? ''
  const inferredRemotePolicy = getRemotePolicyFromText(remotePolicyLine)
  const contractTypeLine =
    nonUrlLines.find((line) =>
      /(?:contract type|employment type|job type|cdi|cdd|permanent|contractor)/i.test(
        line
      )
    ) ?? ''
  const inferredContractType = getContractTypeFromText(contractTypeLine) || (
    /\b(CDI|CDD)\b/i.test(contractTypeLine)
      ? sanitizeText(contractTypeLine.match(/\b(CDI|CDD)\b/i)?.[1] ?? '', 80)
      : ''
  )
  const inferredLocation =
    nonUrlLines.find(
      (line) =>
        /(?:remote|france|europe|paris|lyon|london|berlin|brussels|amsterdam|new york|san francisco)/i.test(
          line
        ) && !/applications?|deadline|closing|reposted|applicants?/i.test(line)
    ) ?? ''
  const inferredEntityName =
    bulletParts.length > 1
      ? bulletParts[0]
      : nonUrlLines.find((line) =>
          /(?:accelerator|incubator|fund|capital|ventures|labs|partner|partners|company)/i.test(
            line
          )
        ) ?? ''
  const inferredRelevance =
    nonUrlLines.find(
      (line) =>
        line !== inferredEntityName &&
        /(?:agri|agro|commodity|climate|infrastructure|startup|ecosystem|product)/i.test(
          line
        )
    ) ?? ''

  const company = firstOf([
    'company',
    'company name',
    'name',
    'employer',
    'organization',
    'organisation',
    'partner',
    'partner name',
    'fund',
    'fund name',
    'accelerator',
    'investor',
    'fund manager',
    'organization name',
    'programme',
    'program name'
  ]) || inferredEntityName
  const role = firstOf([
    'role',
    'title',
    'role title',
    'position',
    'job title',
    'type',
    'opportunity',
    'focus',
    'program',
    'program title',
    'opportunity title',
    'position title',
    'sector focus',
    'industry focus',
    'ideal collaboration',
    'what we back'
  ]) || (bulletParts.length > 1 ? nonUrlLines[0] : '')
  const country = firstOf(['country'])
  const city = firstOf(['city'])
  const location =
    firstOf([
      'location',
      'place',
      'region',
      'regions served',
      'geo',
      'geography',
      'where we invest'
    ]) ||
    firstOf(['hq', 'headquarters', 'based in']) ||
    firstOf(['geography mandate', 'market', 'coverage']) ||
    (bulletParts.length > 1 ? bulletParts[1] : '') ||
    [city, country].filter(Boolean).join(', ')
  const contact = firstOf([
    'contact',
    'contact us',
    'email',
    'recruiter',
    'contact person',
    'contact email',
    'program lead',
    'partner lead',
    'founder'
  ])
  const deadline = firstOf([
    'deadline',
    'apply by',
    'closing date',
    'date',
    'applications close',
    'application deadline',
    'deadline to apply'
  ]) || inferredDeadline
  const whyRelevant = firstOf([
    'why relevant',
    'relevance',
    'fit',
    'why',
    'match',
    'why this role matters',
    'why this matters'
  ]) || inferredRelevance
  const missingInfo = firstOf([
    'missing info',
    'missing',
    'unknowns',
    'questions',
    'to verify'
  ])
  const nextAction = firstOf(['next action', 'action', 'todo', 'follow up'])
  const explicitLink = firstOf(['url', 'link', 'website', 'source'])
  const stage = firstOf([
    'stage',
    'stages',
    'investment stage',
    'stage preference',
    'round',
    'program stage'
  ])
  const ticketSize = firstOf([
    'ticket size',
    'check size',
    'ticket',
    'investment size',
    'cheque size',
    'initial check',
    'first check',
    'first cheque'
  ])
  const programTerms = firstOf([
    'program terms',
    'terms',
    'equity',
    'fees',
    'cohort terms',
    'equity terms',
    'what you get'
  ])
  const selectionCriteria = firstOf([
    'selection criteria',
    'criteria',
    'admission criteria',
    'who should apply',
    'eligibility',
    'ideal startup',
    'who it s for'
  ])
  const focusArea = firstOf([
    'sector',
    'focus',
    'investment focus',
    'focus area',
    'sector focus',
    'industry',
    'vertical',
    'mandate',
    'what we back'
  ])
  const thesis = firstOf([
    'thesis',
    'focus thesis',
    'investment thesis',
    'thesis fit',
    'notes',
    'investment notes',
    'what we back'
  ])
  const compensation = firstOf([
    'compensation',
    'compensation benefits',
    'salary',
    'salary range',
    'package',
    'pay range'
  ]) || inferredCompensation
  const remotePolicy = firstOf([
    'remote policy',
    'work mode',
    'working mode',
    'remote',
    'hybrid'
  ]) || inferredRemotePolicy
  const contractType = firstOf([
    'contract type',
    'employment type',
    'job type',
    'contract',
    'type'
  ]) || inferredContractType
  const cohort = firstOf(['cohort', 'batch', 'program', 'program name'])
  const inferredProgramTitle =
    cohort ||
    role ||
    (lines.some((line) => /accelerator|incubator|program/i.test(line))
      ? 'Accelerator program'
      : '')

  return {
    company,
    role: inferredProgramTitle,
    location: location || inferredLocation,
    contact,
    deadline,
    whyRelevant,
    missingInfo,
    nextAction,
    explicitLink,
    stage,
    ticketSize,
    programTerms,
    selectionCriteria,
    focusArea,
    thesis,
    compensation,
    remotePolicy,
    contractType,
    cohort
  }
}

type OwnerSourceFields = ReturnType<typeof extractOwnerSourceFields>

const detectOwnerSourceFormat = ({
  job,
  lines,
  fields,
  firstUrl
}: {
  job: FinderSearchJob
  lines: string[]
  fields: OwnerSourceFields
  firstUrl: URL | null
}): FinderSourceAdapterDetectedFormat => {
  const hasStructuredFields = lines.some(
    (line) =>
      !parseMaybeUrl(line) &&
      /^([A-Za-z][A-Za-z0-9 '&/,_-]{1,60})\s*:\s*(.+)$/.test(line)
  )

  if (firstUrl && lines.length === 1) {
    return 'url'
  }

  if (
    lines.some((line) => /linkedin\.com\/jobs\//i.test(line)) ||
    (lines.length >= 2 &&
      lines[1].includes('·') &&
      /full[- ]time|part[- ]time|reposted|applicants?|mid-senior|entry level/i.test(
        lines.slice(0, 3).join(' ')
      ))
  ) {
    return 'linkedin_job'
  }

  if (
    job.kind === 'job' &&
    lines.length >= 2 &&
    isLikelyJobRoleLine(lines[0] ?? '') &&
    isLikelyCompanyLine(lines[1] ?? '')
  ) {
    return 'linkedin_job'
  }

  if (
    /accelerator|incubator|program/i.test(lines.join('\n')) ||
    Boolean(fields.programTerms || fields.selectionCriteria)
  ) {
    return 'accelerator_snippet'
  }

  if (
    hasStructuredFields &&
    (job.kind === 'investor' ||
      Boolean(
        fields.company &&
          (fields.ticketSize ||
            fields.stage ||
            fields.thesis ||
            /fund|capital|ventures|angel|investor/i.test(
              `${fields.company} ${fields.role} ${fields.whyRelevant}`
            ))
      ))
  ) {
    return 'investor_list'
  }

  if (
    hasStructuredFields &&
    (job.kind === 'partner' ||
      Boolean(
        fields.company &&
          (/partner|distribution|pilot|implementation|integration/i.test(
            `${fields.company} ${fields.role} ${fields.whyRelevant}`
          ) ||
            /partner|opportunity/i.test(fields.role))
      ))
  ) {
    return 'partner_export'
  }

  if (
    !hasStructuredFields &&
    lines.some((line) =>
      /fund:|focus:|geography:|investor:|website:|contact:|ticket size:|stage:/i.test(
        line
      )
    )
  ) {
    return 'csv_row'
  }

  if (hasStructuredFields) {
    return 'structured_fields'
  }

  return 'freeform_text'
}

const buildOwnerSourceParsedView = ({
  job,
  index,
  lines,
  headline,
  fields,
  firstUrl,
  contact
}: {
  job: FinderSearchJob
  index: number
  lines: string[]
  headline: string
  fields: OwnerSourceFields
  firstUrl: URL | null
  contact: string
}) => {
  const detectedFormat = detectOwnerSourceFormat({
    job,
    lines,
    fields,
    firstUrl
  })
  const nonUrlLines = getNonUrlLines(lines)
  const body = nonUrlLines.slice(1).join(' ').trim()
  const inferredEntityName = inferEntityNameFromDomain(firstUrl)
  const inferredTitleFromUrl = inferTitleFromUrl(firstUrl, job.kind)
  const defaultPartnerName =
    fields.company ||
    inferredEntityName ||
    headline.split(/[|,–-]/)[0]?.trim() ||
    `Source candidate ${index + 1}`
  const defaultTitle =
    fields.role ||
    inferredTitleFromUrl ||
    (firstUrl && headline && !parseMaybeUrl(headline)
      ? headline
      : `${job.label} source ${index + 1}`)
  const defaultLocation = fields.location
  const defaultDeadline = fields.deadline
  const defaultRelevance =
    fields.whyRelevant ||
    `Owner pasted this ${job.kind} source for the "${job.label}" Finder job; evidence should be reviewed before outreach.`
  const parserEvidence: string[] = []

  if (detectedFormat === 'linkedin_job') {
    const companyLine = lines.find((line) => line.includes('·')) ?? lines[1] ?? ''
    const parsed = parseLinkedInCompanyLocationLine(companyLine)
    const role =
      fields.role ||
      sanitizeText(nonUrlLines[0] ?? headline, 180) ||
      inferredTitleFromUrl ||
      defaultTitle
    const plainLocation =
      fields.location ||
      nonUrlLines.find(
        (line, index) =>
          index > 0 &&
          /remote|france|paris|lyon|berlin|brussels|amsterdam|europe|uk|london|new york|san francisco|hybrid/i.test(
            line
          )
      ) ||
      ''

    return {
      detectedFormat,
      parserPack: inferFinderParserPackV1({
        jobKind: job.kind,
        detectedFormat,
        text: [role, parsed.company, parsed.location, body].filter(Boolean).join(' ')
      }),
      partnerName:
        parsed.company ||
        sanitizeText(nonUrlLines[1] ?? '', 180) ||
        defaultPartnerName,
      title: role,
      location: fields.location || parsed.location || plainLocation || defaultLocation,
      deadline: defaultDeadline,
      whyRelevant:
        body ||
        fields.whyRelevant ||
        `LinkedIn-style job snippet for "${role}" under the "${job.label}" search.`,
      body,
      parserEvidence: [
        companyLine ? `LinkedIn line: ${sanitizeText(companyLine, 220)}` : ''
      ].filter(Boolean)
    }
  }

  if (detectedFormat === 'accelerator_snippet') {
    const entityLine =
      ((fields.company === inferredEntityName || !fields.company) &&
      sanitizeText(nonUrlLines[0] ?? '', 220)
        ? sanitizeText(nonUrlLines[0] ?? '', 220)
        : fields.company) ||
      nonUrlLines.find((line) => /accelerator|incubator/i.test(line)) ||
      defaultPartnerName
    const deadlineLine =
      fields.deadline ||
      nonUrlLines.find((line) => /applications?|deadline|closing|apply/i.test(line)) ||
      ''
    const relevanceLine =
      fields.whyRelevant ||
      nonUrlLines.find(
        (line) =>
          line !== entityLine &&
          line !== deadlineLine &&
          /for |climate|agri|agro|startup|commodity|infrastructure|ecosystem/i.test(
            line
          )
      ) ||
      body

    return {
      detectedFormat,
      parserPack: inferFinderParserPackV1({
        jobKind: job.kind,
        detectedFormat,
        text: [entityLine, relevanceLine, body].filter(Boolean).join(' ')
      }),
      partnerName: sanitizeText(entityLine, 220) || defaultPartnerName,
      title:
        fields.cohort ||
        fields.role ||
        inferredTitleFromUrl ||
        'Accelerator program',
      location:
        fields.location ||
        nonUrlLines.find(
          (line) =>
            /remote|paris|lyon|berlin|brussels|amsterdam|france|europe/i.test(line)
        ) ||
        defaultLocation,
      deadline: fields.deadline || getDeadlineFromText(deadlineLine) || defaultDeadline,
      whyRelevant:
        sanitizeText(relevanceLine, 420) ||
        defaultRelevance,
      body,
      parserEvidence: [
        fields.cohort ? `Cohort: ${fields.cohort}` : '',
        fields.programTerms ? `Program terms: ${fields.programTerms}` : '',
        fields.selectionCriteria
          ? `Selection criteria: ${fields.selectionCriteria}`
          : ''
      ].filter(Boolean)
    }
  }

  if (detectedFormat === 'investor_list') {
    const partnerName = fields.company || defaultPartnerName
    const title =
      fields.role ||
      fields.focusArea ||
      inferredTitleFromUrl ||
      'Investor thesis match'
    const location =
      fields.location || defaultLocation
    const enrichedInvestorRationale = [
      fields.role || fields.focusArea,
      fields.thesis,
      fields.stage,
      fields.ticketSize
    ]
      .filter(Boolean)
      .join('. ')
    const whyRelevant =
      enrichedInvestorRationale ||
      fields.whyRelevant ||
      body ||
      defaultRelevance

    parserEvidence.push(
      fields.stage ? `Stage: ${fields.stage}` : '',
      fields.ticketSize ? `Ticket size: ${fields.ticketSize}` : '',
      fields.focusArea ? `Focus: ${fields.focusArea}` : '',
      fields.thesis ? `Thesis: ${fields.thesis}` : ''
    )

    return {
      detectedFormat,
      parserPack: inferFinderParserPackV1({
        jobKind: job.kind,
        detectedFormat,
        text: [partnerName, title, whyRelevant].filter(Boolean).join(' ')
      }),
      partnerName,
      title,
      location,
      deadline: defaultDeadline,
      whyRelevant,
      body,
      parserEvidence: parserEvidence.filter(Boolean)
    }
  }

  if (detectedFormat === 'partner_export') {
    const partnerName = fields.company || defaultPartnerName
    const title =
      fields.role ||
      inferredTitleFromUrl ||
      'Partnership opportunity'

    return {
      detectedFormat,
      parserPack: inferFinderParserPackV1({
        jobKind: job.kind,
        detectedFormat,
        text: [partnerName, title, body, contact].filter(Boolean).join(' ')
      }),
      partnerName,
      title,
      location: fields.location || defaultLocation,
      deadline: defaultDeadline,
      whyRelevant:
        fields.whyRelevant ||
        body ||
        `Partner export entry selected for "${job.label}".`,
      body,
      parserEvidence: [
        contact ? `Contact: ${contact}` : '',
        fields.missingInfo ? `Known gap: ${fields.missingInfo}` : '',
        fields.stage ? `Stage: ${fields.stage}` : ''
      ].filter(Boolean)
    }
  }

  if (detectedFormat === 'url') {
    return {
      detectedFormat,
      parserPack: inferFinderParserPackV1({
        jobKind: job.kind,
        detectedFormat,
        text: [defaultPartnerName, defaultTitle, headline, firstUrl?.toString() ?? ''].filter(Boolean).join(' ')
      }),
      partnerName: defaultPartnerName,
      title: defaultTitle,
      location: defaultLocation,
      deadline: defaultDeadline,
      whyRelevant:
        fields.whyRelevant ||
        `Owner pasted the source URL directly for the "${job.label}" Finder job.`,
      body,
      parserEvidence: firstUrl ? [`Source URL path: ${firstUrl.pathname}`] : []
    }
  }

  return {
    detectedFormat,
    parserPack: inferFinderParserPackV1({
      jobKind: job.kind,
      detectedFormat,
      text: [defaultPartnerName, defaultTitle, body, headline].filter(Boolean).join(' ')
    }),
    partnerName: defaultPartnerName,
    title: defaultTitle,
    location: defaultLocation,
    deadline: defaultDeadline,
    whyRelevant: defaultRelevance,
    body,
    parserEvidence
  }
}

const getScenarioMissingInfo = (
  kind: CounterpartyContextPackKind,
  evidence: {
    links: string[]
    contact: string
    deadline: string
    location: string
    whyRelevant: string
    compensation: string
    remotePolicy: string
    contractType: string
  }
) => {
  const common = [
    evidence.links.length > 0 ? '' : 'source URL',
    evidence.contact ? '' : 'contact',
    'current status'
  ]

  const byKind: Record<CounterpartyContextPackKind, string[]> = {
    job: [
      evidence.deadline ? '' : 'application deadline',
      evidence.compensation ? '' : 'salary range',
      evidence.remotePolicy ? '' : 'remote policy',
      evidence.contractType ? '' : 'contract type',
      'interview process',
      evidence.whyRelevant ? '' : 'fit to your product/agtech experience'
    ],
    partner: [
      'decision maker',
      'pilot budget',
      'implementation timeline',
      evidence.location ? '' : 'operating geography',
      evidence.whyRelevant ? '' : 'specific partnership angle'
    ],
    investor: [
      'ticket size',
      'investment stage',
      'portfolio fit',
      evidence.location ? '' : 'geography mandate',
      evidence.whyRelevant ? '' : 'thesis match'
    ],
    accelerator: [
      evidence.deadline ? '' : 'application deadline',
      'program terms',
      'equity or fees',
      'selection criteria',
      evidence.whyRelevant ? '' : 'program fit'
    ],
    other: [
      'decision maker',
      'relevance to current goal',
      'expected next step'
    ]
  }

  return [...common, ...byKind[kind]].filter(Boolean).join(', ')
}

const getScenarioNextAction = (
  kind: CounterpartyContextPackKind,
  contact: string
) => {
  const contactSuffix = contact ? ` to ${contact}` : ''
  const byKind: Record<CounterpartyContextPackKind, string> = {
    job: `Prepare tailored CV/interview pack${contactSuffix}, then verify role details before outreach.`,
    partner: `Prepare a partner intro${contactSuffix} with pilot angle, key questions, and expected next step.`,
    investor: `Prepare an investor intro${contactSuffix} with thesis fit, traction questions, and ticket-size check.`,
    accelerator:
      'Prepare an application/intro pack with deadline, program fit, and selection criteria questions.',
    other: `Prepare a short intro${contactSuffix}, then verify source and next step.`
  }

  return byKind[kind]
}

const scoreOwnerSourceCandidate = (
  job: FinderSearchJob,
  evidence: {
    links: string[]
    contact: string
    deadline: string
    location: string
    partnerName: string
    title: string
    whyRelevant: string
  }
) => {
  const points = [
    evidence.partnerName ? 10 : 0,
    evidence.title ? 10 : 0,
    evidence.links.length > 0 ? 10 : 0,
    evidence.contact ? 8 : 0,
    evidence.location ? 7 : 0,
    evidence.deadline ? 5 : 0,
    evidence.whyRelevant ? 12 : 0
  ].reduce((total, value) => total + value, 0)
  const scenarioBoost: Record<CounterpartyContextPackKind, number> = {
    job: evidence.title && /product|manager|lead|director|head/i.test(evidence.title)
      ? 8
      : 3,
    partner: /partner|pilot|distribution|implementation|integration/i.test(
      `${evidence.title} ${evidence.whyRelevant}`
    )
      ? 8
      : 3,
    investor: /fund|capital|ventures|seed|invest/i.test(
      `${evidence.partnerName} ${evidence.title} ${evidence.whyRelevant}`
    )
      ? 8
      : 3,
    accelerator: /accelerator|incubator|program|application/i.test(
      `${evidence.partnerName} ${evidence.title}`
    )
      ? 8
      : 3,
    other: 3
  }
  const fitScore = Math.max(50, Math.min(94, 42 + points + scenarioBoost[job.kind]))

  return {
    score: Math.min(96, fitScore + (evidence.contact ? 2 : 0)),
    fitScore
  }
}

export const createFinderCandidatesFromOwnerPastedSource = (
  job: FinderSearchJob,
  sourceText: string
): {
  requestedCount: number
  candidates: Array<
    FinderCandidateResultDraft & {
      detectedFormat: FinderSourceAdapterDetectedFormat
    }
  >
  errors: { index?: number; reason: string }[]
} => {
  const entries = splitOwnerPastedSourceEntries(sourceText)
  const candidates: Array<
    FinderCandidateResultDraft & {
      detectedFormat: FinderSourceAdapterDetectedFormat
    }
  > = []
  const errors: { index?: number; reason: string }[] = []
  const jobSlug = slugify(job.id, 'job')

  entries.forEach((entry, index) => {
    const normalizedEntry = sanitizeText(entry, 5000)
    const firstUrl = getFirstUrlFromText(normalizedEntry)
    const lines = normalizedEntry
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const headline = sanitizeText(lines[0] ?? '', 180)
    const fields = extractOwnerSourceFields(lines)

    if (!normalizedEntry || (!headline && !firstUrl)) {
      errors.push({ index, reason: 'Owner pasted source entry is empty.' })
      return
    }

    const allLinks = [
      ...getAllUrlsFromText(normalizedEntry),
      fields.explicitLink
        ? parseMaybeUrl(fields.explicitLink)?.toString() ?? fields.explicitLink
        : ''
    ].filter(Boolean)
    const links = sanitizeLinks(allLinks)
    const contactEmails = getEmailsFromText(
      [normalizedEntry, fields.contact].filter(Boolean).join('\n')
    )
    const contact = fields.contact || contactEmails.join(', ')
    const sourceHash = stableTextHash(`${job.id}\n${normalizedEntry}`)
    const parsed = buildOwnerSourceParsedView({
      job,
      index,
      lines,
      headline,
      fields,
      firstUrl,
      contact
    })
    const summary = [
      `Owner-provided source for ${job.label}.`,
      parsed.partnerName ? `Company/partner: ${parsed.partnerName}.` : '',
      parsed.title ? `Role/opportunity: ${parsed.title}.` : '',
      parsed.location ? `Location: ${parsed.location}.` : '',
      fields.compensation ? `Compensation: ${fields.compensation}.` : '',
      fields.remotePolicy ? `Remote policy: ${fields.remotePolicy}.` : '',
      fields.contractType ? `Contract type: ${fields.contractType}.` : '',
      contact ? `Contact: ${contact}.` : '',
      parsed.deadline ? `Deadline: ${parsed.deadline}.` : '',
      headline && !parseMaybeUrl(headline) ? `Headline: ${headline}.` : '',
      parsed.body ? `Excerpt: ${sanitizeText(parsed.body, 420)}.` : '',
      links.length > 0 ? `URL: ${links[0]}` : ''
    ]
      .filter(Boolean)
      .join(' ')
    const missingInfo =
      fields.missingInfo ||
      getScenarioMissingInfo(job.kind, {
        links,
        contact,
        deadline: parsed.deadline,
        location: parsed.location,
        whyRelevant: parsed.whyRelevant,
        compensation: fields.compensation,
        remotePolicy: fields.remotePolicy,
        contractType: fields.contractType
      })
    const nextAction =
      fields.nextAction ||
      getScenarioNextAction(job.kind, contact)
    const relevance = parsed.whyRelevant
    const scores = scoreOwnerSourceCandidate(job, {
      links,
      contact,
      deadline: parsed.deadline,
      location: parsed.location,
      partnerName: parsed.partnerName,
      title: parsed.title,
      whyRelevant: relevance
    })

    candidates.push({
      detectedFormat: parsed.detectedFormat,
      parserPack: parsed.parserPack,
      sourceId: `coqpi:source-adapter:${job.kind}:${jobSlug}:${sourceHash}`,
      partnerName: parsed.partnerName,
      title: parsed.title,
      summary,
      context: [
        'Imported through owner_paste_v0 from owner-provided URL/text/export.',
        `Detected source format: ${parsed.detectedFormat}.`,
        `Parser pack: ${parsed.parserPack}.`,
        'No web fetch, scraping, search API, scheduler, or outbound action was performed.',
        `Original job query: ${job.query}.`,
        job.goal ? `Job goal: ${job.goal}.` : '',
        parsed.location ? `Extracted location: ${parsed.location}.` : '',
        fields.compensation ? `Compensation: ${fields.compensation}.` : '',
        fields.remotePolicy ? `Remote policy: ${fields.remotePolicy}.` : '',
        fields.contractType ? `Contract type: ${fields.contractType}.` : '',
        contact ? `Extracted contact: ${contact}.` : '',
        parsed.deadline ? `Extracted deadline: ${parsed.deadline}.` : '',
        ...parsed.parserEvidence,
        parsed.body ? `Owner pasted excerpt: ${sanitizeText(parsed.body, 900)}` : ''
      ]
        .filter(Boolean)
        .join('\n'),
      links,
      score: scores.score,
      fitScore: scores.fitScore,
      whyRelevant: relevance,
      missingInfo: missingInfo
        ? `Verify ${missingInfo} before outreach.`
        : 'Verify current status before outreach.',
      nextAction
    })
  })

  return {
    requestedCount: entries.length,
    candidates,
    errors
  }
}

export const summarizeFinderSourceAdapterRun = (
  jobId: string,
  requestedCount: number,
  generatedCount: number,
  skippedDuplicateCount: number,
  errors: { index?: number; reason: string }[],
  mode: FinderSourceAdapterMode = 'owner_paste_v0'
): FinderSourceAdapterRunSummary => ({
  jobId,
  mode,
  requestedCount,
  generatedCount,
  skippedDuplicateCount,
  errors,
  reason:
    mode === 'public_page_v1'
      ? 'One explicit public URL was fetched and normalized into preview/import candidates; no scheduler, batch crawl, browser automation, auth session, search API, or outbound action was performed.'
      : mode === 'manual_complex_page_v1'
        ? 'One explicit public URL plus owner-reviewed page notes were normalized into preview/import candidates; no scheduler, browser automation, auth session, search API, or outbound action was performed.'
      : 'Owner-pasted URL/text/export was normalized locally; no web fetch, scraping, search API, scheduler, or outbound action was performed.'
})

export const getFinderSourceAdapterDetectedFormatSummary = (
  candidates: Array<{ detectedFormat: FinderSourceAdapterDetectedFormat }>
) =>
  Array.from(
    candidates.reduce(
      (counts, candidate) =>
        counts.set(
          candidate.detectedFormat,
          (counts.get(candidate.detectedFormat) ?? 0) + 1
        ),
      new Map<FinderSourceAdapterDetectedFormat, number>()
    )
  ).map(([format, count]) => ({ format, count }))

export const getFinderSearchStatusCounts = (
  jobs: readonly FinderSearchJob[]
): FinderSearchStatusCounts =>
  jobs.reduce<FinderSearchStatusCounts>(
    (counts, job) => ({
      ...counts,
      [job.status]: counts[job.status] + 1
    }),
    { draft: 0, ready: 0, imported: 0, rejected: 0 }
  )

const candidateStatusPriority: Record<FinderCandidateResult['status'], number> = {
  ready: 0,
  imported: 1,
  rejected: 2
}

const getFitScoreForDesc = (result: FinderCandidateResult) =>
  result.fitScore ?? -1

const getFitScoreForAsc = (result: FinderCandidateResult) =>
  result.fitScore ?? 101

const compareByCreatedAtDesc = (
  left: FinderCandidateResult,
  right: FinderCandidateResult
) => right.createdAt.localeCompare(left.createdAt)

const compareByStatusPriority = (
  left: FinderCandidateResult,
  right: FinderCandidateResult
) =>
  candidateStatusPriority[left.status] - candidateStatusPriority[right.status]

const decisionRecommendationPriority: Record<
  FinderDecisionQueueItem['recommendation'],
  number
> = {
  import: 0,
  hold: 1,
  reject: 2
}

const decisionPriorityOrder: Record<FinderDecisionQueueItem['priority'], number> = {
  now: 0,
  soon: 1,
  later: 2
}

const buildExplicitFinderDecision = (
  state: FinderCandidateDecisionState,
  reason: string | undefined
): FinderDecisionQueueItem | null => {
  if (state === 'import_now') {
    return {
      recommendation: 'import',
      priority: 'now',
      score: 95,
      summary: reason?.trim()
        ? `Marked for immediate import. ${reason.trim()}`
        : 'Marked for immediate import.',
      reasons: reason?.trim()
        ? [reason.trim(), 'owner marked import now']
        : ['owner marked import now']
    }
  }

  if (state === 'hold_later') {
    return {
      recommendation: 'hold',
      priority: 'later',
      score: 50,
      summary: reason?.trim()
        ? `Held for later. ${reason.trim()}`
        : 'Held for later review.',
      reasons: reason?.trim()
        ? [reason.trim(), 'owner marked hold for later']
        : ['owner marked hold for later']
    }
  }

  if (state === 'rejected') {
    return {
      recommendation: 'reject',
      priority: 'later',
      score: 10,
      summary: reason?.trim()
        ? `Rejected with reason. ${reason.trim()}`
        : 'Rejected by owner review.',
      reasons: reason?.trim()
        ? [reason.trim(), 'owner rejected candidate']
        : ['owner rejected candidate']
    }
  }

  return null
}

export const buildFinderDecisionQueueItem = (
  result: FinderCandidateResult
): FinderDecisionQueueItem => {
  const explicitDecision = buildExplicitFinderDecision(
    result.decision?.state ?? 'auto',
    result.decision?.reason
  )

  if (explicitDecision) {
    return explicitDecision
  }

  if (result.status === 'imported') {
    return {
      recommendation: 'hold',
      priority: 'later',
      score: 35,
      summary: 'Already imported. Keep for follow-up, not for first-pass queue.',
      reasons: ['already imported']
    }
  }

  if (result.status === 'rejected') {
    return {
      recommendation: 'reject',
      priority: 'later',
      score: 10,
      summary: 'Already rejected. Keep out of the active queue unless new evidence appears.',
      reasons: ['already rejected']
    }
  }

  const fitScore = result.fitScore ?? 0
  const hasWhyRelevant = Boolean(result.whyRelevant?.trim())
  const hasNextAction = Boolean(result.nextAction?.trim())
  const hasLinks = (result.links ?? []).length > 0
  const improvementCount = splitScoreImprovements(result.missingInfo ?? '').length
  const hasNamedTarget = Boolean(result.partnerName?.trim())
  const hasClearTitle = Boolean(result.title?.trim())
  const hasStrongEvidence =
    hasLinks && hasWhyRelevant && hasNextAction && hasNamedTarget && hasClearTitle
  const hasUsableEvidence =
    hasNamedTarget &&
    hasClearTitle &&
    (hasLinks || hasWhyRelevant || hasNextAction)

  const baseScore =
    fitScore +
    (hasLinks ? 8 : 0) +
    (hasWhyRelevant ? 6 : 0) +
    (hasNextAction ? 6 : 0) +
    (hasNamedTarget ? 4 : 0) +
    (hasClearTitle ? 4 : 0) -
    improvementCount * 4

  const reasons = [
    hasLinks ? 'source link present' : 'source link missing',
    hasWhyRelevant ? 'relevance rationale present' : 'relevance rationale missing',
    hasNextAction ? 'next action present' : 'next action missing',
    improvementCount > 0
      ? `${improvementCount} improvement point${improvementCount === 1 ? '' : 's'}`
      : 'no obvious improvement blockers'
  ]

  if (fitScore >= 80 && hasStrongEvidence) {
    return {
      recommendation: 'import',
      priority: 'now',
      score: Math.max(0, Math.min(100, Math.round(baseScore))),
      summary: 'Strong candidate. Import first and prepare outreach or session context now.',
      reasons
    }
  }

  if ((fitScore >= 68 && hasUsableEvidence) || (fitScore >= 75 && hasLinks)) {
    return {
      recommendation: 'hold',
      priority: 'soon',
      score: Math.max(0, Math.min(100, Math.round(baseScore - 8))),
      summary: 'Promising candidate. Fill a few weak fields before importing.',
      reasons
    }
  }

  if (fitScore >= 50 || hasUsableEvidence) {
    return {
      recommendation: 'hold',
      priority: 'later',
      score: Math.max(0, Math.min(100, Math.round(baseScore - 18))),
      summary: 'Keep for later review. More evidence is needed before import.',
      reasons
    }
  }

  return {
    recommendation: 'reject',
    priority: 'later',
    score: Math.max(0, Math.min(100, Math.round(baseScore - 30))),
    summary: 'Too weak for the active queue. Reject unless new evidence arrives.',
    reasons
  }
}

const hasDuplicateSourceKey = (
  result: FinderCandidateResult,
  sourceKeys: Set<string>
) =>
  sourceKeys.has(`${result.sourceId}::${result.kind}`) &&
  (result.sourceId.trim().length > 0 || result.kind.length > 0)

export const assessFinderQueueCandidateImport = (
  result: FinderCandidateResult,
  existingSourceKeys: ReadonlySet<string> = new Set()
): FinderQueueCandidateImportStatus => {
  const qualityReview = reviewFinderPreviewCandidateQuality(result)
  const decision = buildFinderDecisionQueueItem(result)

  if (result.status !== 'ready') {
    return {
      result,
      canImport: false,
      reason: 'not-ready',
      decision,
      qualityReview
    }
  }

  if (hasDuplicateSourceKey(result, new Set(existingSourceKeys))) {
    return {
      result,
      canImport: false,
      reason: 'duplicate-source',
      decision,
      qualityReview
    }
  }

  if (qualityReview.level === 'weak' && decision.recommendation !== 'import') {
    return {
      result,
      canImport: false,
      reason: 'weak-needs-confirmation',
      decision,
      qualityReview
    }
  }

  if (decision.recommendation !== 'import') {
    return {
      result,
      canImport: false,
      reason: 'not-recommended',
      decision,
      qualityReview
    }
  }

  return {
    result,
    canImport: true,
    reason: 'eligible',
    decision,
    qualityReview
  }
}

export const buildFinderQueueImportPlan = (
  results: readonly FinderCandidateResult[],
  options: {
    existingSourceKeys?: Iterable<string>
  } = {}
): FinderQueueImportPlan => {
  const sourceKeys = new Set(options.existingSourceKeys ?? [])
  const importable: FinderCandidateResult[] = []
  const skipped: FinderQueueCandidateImportStatus[] = []
  const batchSeenKeys = new Set<string>()

  for (const result of results) {
    const status = assessFinderQueueCandidateImport(
      result,
      new Set([...sourceKeys, ...batchSeenKeys])
    )

    if (status.canImport) {
      importable.push(result)
      batchSeenKeys.add(`${result.sourceId}::${result.kind}`)
      continue
    }

    skipped.push(status)
  }

  return { importable, skipped }
}

export const summarizeFinderDecisionQueue = (
  results: readonly FinderCandidateResult[]
): FinderDecisionQueueSummary =>
  results.reduce<FinderDecisionQueueSummary>(
    (summary, result) => {
      const decision = buildFinderDecisionQueueItem(result)

      return {
        importCount:
          summary.importCount +
          (decision.recommendation === 'import' ? 1 : 0),
        holdCount: summary.holdCount + (decision.recommendation === 'hold' ? 1 : 0),
        rejectCount:
          summary.rejectCount +
          (decision.recommendation === 'reject' ? 1 : 0),
        nowCount: summary.nowCount + (decision.priority === 'now' ? 1 : 0),
        soonCount: summary.soonCount + (decision.priority === 'soon' ? 1 : 0),
        laterCount: summary.laterCount + (decision.priority === 'later' ? 1 : 0)
      }
    },
    {
      importCount: 0,
      holdCount: 0,
      rejectCount: 0,
      nowCount: 0,
      soonCount: 0,
      laterCount: 0
    }
  )

export const buildFinderQueueReviewColumns = (
  results: readonly FinderCandidateResult[]
): FinderQueueReviewColumn[] => {
  const sorted = createFinderPipelineView(results, { sortMode: 'decision' })
  const lanes: FinderQueueReviewLane[] = ['import', 'hold', 'reject']
  const labels: Record<FinderQueueReviewLane, string> = {
    import: 'Import now',
    hold: 'Hold',
    reject: 'Reject'
  }

  return lanes.map((lane) => {
    const items = sorted
      .filter((result) => buildFinderDecisionQueueItem(result).recommendation === lane)
      .map((result) => ({
        result,
        decision: buildFinderDecisionQueueItem(result),
        lane,
        explicitState: result.decision?.state ?? 'auto',
        isExplicit: (result.decision?.state ?? 'auto') !== 'auto'
      }))

    return {
      lane,
      label: labels[lane],
      items,
      explicitCount: items.filter((item) => item.isExplicit).length
    }
  })
}

export const createFinderPipelineView = (
  results: readonly FinderCandidateResult[],
  filters: FinderPipelineFilters = {}
): FinderCandidateResult[] => {
  const status = filters.status ?? 'all'
  const decision = filters.decision ?? 'all'
  const sortMode = filters.sortMode ?? 'fit_desc'
  const minFitScore =
    typeof filters.minFitScore === 'number' && !Number.isNaN(filters.minFitScore)
      ? Math.max(0, Math.min(100, filters.minFitScore))
      : undefined

  return results
    .filter((result) => status === 'all' || result.status === status)
    .filter((result) =>
      decision === 'all'
        ? true
        : decision === 'import'
        ? result.status === 'imported' || result.decision?.state === 'import_now'
        : decision === 'hold'
        ? result.decision?.state === 'hold_later'
        : result.status === 'rejected' || result.decision?.state === 'rejected'
    )
    .filter((result) =>
      minFitScore === undefined ? true : (result.fitScore ?? -1) >= minFitScore
    )
    .filter((result) =>
      filters.requiresNextAction ? Boolean(result.nextAction?.trim()) : true
    )
    .slice()
    .sort((left, right) => {
      if (sortMode === 'fit_asc') {
        return (
          getFitScoreForAsc(left) - getFitScoreForAsc(right) ||
          compareByStatusPriority(left, right) ||
          compareByCreatedAtDesc(left, right)
        )
      }

      if (sortMode === 'status') {
        return (
          compareByStatusPriority(left, right) ||
          getFitScoreForDesc(right) - getFitScoreForDesc(left) ||
          compareByCreatedAtDesc(left, right)
        )
      }

      if (sortMode === 'decision') {
        const leftDecision = buildFinderDecisionQueueItem(left)
        const rightDecision = buildFinderDecisionQueueItem(right)

        return (
          decisionRecommendationPriority[leftDecision.recommendation] -
            decisionRecommendationPriority[rightDecision.recommendation] ||
          decisionPriorityOrder[leftDecision.priority] -
            decisionPriorityOrder[rightDecision.priority] ||
          rightDecision.score - leftDecision.score ||
          getFitScoreForDesc(right) - getFitScoreForDesc(left) ||
          compareByStatusPriority(left, right) ||
          compareByCreatedAtDesc(left, right)
        )
      }

      if (sortMode === 'next_action') {
        return (
          Number(!left.nextAction?.trim()) -
            Number(!right.nextAction?.trim()) ||
          getFitScoreForDesc(right) - getFitScoreForDesc(left) ||
          compareByStatusPriority(left, right) ||
          compareByCreatedAtDesc(left, right)
        )
      }

      return (
        getFitScoreForDesc(right) - getFitScoreForDesc(left) ||
        compareByStatusPriority(left, right) ||
        compareByCreatedAtDesc(left, right)
      )
    })
}

const normalizeImprovement = (value: string) =>
  value
    .replace(/^verify\s+/i, '')
    .replace(/\s+before outreach\.?$/i, '')
    .replace(/\.$/, '')
    .trim()

const splitScoreImprovements = (text: string) =>
  text
    .split(/\n|;|,/)
    .map(normalizeImprovement)
    .filter(Boolean)
    .slice(0, 5)

export interface FinderCandidateScoreExplanation {
  fitLabel: string
  scoreReason: string
  positiveSignals: string[]
  improvements: string[]
}

export interface FinderPreviewQualityReview {
  level: 'ready' | 'usable' | 'weak'
  label: string
  retrievalReady: boolean
  missingCriticalFields: string[]
  suggestedEdits: string[]
}

export interface FinderPreviewCompletionAction {
  id: string
  label: string
  field:
    | 'partnerName'
    | 'title'
    | 'linksText'
    | 'context'
    | 'whyRelevant'
    | 'missingInfo'
    | 'nextAction'
  value: string
}

export interface FinderPreviewImportDecision {
  tier: 'ready' | 'usable' | 'weak'
  label: string
  canAutoSelect: boolean
  requiresConfirmation: boolean
  canImport: boolean
}

export const explainFinderCandidateScore = (
  result: FinderCandidateResult | (FinderCandidateResultDraft & { kind: CounterpartyContextPackKind })
): FinderCandidateScoreExplanation => {
  const evidenceText = [
    result.summary,
    result.context,
    result.whyRelevant,
    result.nextAction
  ]
    .filter(Boolean)
    .join('\n')
  const positiveSignals = [
    result.partnerName ? 'named target' : '',
    result.title ? 'clear opportunity' : '',
    (result.links ?? []).length > 0 ? 'source link' : '',
    getEmailsFromText(evidenceText).length > 0 ? 'contact' : '',
    /(?:location|paris|france|europe|remote|lyon|london|berlin)/i.test(evidenceText)
      ? 'location'
      : '',
    /(?:deadline|applications? close|apply by|\d{4}-\d{2}-\d{2})/i.test(evidenceText)
      ? 'deadline'
      : '',
    result.whyRelevant ? 'relevance rationale' : '',
    result.nextAction ? 'next action' : ''
  ].filter(Boolean)
  const improvements = splitScoreImprovements(result.missingInfo ?? '')
  const score = result.fitScore
  const scoreReason =
    score === undefined
      ? 'No fit score yet; add evidence before prioritizing this candidate.'
      : score >= 80
      ? 'Strong fit: enough evidence exists to prepare outreach or session context.'
      : score >= 60
      ? 'Usable fit: review missing fields before prioritizing outreach.'
      : 'Weak fit: important evidence is missing; enrich before using this in a session.'

  return {
    fitLabel: getFitLabel(score),
    scoreReason,
    positiveSignals,
    improvements
  }
}

export const reviewFinderPreviewCandidateQuality = (
  result: FinderCandidateResult | (FinderCandidateResultDraft & { kind: CounterpartyContextPackKind })
): FinderPreviewQualityReview => {
  const evidenceText = [
    result.summary,
    result.context,
    result.whyRelevant,
    result.nextAction
  ]
    .filter(Boolean)
    .join('\n')
  const missingCriticalFields = [
    result.partnerName ? '' : 'partner name',
    result.title ? '' : 'title or opportunity',
    (result.links ?? []).length > 0 ? '' : 'source URL',
    getEmailsFromText(evidenceText).length > 0 ? '' : 'contact',
    result.whyRelevant ? '' : 'why relevant',
    result.nextAction ? '' : 'next action'
  ].filter(Boolean)
  const improvements = splitScoreImprovements(result.missingInfo ?? '')
  const suggestedEdits = [
    ...missingCriticalFields.map((field) => `Add ${field}`),
    ...improvements.map((field) => `Clarify ${field}`)
  ].filter((value, index, list) => list.indexOf(value) === index)

  if (missingCriticalFields.length === 0 && improvements.length <= 2) {
    return {
      level: 'ready',
      label: 'ready for import',
      retrievalReady: true,
      missingCriticalFields,
      suggestedEdits
    }
  }

  if (missingCriticalFields.length <= 2) {
    return {
      level: 'usable',
      label: 'usable after quick edits',
      retrievalReady: true,
      missingCriticalFields,
      suggestedEdits
    }
  }

  return {
    level: 'weak',
    label: 'weak before outreach/session use',
    retrievalReady: false,
    missingCriticalFields,
    suggestedEdits
  }
}

export const buildFinderPreviewCompletionActions = (
  result: FinderCandidateResult | (FinderCandidateResultDraft & { kind: CounterpartyContextPackKind }),
  review: FinderPreviewQualityReview
): FinderPreviewCompletionAction[] => {
  const actions: FinderPreviewCompletionAction[] = []
  const addAction = (action: FinderPreviewCompletionAction) => {
    if (actions.some((item) => item.id === action.id)) {
      return
    }

    actions.push(action)
  }

  if (review.missingCriticalFields.includes('source URL')) {
    addAction({
      id: 'add-source-url',
      label: 'Add source URL',
      field: 'linksText',
      value: 'https://'
    })
  }

  if (review.missingCriticalFields.includes('contact')) {
    addAction({
      id: 'add-contact',
      label: 'Add contact hint',
      field: 'context',
      value: 'Contact: '
    })
  }

  if (review.missingCriticalFields.includes('why relevant')) {
    addAction({
      id: 'add-why-relevant',
      label: 'Add why relevant',
      field: 'whyRelevant',
      value: `Relevant for ${result.kind} outreach because `
    })
  }

  if (review.missingCriticalFields.includes('next action')) {
    const nextActionByKind: Record<CounterpartyContextPackKind, string> = {
      job: 'Prepare interview story and verify role details.',
      partner: 'Prepare partner intro and confirm decision maker.',
      investor: 'Prepare investor intro and verify thesis fit.',
      accelerator: 'Prepare application intro and verify deadline.',
      other: 'Prepare focused intro and confirm next step.'
    }

    addAction({
      id: 'add-next-action',
      label: 'Add next action',
      field: 'nextAction',
      value: nextActionByKind[result.kind]
    })
  }

  for (const edit of review.suggestedEdits.slice(0, 4)) {
    addAction({
      id: `track-${edit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: `Track ${edit}`,
      field: 'missingInfo',
      value: edit
    })
  }

  return actions
}

export const getFinderPreviewImportDecision = ({
  review,
  selected,
  confirmed
}: {
  review: FinderPreviewQualityReview
  selected: boolean
  confirmed: boolean
}): FinderPreviewImportDecision => {
  if (review.level === 'ready') {
    return {
      tier: 'ready',
      label: 'ready to import',
      canAutoSelect: true,
      requiresConfirmation: false,
      canImport: selected
    }
  }

  if (review.level === 'usable') {
    return {
      tier: 'usable',
      label: 'usable, review before import',
      canAutoSelect: true,
      requiresConfirmation: false,
      canImport: selected
    }
  }

  return {
    tier: 'weak',
    label: confirmed
      ? 'weak, confirmed for import'
      : 'weak, confirm before import',
    canAutoSelect: false,
    requiresConfirmation: true,
    canImport: selected && confirmed
  }
}

const splitActionableLines = (text: string) =>
  text
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)

const getFitLabel = (fitScore: number | undefined) => {
  if (fitScore === undefined) {
    return 'not scored'
  }

  if (fitScore >= 80) {
    return `${fitScore}/100 strong`
  }

  if (fitScore >= 60) {
    return `${fitScore}/100 usable`
  }

  return `${fitScore}/100 weak`
}

const buildOpeningMessage = (
  job: FinderSearchJob,
  result: FinderCandidateResult,
  reason: string
) => {
  const reasonSentence = reason ? ` ${reason}` : ''

  if (result.kind === 'job') {
    return `Hi ${result.partnerName}, I saw the ${result.title} opportunity.${reasonSentence} I would be glad to discuss the role and see whether my background fits what you need.`
  }

  if (result.kind === 'investor') {
    return `Hi ${result.partnerName}, I saw your work around ${result.title}.${reasonSentence} I would be glad to discuss whether there is a fit for a focused conversation.`
  }

  if (result.kind === 'accelerator') {
    return `Hi ${result.partnerName}, I saw the ${result.title} opportunity.${reasonSentence} I would be glad to understand whether this could be a good fit.`
  }

  if (result.kind === 'partner') {
    return `Hi ${result.partnerName}, I saw the ${result.title} context.${reasonSentence} I would be glad to discuss a practical collaboration if it is relevant for your team.`
  }

  return `Hi ${result.partnerName}, I saw ${result.title} in my ${job.label} search.${reasonSentence} I would be glad to discuss whether this is relevant.`
}

export const createFinderOutreachPrepPack = (
  job: FinderSearchJob,
  result: FinderCandidateResult
): FinderOutreachPrepPack => {
  const links = result.links ?? []
  const warnings = [
    result.fitScore === undefined ? 'Add fitScore before prioritizing outreach.' : '',
    result.whyRelevant ? '' : 'Add whyRelevant to make the opening more specific.',
    result.nextAction ? '' : 'Add nextAction to make follow-up explicit.',
    links.length === 0 ? 'Add at least one source link for provenance.' : ''
  ].filter(Boolean)

  const whyRelevant = result.whyRelevant || result.summary
  const knownContext = [
    result.summary,
    result.context,
    links.length ? `Links: ${links.slice(0, 3).join(', ')}` : ''
  ]
    .map((line) => line?.trim() ?? '')
    .filter(Boolean)
    .slice(0, 4)

  const missingInfoQuestions = splitActionableLines(result.missingInfo ?? '').map(
    (line) => `Clarify: ${line}`
  )
  const questionsToAsk = [
    ...missingInfoQuestions,
    result.kind === 'job'
      ? 'What are the main success criteria for this role?'
      : 'What would make this conversation useful from your side?'
  ].slice(0, 4)

  return {
    targetName: result.partnerName,
    opportunity: result.title,
    kind: result.kind,
    fitLabel: getFitLabel(result.fitScore),
    whyRelevant,
    knownContext,
    questionsToAsk,
    openingMessage: buildOpeningMessage(job, result, result.whyRelevant ?? ''),
    nextAction: result.nextAction || 'Review missing info, then decide whether to import this candidate as a session pack.',
    warnings
  }
}

export const createFinderOutreachDraft = (
  job: FinderSearchJob,
  result: FinderCandidateResult,
  options: { id: string; now: string }
): FinderOutreachDraft => {
  const prep = createFinderOutreachPrepPack(job, result)

  return {
    version: 1,
    id: options.id,
    jobId: job.id,
    candidateResultId: result.id,
    sourceId: result.sourceId,
    kind: result.kind,
    targetName: prep.targetName,
    opportunity: prep.opportunity,
    fitLabel: prep.fitLabel,
    whyRelevant: prep.whyRelevant,
    knownContext: prep.knownContext,
    questionsToAsk: prep.questionsToAsk,
    openingMessage: prep.openingMessage,
   nextAction: prep.nextAction,
    warnings: prep.warnings,
    status: 'draft',
    createdAt: options.now,
    statusHistory: [
      {
        status: 'draft',
        at: options.now,
        reason: 'draft recorded'
      }
    ]
  }
}

const buildMissingDraftHandoff = (
  qualityReview: FinderPreviewQualityReview,
  importDecision: FinderPreviewImportDecision
): FinderCandidateOutreachPipeline['sessionHandoff'] => {
  if (qualityReview.level === 'weak' || importDecision.requiresConfirmation) {
    return {
      state: 'blocked',
      included: false,
      label: 'draft missing · weak candidate',
      hint:
        'Create or enrich the outreach draft before using this candidate in a live session.'
    }
  }

  return {
    state: 'review',
    included: false,
    label: 'draft missing',
    hint:
      'Candidate has usable source context, but no outreach draft is attached to the session yet.'
  }
}

const buildFinderPipelineRecommendedAction = ({
  queue,
  importDecision,
  handoff,
  draft
}: {
  queue: FinderDecisionQueueItem
  importDecision: FinderPreviewImportDecision
  handoff: FinderCandidateOutreachPipeline['sessionHandoff']
  draft?: FinderOutreachDraft | null
}) => {
  if (handoff.included && draft?.status === 'ready_for_contact') {
    return 'Use ready draft in session prep, then run live assistant with this selected context.'
  }

  if (handoff.included && handoff.state === 'follow_up') {
    return 'Use follow-up draft as session continuity and prepare the next call questions.'
  }

  if (queue.recommendation === 'import' && importDecision.canImport) {
    return 'Import candidate, create or review outreach draft, then attach it to session prep.'
  }

  if (queue.recommendation === 'hold') {
    return 'Hold for later and fill weak fields before outreach or session use.'
  }

  return 'Enrich before outreach: add source evidence, contact, why relevant, and next action.'
}

export const buildFinderCandidateOutreachPipeline = ({
  job,
  result,
  draft = null,
  selected = false,
  confirmedWeakImport = false
}: {
  job: FinderSearchJob
  result: FinderCandidateResult
  draft?: FinderOutreachDraft | null
  selected?: boolean
  confirmedWeakImport?: boolean
}): FinderCandidateOutreachPipeline => {
  const score = explainFinderCandidateScore(result)
  const qualityReview = reviewFinderPreviewCandidateQuality(result)
  const importDecision = getFinderPreviewImportDecision({
    review: qualityReview,
    selected,
    confirmed: confirmedWeakImport
  })
  const queue = buildFinderDecisionQueueItem(result)
  const prep = createFinderOutreachPrepPack(job, result)
  const sessionHandoff = draft
    ? buildFinderOutreachDraftSessionHandoff(draft, result)
    : buildMissingDraftHandoff(qualityReview, importDecision)
  const relationshipMemory = draft ? buildFinderRelationshipMemory(draft) : null
  const draftWarnings = [
    ...(draft?.warnings ?? prep.warnings),
    draft ? '' : 'No local outreach draft has been saved yet.'
  ].filter(Boolean)
  const blockers = [
    importDecision.canImport ? '' : importDecision.label,
    sessionHandoff.included ? '' : sessionHandoff.hint,
    ...qualityReview.suggestedEdits.slice(0, 4)
  ].filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)

  return {
    result,
    score,
    qualityReview,
    importDecision,
    queue,
    prep,
    draft: {
      exists: Boolean(draft),
      status: draft?.status ?? 'missing',
      label: draft ? `draft · ${draft.status}` : 'draft missing',
      warnings: draftWarnings
    },
    sessionHandoff: {
      state: sessionHandoff.state,
      included: sessionHandoff.included,
      label: sessionHandoff.label,
      hint: sessionHandoff.hint
    },
    relationshipMemory,
    recommendedAction: buildFinderPipelineRecommendedAction({
      queue,
      importDecision,
      handoff: sessionHandoff,
      draft
    }),
    blockers
  }
}

export const formatFinderOutreachDraftForExport = (
  draft: FinderOutreachDraft
) =>
  [
    '# CoqPi Finder Outreach Draft',
    '',
    'Local draft only. Nothing has been sent externally.',
    '',
    `Target: ${draft.targetName}`,
    `Opportunity: ${draft.opportunity}`,
    `Kind: ${draft.kind}`,
    `Fit: ${draft.fitLabel}`,
    `Source: ${draft.sourceId}`,
    `Created: ${draft.createdAt}`,
    '',
    '## Why Relevant',
    draft.whyRelevant,
    '',
    '## Opening Message',
    draft.openingMessage,
    '',
    '## Known Context',
    ...draft.knownContext.map((line) => `- ${line}`),
    '',
    '## Questions To Ask',
    ...draft.questionsToAsk.map((line) => `- ${line}`),
    '',
    '## Next Action',
    draft.nextAction,
    ...(draft.warnings.length
      ? ['', '## Warnings', ...draft.warnings.map((line) => `- ${line}`)]
      : [])
  ].join('\n')

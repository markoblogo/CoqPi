import type {
  CounterpartyContextPackDraft,
  CounterpartyContextPackKind,
  FinderCandidateResult,
  FinderCandidateResultDraft,
  FinderSearchJob,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSearchStatusCounts
} from './app-types'

export type FinderPipelineStatusFilter = 'all' | FinderCandidateResult['status']

export type FinderPipelineSortMode =
  | 'fit_desc'
  | 'fit_asc'
  | 'status'
  | 'next_action'

export interface FinderPipelineFilters {
  status?: FinderPipelineStatusFilter
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
    nextAction: sanitizeText(candidate.nextAction, 1200)
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
    createdAt: options.now
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
  selected: true
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

export const createFinderPipelineView = (
  results: readonly FinderCandidateResult[],
  filters: FinderPipelineFilters = {}
): FinderCandidateResult[] => {
  const status = filters.status ?? 'all'
  const sortMode = filters.sortMode ?? 'fit_desc'
  const minFitScore =
    typeof filters.minFitScore === 'number' && !Number.isNaN(filters.minFitScore)
      ? Math.max(0, Math.min(100, filters.minFitScore))
      : undefined

  return results
    .filter((result) => status === 'all' || result.status === status)
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

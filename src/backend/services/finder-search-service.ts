import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CheerioCrawler, LogLevel } from '@crawlee/cheerio'
import type {
  CounterpartyContextPack,
  FinderCandidateDecisionState,
  FinderCandidateResultDraft,
  FinderSourceAdapterDetectedFormat,
  FinderSourceAdapterMode,
  FinderSourceAdapterPreviewResult,
  FinderSearchJobDraft,
  FinderSearchJobStatus,
  FinderSearchStore,
  FinderSearchStoreResult,
  StoredFinderCandidateResult,
  StoredFinderOutreachDraft,
  StoredFinderSearchJob
} from '../../shared/app-types'
import {
  createFinderCandidateResult,
  createFinderCandidatesFromOwnerPastedSource,
  createFinderOutreachDraft,
  createFinderRecordsFromRunnerPayload,
  createFinderSearchJob,
  createManualFinderRunnerCandidates,
  getFinderSourceAdapterDetectedFormatSummary,
  reviewFinderPreviewCandidateQuality,
  summarizeFinderSourceAdapterRun,
  summarizeManualFinderRunnerRun,
  updateFinderSearchJobStatus
} from '../../shared/finder-search-module'
import {
  buildFinderOutreachDraftSessionHandoff,
  getFinderOutreachDraftSessionEligibility,
  resolveFinderSessionOutreachDraft
} from '../../shared/finder-relationship-memory'
import { getAppInfo } from './app-state'
import {
  getOptionalCrawl4aiMarkdownEnrichment,
  setCrawl4aiMarkdownEnrichmentRunnerForTests
} from './crawl4ai-service'
import { getContextSourceManifest } from './context-source-service'

type FinderSearchEvent =
  | { version: 1; type: 'job_recorded'; job: StoredFinderSearchJob }
  | { version: 1; type: 'job_status_changed'; job: StoredFinderSearchJob }
  | {
      version: 1
      type: 'candidate_recorded'
      result: StoredFinderCandidateResult
    }
  | {
      version: 1
      type: 'candidate_status_changed'
      result: StoredFinderCandidateResult
    }
  | {
      version: 1
      type: 'candidate_decision_changed'
      result: StoredFinderCandidateResult
    }
  | {
      version: 1
      type: 'outreach_draft_recorded'
      draft: StoredFinderOutreachDraft
    }
  | {
      version: 1
      type: 'outreach_draft_status_changed'
      draft: StoredFinderOutreachDraft
    }

const emptyStore = (): FinderSearchStore => ({
  version: 1,
  jobs: [],
  results: [],
  outreachDrafts: []
})

const getFinderDirectory = () =>
  path.join(getAppInfo().personalKnowledgeCoreDirectory, 'finder')
const getFinderEventsPath = () =>
  path.join(getFinderDirectory(), 'finder-search.events.jsonl')
const getFinderManifestPath = () =>
  path.join(getFinderDirectory(), 'finder-search.manifest.json')

const hashObject = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value as object).sort()))
    .digest('hex')

const DEFAULT_PUBLIC_SOURCE_TIMEOUT_MS = 8000

interface FinderPublicPageSnapshot {
  requestedUrl: string
  finalUrl: string
  title: string
  description: string
  heading: string
  excerpt: string
  contentType: string
  fetchedAt: string
}

type FinderPublicPageFetcher = (
  url: string
) => Promise<FinderPublicPageSnapshot>

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')

const stripHtml = (value: string) =>
  decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )

const isPrivateHostname = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase()
  if (
    !normalized ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1'
  ) {
    return true
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const [a, b] = normalized.split('.').map((part) => Number.parseInt(part, 10))
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }

  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')
}

const validateFinderPublicPageUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Paste exactly one public http(s) URL to fetch.')
  }

  if (/\s/.test(trimmed)) {
    throw new Error('Public URL fetch accepts exactly one URL and no extra pasted text.')
  }

  let parsed: URL

  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Paste a valid public http(s) URL.')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only public http(s) URLs are allowed for web preview.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Authenticated URLs are not allowed for public web preview.')
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('Private, localhost, and local-network URLs are not allowed for public web preview.')
  }

  return parsed.toString()
}

const defaultFinderPublicPageFetcher: FinderPublicPageFetcher = async (url) => {
  const tempStorageDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'coqpi-crawlee-public-page-')
  )
  const previousStorageDirectory = process.env.CRAWLEE_STORAGE_DIR
  let snapshot: FinderPublicPageSnapshot | null = null
  let capturedError: Error | null = null

  process.env.CRAWLEE_STORAGE_DIR = tempStorageDirectory

  try {
    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: 1,
      minConcurrency: 1,
      maxConcurrency: 1,
      maxRequestRetries: 0,
      requestHandlerTimeoutSecs: Math.ceil(DEFAULT_PUBLIC_SOURCE_TIMEOUT_MS / 1000),
      additionalMimeTypes: ['text/plain'],
      requestHandler: async ({ $, body, contentType, request, response }) => {
        const html = typeof body === 'string' ? body : body.toString('utf8')
        const resolvedContentType = String(contentType ?? '').toLowerCase()

        if (
          resolvedContentType &&
          !resolvedContentType.includes('text/html') &&
          !resolvedContentType.includes('application/xhtml+xml') &&
          !resolvedContentType.includes('text/plain')
        ) {
          throw new Error(
            `Public page fetch only supports text/html or text/plain content, received ${resolvedContentType}.`
          )
        }

        const title =
          $('meta[property="og:title"]').attr('content')?.trim() ||
          $('title').first().text().trim()
        const description =
          $('meta[name="description"]').attr('content')?.trim() ||
          $('meta[property="og:description"]').attr('content')?.trim() ||
          ''
        const heading = $('h1').first().text().trim()

        snapshot = {
          requestedUrl: url,
          finalUrl: response?.url || request.loadedUrl || request.url,
          title,
          description,
          heading,
          excerpt: stripHtml(html).slice(0, 2000),
          contentType: resolvedContentType || 'text/html',
          fetchedAt: new Date().toISOString()
        }
      },
      failedRequestHandler: async ({ error }) => {
        capturedError = error instanceof Error ? error : new Error(String(error))
      }
    })

    crawler.log.setLevel(LogLevel.ERROR)

    await crawler.run([
      {
        url,
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'User-Agent': 'CoqPi/0.1 FinderWebIngress'
        }
      }
    ])

    if (capturedError) {
      throw capturedError
    }

    if (!snapshot) {
      throw new Error('Public page fetch returned no usable preview content.')
    }

    return snapshot
  } finally {
    if (previousStorageDirectory === undefined) {
      delete process.env.CRAWLEE_STORAGE_DIR
    } else {
      process.env.CRAWLEE_STORAGE_DIR = previousStorageDirectory
    }

    await fs.rm(tempStorageDirectory, { recursive: true, force: true })
  }
}

let finderPublicPageFetcher: FinderPublicPageFetcher = defaultFinderPublicPageFetcher

const buildFinderPublicPageSourceText = (page: FinderPublicPageSnapshot) =>
  [
    page.finalUrl,
    page.title ? `Title: ${page.title}` : '',
    page.heading && page.heading !== page.title ? `Heading: ${page.heading}` : '',
    page.description ? `Summary: ${page.description}` : '',
    page.excerpt ? page.excerpt : ''
  ]
    .filter(Boolean)
    .join('\n')

const normalizeManualComplexPageText = (value: string) =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')

const buildManualComplexPageSourceText = ({
  sourceUrl,
  sourceText
}: {
  sourceUrl: string
  sourceText: string
}) =>
  [sourceUrl, normalizeManualComplexPageText(sourceText)]
    .filter(Boolean)
    .join('\n')

const finderPreviewQualityRank = (level: 'ready' | 'usable' | 'weak') => {
  if (level === 'ready') {
    return 3
  }

  if (level === 'usable') {
    return 2
  }

  return 1
}

const isBetterPreviewDraft = (
  jobKind: StoredFinderSearchJob['kind'],
  current: FinderCandidateResultDraft,
  candidate: FinderCandidateResultDraft
) => {
  const currentReview = reviewFinderPreviewCandidateQuality({
    ...current,
    kind: jobKind
  })
  const candidateReview = reviewFinderPreviewCandidateQuality({
    ...candidate,
    kind: jobKind
  })
  const currentRank = finderPreviewQualityRank(currentReview.level)
  const candidateRank = finderPreviewQualityRank(candidateReview.level)

  if (candidateRank !== currentRank) {
    return candidateRank > currentRank
  }

  return (
    candidateReview.missingCriticalFields.length <
    currentReview.missingCriticalFields.length
  )
}

const annotateCrawl4aiEnrichedDraft = <
  T extends FinderCandidateResultDraft & {
    detectedFormat: FinderSourceAdapterDetectedFormat
  }
>(
  draft: T
): T => ({
  ...draft,
  context: [
    draft.context ?? '',
    'Optional markdown enrichment applied through crawl4ai_markdown_v1 after weak deterministic public-page preview.'
  ]
    .filter(Boolean)
    .join('\n')
})

const buildCrawl4aiEnrichmentSourceText = ({
  page,
  markdown
}: {
  page: FinderPublicPageSnapshot
  markdown: string
}) =>
  [
    page.finalUrl,
    page.title ? `Title: ${page.title}` : '',
    markdown
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')
  ]
    .filter(Boolean)
    .join('\n')

const hasThinDeterministicPublicPageEvidence = ({
  page,
  draft
}: {
  page: FinderPublicPageSnapshot
  draft: FinderCandidateResultDraft & {
    detectedFormat: FinderSourceAdapterDetectedFormat
  }
}) => {
  const evidenceText = [
    draft.summary,
    draft.context,
    draft.whyRelevant,
    draft.nextAction
  ]
    .filter(Boolean)
    .join('\n')

  return (
    draft.detectedFormat === 'public_page' &&
    draft.parserPack === 'company_profile_v1' &&
    !page.description.trim() &&
    page.excerpt.trim().length < 96 &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(evidenceText) &&
    !/\b(?:deadline|applications? close|apply by|\d{4}-\d{2}-\d{2})\b/i.test(
      evidenceText
    )
  )
}

const maybeEnrichWeakPublicPageDrafts = async ({
  job,
  page,
  drafts
}: {
  job: StoredFinderSearchJob
  page: FinderPublicPageSnapshot
  drafts: Array<
    FinderCandidateResultDraft & {
      detectedFormat: FinderSourceAdapterDetectedFormat
    }
  >
}) => {
  const hasWeakDraft = drafts.some((draft) => {
    const review = reviewFinderPreviewCandidateQuality({
      ...draft,
      kind: job.kind
    })

    return (
      review.level === 'weak' ||
      hasThinDeterministicPublicPageEvidence({
        page,
        draft
      })
    )
  })

  if (!hasWeakDraft) {
    return {
      drafts,
      enrichmentApplied: false
    }
  }

  let markdown: string | null = null

  try {
    markdown = await getOptionalCrawl4aiMarkdownEnrichment(page.finalUrl)
  } catch {
    return {
      drafts,
      enrichmentApplied: false
    }
  }

  if (!markdown) {
    return {
      drafts,
      enrichmentApplied: false
    }
  }

  const enrichedParsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    buildCrawl4aiEnrichmentSourceText({
      page,
      markdown
    })
  )
  const enrichedDrafts = adaptPublicPageDrafts(job.id, page, enrichedParsed.candidates)

  if (drafts.length !== 1 || enrichedDrafts.length === 0) {
    return {
      drafts,
      enrichmentApplied: false
    }
  }

  const enrichedDraft = annotateCrawl4aiEnrichedDraft(enrichedDrafts[0])

  if (!isBetterPreviewDraft(job.kind, drafts[0], enrichedDraft)) {
    return {
      drafts,
      enrichmentApplied: false
    }
  }

  return {
    drafts: [enrichedDraft],
    enrichmentApplied: true
  }
}

const adaptPublicPageDrafts = (
  jobId: string,
  page: FinderPublicPageSnapshot,
  drafts: Array<
    FinderCandidateResultDraft & {
      detectedFormat: FinderSourceAdapterDetectedFormat
    }
  >
) =>
  drafts.map((draft) => {
    const sourceHash = createHash('sha256')
      .update(
        JSON.stringify({
          jobId,
          url: page.finalUrl,
          title: page.title,
          description: page.description,
          heading: page.heading
        })
      )
      .digest('hex')

    const inheritedContext = (draft.context ?? '')
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('Imported through owner_paste_v0') &&
          !line.startsWith('No web fetch, scraping, search API, scheduler, or outbound action was performed.')
      )

    return {
      ...draft,
      detectedFormat: 'public_page' as const,
      sourceId: `coqpi:source-adapter:web:${draft.sourceId.split(':').slice(2).join(':')}:${sourceHash}`,
      links: Array.from(new Set([page.finalUrl, ...(draft.links ?? [])])),
      summary:
        draft.summary ||
        [page.title, page.description].filter(Boolean).join('. '),
      context: [
        'Imported through public_page_v1 from one explicit public URL fetch.',
        `Requested URL: ${page.requestedUrl}.`,
        page.finalUrl !== page.requestedUrl ? `Final URL: ${page.finalUrl}.` : '',
        `Fetched at: ${page.fetchedAt}.`,
        `Fetched content type: ${page.contentType}.`,
        'No scheduler, batch crawl, browser automation, auth session, search API, or outbound action was performed.',
        ...inheritedContext
      ]
        .filter(Boolean)
        .join('\n')
    }
  })

const adaptManualComplexPageDrafts = (
  sourceUrl: string,
  drafts: Array<
    FinderCandidateResultDraft & {
      detectedFormat: FinderSourceAdapterDetectedFormat
    }
  >
) =>
  drafts.map((draft) => {
    const inheritedContext = (draft.context ?? '')
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('Imported through owner_paste_v0') &&
          !line.startsWith('No web fetch, scraping, search API, scheduler, or outbound action was performed.')
      )

    return {
      ...draft,
      links: Array.from(new Set([sourceUrl, ...(draft.links ?? [])])),
      context: [
        'Imported through manual_complex_page_v1 from owner-reviewed notes for one explicit public URL.',
        `Requested URL: ${sourceUrl}.`,
        'No scheduler, browser automation, auth session, search API, or outbound action was performed.',
        ...inheritedContext
      ]
        .filter(Boolean)
        .join('\n')
    }
  })

const previewFinderSourceAdapterCandidates = async (
  jobId: string,
  mode: FinderSourceAdapterMode,
  parsed: {
    requestedCount: number
    candidates: Array<
      FinderCandidateResultDraft & {
        detectedFormat: FinderSourceAdapterDetectedFormat
      }
    >
    errors: { index?: number; reason: string }[]
  },
  emptyError: string,
  reason: string
): Promise<FinderSourceAdapterPreviewResult> => {
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot preview source adapter results.')
  }

  if (parsed.requestedCount === 0) {
    throw new Error(emptyError)
  }

  const existingSourceIds = new Set(
    store.results
      .filter((result) => result.jobId === job.id)
      .map((result) => result.sourceId)
  )
  const candidates = parsed.candidates.map((draft, index) => ({
    index,
    draft,
    detectedFormat: draft.detectedFormat,
    duplicate: existingSourceIds.has(draft.sourceId)
  }))

  return {
    jobId: job.id,
    mode,
    requestedCount: parsed.requestedCount,
    validCount: parsed.candidates.length,
    duplicateCount: candidates.filter((candidate) => candidate.duplicate).length,
    detectedFormats: getFinderSourceAdapterDetectedFormatSummary(parsed.candidates),
    candidates,
    errors: parsed.errors,
    reason
  }
}

const ingestFinderSourceAdapterCandidates = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[],
  mode: FinderSourceAdapterMode,
  importReason: string,
  readyReason: string
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot ingest source adapter results.')
  }

  if (drafts.length === 0) {
    throw new Error('Select at least one source adapter candidate to import.')
  }

  const now = new Date().toISOString()
  const existingSourceIds = new Set(
    store.results
      .filter((result) => result.jobId === job.id)
      .map((result) => result.sourceId)
  )
  const newDrafts = drafts.filter((draft) => !existingSourceIds.has(draft.sourceId))
  const events: FinderSearchEvent[] = newDrafts.map((draft) => ({
    version: 1,
    type: 'candidate_recorded',
    result: withResultSourceTruth(
      createFinderCandidateResult(job, draft, {
        id: randomUUID(),
        now
      }),
      importReason
    )
  }))

  if (job.status === 'draft' || (newDrafts.length > 0 && job.status !== 'ready')) {
    events.push({
      version: 1,
      type: 'job_status_changed',
      job: {
        ...job,
        ...updateFinderSearchJobStatus(job, 'ready', now),
        statusHistory: [{ status: 'ready', at: now, reason: readyReason }, ...job.statusHistory]
      }
    })
  }

  const result = events.length > 0 ? await mutateStore(events) : { store }

  return {
    ...result,
    finderSourceAdapterSummary: summarizeFinderSourceAdapterRun(
      job.id,
      drafts.length,
      newDrafts.length,
      drafts.length - newDrafts.length,
      [],
      mode
    )
  }
}

const provenanceFor = (sourceId: string) => ({
  sourceId,
  locatorSha256: createHash('sha256').update(sourceId).digest('hex')
})

const withJobSourceTruth = (
  job: ReturnType<typeof createFinderSearchJob>,
  reason: string
): StoredFinderSearchJob => ({
  ...job,
  ownerId: 'owner',
  provenance: provenanceFor(`coqpi:finder:job:${job.id}`),
  contentHash: hashObject({
    kind: job.kind,
    label: job.label,
    query: job.query,
    goal: job.goal,
    notes: job.notes
  }),
  statusHistory: [{ status: job.status, at: job.updatedAt, reason }]
})

const withResultSourceTruth = (
  result: ReturnType<typeof createFinderCandidateResult>,
  reason: string
): StoredFinderCandidateResult => ({
  ...result,
  ownerId: 'owner',
  provenance: provenanceFor(`coqpi:finder:result:${result.id}`),
  contentHash: hashObject({
    jobId: result.jobId,
    kind: result.kind,
    sourceId: result.sourceId,
    partnerName: result.partnerName,
    title: result.title,
    summary: result.summary,
    context: result.context,
    links: result.links,
    score: result.score,
    fitScore: result.fitScore,
    whyRelevant: result.whyRelevant,
    missingInfo: result.missingInfo,
    nextAction: result.nextAction,
    decision: result.decision
  }),
  statusHistory: [{ status: result.status, at: result.createdAt, reason }]
})

const normalizeStoredResult = (
  result: StoredFinderCandidateResult
): StoredFinderCandidateResult => ({
  ...result,
  decision: result.decision ?? {
    state: 'auto',
    updatedAt: result.createdAt
  }
})

const withOutreachDraftSourceTruth = (
  draft: ReturnType<typeof createFinderOutreachDraft>
): StoredFinderOutreachDraft => ({
  ...draft,
  ownerId: 'owner',
  provenance: provenanceFor(`coqpi:finder:outreach-draft:${draft.id}`),
  contentHash: hashObject({
    jobId: draft.jobId,
    candidateResultId: draft.candidateResultId,
    sourceId: draft.sourceId,
    kind: draft.kind,
    targetName: draft.targetName,
    opportunity: draft.opportunity,
    fitLabel: draft.fitLabel,
    whyRelevant: draft.whyRelevant,
    knownContext: draft.knownContext,
    questionsToAsk: draft.questionsToAsk,
    openingMessage: draft.openingMessage,
    nextAction: draft.nextAction,
    warnings: draft.warnings,
    status: draft.status
  })
})

const normalizeStoredOutreachDraft = (
  draft: StoredFinderOutreachDraft
): StoredFinderOutreachDraft => ({
  ...draft,
  status: draft.status ?? 'draft',
  statusHistory:
    Array.isArray((draft as StoredFinderOutreachDraft & { statusHistory?: unknown }).statusHistory) &&
    (draft as StoredFinderOutreachDraft & { statusHistory?: unknown[] }).statusHistory?.length
      ? draft.statusHistory
      : [
          {
            status: draft.status ?? 'draft',
            at: draft.createdAt,
            reason: 'draft recorded'
          }
        ]
})

const applyEvent = (
  store: FinderSearchStore,
  event: FinderSearchEvent
): FinderSearchStore => {
  if (event.type === 'job_recorded') {
    return { ...store, jobs: [event.job, ...store.jobs] }
  }

  if (event.type === 'job_status_changed') {
    return {
      ...store,
      jobs: store.jobs.map((job) =>
        job.id === event.job.id ? event.job : job
      )
    }
  }

  if (event.type === 'candidate_recorded') {
    return { ...store, results: [event.result, ...store.results] }
  }

  if (event.type === 'candidate_status_changed') {
    return {
      ...store,
      results: store.results.map((result) =>
        result.id === event.result.id ? event.result : result
      )
    }
  }

  if (event.type === 'candidate_decision_changed') {
    return {
      ...store,
      results: store.results.map((result) =>
        result.id === event.result.id ? event.result : result
      )
    }
  }

  if (event.type === 'outreach_draft_status_changed') {
    return {
      ...store,
      outreachDrafts: store.outreachDrafts.map((draft) =>
        draft.id === event.draft.id ? event.draft : draft
      )
    }
  }

  return {
    ...store,
    outreachDrafts: [event.draft, ...store.outreachDrafts]
  }
}

const readEvents = async (): Promise<FinderSearchEvent[]> => {
  try {
    const raw = await fs.readFile(getFinderEventsPath(), 'utf8')

    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FinderSearchEvent)
  } catch {
    return []
  }
}

const writeManifest = async (store: FinderSearchStore) => {
  await fs.mkdir(getFinderDirectory(), { recursive: true })
  await fs.writeFile(
    getFinderManifestPath(),
    `${JSON.stringify(store, null, 2)}\n`,
    'utf8'
  )
}

const appendEvent = async (event: FinderSearchEvent) => {
  await fs.mkdir(getFinderDirectory(), { recursive: true })
  await fs.appendFile(getFinderEventsPath(), `${JSON.stringify(event)}\n`, 'utf8')
}

const mutateStore = async (events: FinderSearchEvent[]) => {
  let store = await getFinderSearchStoreRaw()

  for (const event of events) {
    await appendEvent(event)
    store = applyEvent(store, event)
  }

  await writeManifest(store)
  return { store }
}

const getFinderSearchStoreRaw = async (): Promise<FinderSearchStore> => {
  const events = await readEvents()
  const store = events.reduce(applyEvent, emptyStore())
  const normalizedStore: FinderSearchStore = {
    ...store,
    results: store.results.map(normalizeStoredResult),
    outreachDrafts: store.outreachDrafts.map(normalizeStoredOutreachDraft)
  }

  await writeManifest(normalizedStore)
  return normalizedStore
}

export const getFinderSearchStore =
  async (): Promise<FinderSearchStoreResult> => ({
    store: await getFinderSearchStoreRaw()
  })

export const resolveSessionSelectedFinderOutreachDraftId = async (
  id: string
) => {
  const trimmed = typeof id === 'string' ? id.trim() : ''

  if (!trimmed) {
    return ''
  }

  const store = await getFinderSearchStoreRaw()

  const selectedDraft = store.outreachDrafts.find(
    (draft) => draft.id === trimmed
  )

  if (!selectedDraft) {
    return ''
  }

  if (!getFinderOutreachDraftSessionEligibility(selectedDraft).eligible) {
    return ''
  }

  const selectedCandidate = store.results.find(
    (result) => result.id === selectedDraft.candidateResultId
  )
  const handoff = buildFinderOutreachDraftSessionHandoff(
    selectedDraft,
    selectedCandidate
  )

  return handoff.included ? trimmed : ''
}

export const getFinderOutreachDraftById = async (id: string) => {
  const trimmed = typeof id === 'string' ? id.trim() : ''

  if (!trimmed) {
    return null
  }

  const store = await getFinderSearchStoreRaw()

  return store.outreachDrafts.find((draft) => draft.id === trimmed) ?? null
}

export const getFinderCandidateResultById = async (id: string) => {
  const trimmed = typeof id === 'string' ? id.trim() : ''

  if (!trimmed) {
    return null
  }

  const store = await getFinderSearchStoreRaw()

  return store.results.find((result) => result.id === trimmed) ?? null
}

export const resolveSessionFinderOutreachDraft = async ({
  selectedDraftId = '',
  selectedPackIds = []
}: {
  selectedDraftId?: string
  selectedPackIds?: string[]
}) => {
  const store = await getFinderSearchStoreRaw()
  const manifest = await getContextSourceManifest()

  return resolveFinderSessionOutreachDraft({
    selectedDraftId,
    selectedPackIds,
    availablePacks: (manifest.manifest.counterpartyPacks ??
      []) as CounterpartyContextPack[],
    availableFinderResults: store.results,
    availableOutreachDrafts: store.outreachDrafts
  })
}

export const addFinderSearchJob = async (
  draft: FinderSearchJobDraft
): Promise<FinderSearchStoreResult> => {
  const now = new Date().toISOString()
  const job = withJobSourceTruth(
    createFinderSearchJob(draft, {
      id: randomUUID(),
      now
    }),
    'job recorded'
  )

  return mutateStore([{ version: 1, type: 'job_recorded', job }])
}

export const setFinderSearchJobStatus = async (
  id: string,
  status: FinderSearchJobStatus
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const current = store.jobs.find((job) => job.id === id)

  if (!current) {
    throw new Error('Finder search job not found.')
  }

  const updatedBase = updateFinderSearchJobStatus(
    current,
    status,
    new Date().toISOString()
  )
  const job: StoredFinderSearchJob = {
    ...current,
    ...updatedBase,
    statusHistory: [
      { status, at: updatedBase.updatedAt, reason: 'status changed' },
      ...current.statusHistory
    ]
  }

  return mutateStore([{ version: 1, type: 'job_status_changed', job }])
}

export const addFinderCandidateResult = async (
  jobId: string,
  draft: FinderCandidateResultDraft
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((candidateJob) => candidateJob.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  const now = new Date().toISOString()
  const result = withResultSourceTruth(
    createFinderCandidateResult(job, draft, {
      id: randomUUID(),
      now
    }),
    'candidate recorded'
  )
  const events: FinderSearchEvent[] = [
    { version: 1, type: 'candidate_recorded', result }
  ]

  if (job.status === 'draft') {
    const updatedJob: StoredFinderSearchJob = {
      ...job,
      ...updateFinderSearchJobStatus(job, 'ready', now),
      statusHistory: [
        { status: 'ready', at: now, reason: 'candidate recorded' },
        ...job.statusHistory
      ]
    }
    events.push({ version: 1, type: 'job_status_changed', job: updatedJob })
  }

  return mutateStore(events)
}

export const setFinderCandidateResultStatus = async (
  id: string,
  status: StoredFinderCandidateResult['status']
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const current = store.results.find((result) => result.id === id)

  if (!current) {
    throw new Error('Finder candidate result not found.')
  }

  const now = new Date().toISOString()
  const result: StoredFinderCandidateResult = {
    ...current,
    status,
    statusHistory: [
      { status, at: now, reason: 'status changed' },
      ...current.statusHistory
    ]
  }
  const events: FinderSearchEvent[] = [
    { version: 1, type: 'candidate_status_changed', result }
  ]

  if (status === 'imported') {
    const job = store.jobs.find((candidateJob) => candidateJob.id === result.jobId)
    if (job && job.status !== 'imported') {
      events.push({
        version: 1,
        type: 'job_status_changed',
        job: {
          ...job,
          ...updateFinderSearchJobStatus(job, 'imported', now),
          statusHistory: [
            { status: 'imported', at: now, reason: 'candidate imported' },
            ...job.statusHistory
          ]
        }
      })
    }
  }

  return mutateStore(events)
}

export const setFinderCandidateResultDecision = async (
  id: string,
  state: FinderCandidateDecisionState,
  reason?: string
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const current = store.results.find((result) => result.id === id)

  if (!current) {
    throw new Error('Finder candidate result not found.')
  }

  const now = new Date().toISOString()
  const normalizedReason = typeof reason === 'string' ? reason.trim() : ''
  const nextStatus =
    state === 'rejected'
      ? 'rejected'
      : current.status === 'rejected'
      ? 'ready'
      : current.status
  const result: StoredFinderCandidateResult = {
    ...current,
    status: nextStatus,
    decision: {
      state,
      reason: normalizedReason || undefined,
      updatedAt: now
    },
    statusHistory:
      nextStatus !== current.status
        ? [
            {
              status: nextStatus,
              at: now,
              reason:
                state === 'rejected'
                  ? normalizedReason || 'candidate rejected with reason'
                  : 'candidate restored from rejected state'
            },
            ...current.statusHistory
          ]
        : current.statusHistory
  }

  return mutateStore([
    { version: 1, type: 'candidate_decision_changed', result }
  ])
}

export const ingestFinderRunnerPayload = async (
  payloadText: string
): Promise<FinderSearchStoreResult> => {
  const now = new Date().toISOString()
  const records = createFinderRecordsFromRunnerPayload(payloadText, {
    jobId: randomUUID(),
    resultId: () => randomUUID(),
    now
  })
  const job = withJobSourceTruth(records.job, 'runner payload imported')
  const events: FinderSearchEvent[] = [
    { version: 1, type: 'job_recorded', job },
    ...records.results.map((result): FinderSearchEvent => ({
      version: 1,
      type: 'candidate_recorded',
      result: withResultSourceTruth(result, 'runner payload imported')
    }))
  ]
  const result = await mutateStore(events)

  return { ...result, errors: records.errors }
}

export const runManualFinderSearchJob = async (
  jobId: string
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot be run.')
  }

  const now = new Date().toISOString()
  const drafts = createManualFinderRunnerCandidates(job)
  const existingSourceIds = new Set(
    store.results
      .filter((result) => result.jobId === job.id)
      .map((result) => result.sourceId)
  )
  const newDrafts = drafts.filter((draft) => !existingSourceIds.has(draft.sourceId))
  const events: FinderSearchEvent[] = newDrafts.map((draft) => ({
    version: 1,
    type: 'candidate_recorded',
    result: withResultSourceTruth(
      createFinderCandidateResult(job, draft, {
        id: randomUUID(),
        now
      }),
      'manual mock runner generated candidate'
    )
  }))

  if (job.status === 'draft' || (newDrafts.length > 0 && job.status !== 'ready')) {
    events.push({
      version: 1,
      type: 'job_status_changed',
      job: {
        ...job,
        ...updateFinderSearchJobStatus(job, 'ready', now),
        statusHistory: [
          { status: 'ready', at: now, reason: 'manual mock runner completed' },
          ...job.statusHistory
        ]
      }
    })
  }

  const result = events.length > 0 ? await mutateStore(events) : { store }

  return {
    ...result,
    finderRunSummary: summarizeManualFinderRunnerRun(
      job.id,
      newDrafts.length,
      drafts.length - newDrafts.length
    )
  }
}

export const ingestFinderOwnerPastedSource = async (
  jobId: string,
  sourceText: string
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot ingest source adapter results.')
  }

  const parsed = createFinderCandidatesFromOwnerPastedSource(job, sourceText)
  if (parsed.requestedCount === 0) {
    throw new Error('Paste at least one URL, text block, or exported candidate.')
  }

  const now = new Date().toISOString()
  const existingSourceIds = new Set(
    store.results
      .filter((result) => result.jobId === job.id)
      .map((result) => result.sourceId)
  )
  const newDrafts = parsed.candidates.filter(
    (candidate) => !existingSourceIds.has(candidate.sourceId)
  )
  const events: FinderSearchEvent[] = newDrafts.map((candidate) => ({
    version: 1,
    type: 'candidate_recorded',
    result: withResultSourceTruth(
      createFinderCandidateResult(job, candidate, {
        id: randomUUID(),
        now
      }),
      'owner pasted source adapter imported candidate'
    )
  }))

  if (job.status === 'draft' || (newDrafts.length > 0 && job.status !== 'ready')) {
    events.push({
      version: 1,
      type: 'job_status_changed',
      job: {
        ...job,
        ...updateFinderSearchJobStatus(job, 'ready', now),
        statusHistory: [
          { status: 'ready', at: now, reason: 'owner pasted source adapter completed' },
          ...job.statusHistory
        ]
      }
    })
  }

  const result = events.length > 0 ? await mutateStore(events) : { store }

  return {
    ...result,
    finderSourceAdapterSummary: summarizeFinderSourceAdapterRun(
      job.id,
      parsed.requestedCount,
      newDrafts.length,
      parsed.candidates.length - newDrafts.length,
      parsed.errors,
      'owner_paste_v0'
    )
  }
}

export const previewFinderOwnerPastedSource = async (
  jobId: string,
  sourceText: string
): Promise<FinderSourceAdapterPreviewResult> => {
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot preview source adapter results.')
  }

  const parsed = createFinderCandidatesFromOwnerPastedSource(job, sourceText)
  return previewFinderSourceAdapterCandidates(
    jobId,
    'owner_paste_v0',
    parsed,
    'Paste at least one URL, text block, or exported candidate.',
    'Owner-pasted URL/text/export was normalized locally for review; no store write, web fetch, scraping, search API, scheduler, or outbound action was performed.'
  )
}

export const ingestFinderOwnerPastedSourceCandidates = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[]
): Promise<FinderSearchStoreResult> => {
  return ingestFinderSourceAdapterCandidates(
    jobId,
    drafts,
    'owner_paste_v0',
    'owner pasted source adapter imported reviewed candidate',
    'owner pasted source adapter reviewed import completed'
  )
}

export const previewFinderPublicPageSource = async (
  jobId: string,
  sourceUrl: string
): Promise<FinderSourceAdapterPreviewResult> => {
  const normalizedUrl = validateFinderPublicPageUrl(sourceUrl)
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot preview source adapter results.')
  }

  const page = await finderPublicPageFetcher(normalizedUrl)
  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    buildFinderPublicPageSourceText(page)
  )
  const maybeEnriched = await maybeEnrichWeakPublicPageDrafts({
    job,
    page,
    drafts: adaptPublicPageDrafts(job.id, page, parsed.candidates)
  })
  const adapted = {
    requestedCount: 1,
    candidates: maybeEnriched.drafts,
    errors: parsed.errors
  }

  return previewFinderSourceAdapterCandidates(
    jobId,
    'public_page_v1',
    adapted,
    'Paste exactly one public http(s) URL to fetch.',
    maybeEnriched.enrichmentApplied
      ? 'One explicit public URL was fetched into a local preview, then optional crawl4ai markdown enrichment improved a weak deterministic candidate; no store write, scheduler, batch crawl, browser automation, auth session, search API, or outbound action was performed.'
      : 'One explicit public URL was fetched into a local preview; no store write, scheduler, batch crawl, browser automation, auth session, search API, or outbound action was performed.'
  )
}

export const previewFinderManualComplexPageSource = async (
  jobId: string,
  sourceUrl: string,
  sourceText: string
): Promise<FinderSourceAdapterPreviewResult> => {
  const normalizedUrl = validateFinderPublicPageUrl(sourceUrl)
  const normalizedText = normalizeManualComplexPageText(sourceText)
  const store = await getFinderSearchStoreRaw()
  const job = store.jobs.find((item) => item.id === jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  if (job.status === 'rejected') {
    throw new Error('Rejected finder jobs cannot preview source adapter results.')
  }

  if (!normalizedText) {
    throw new Error('Paste reviewed page notes or markdown before running manual complex-page preview.')
  }

  const parsed = createFinderCandidatesFromOwnerPastedSource(
    job,
    buildManualComplexPageSourceText({
      sourceUrl: normalizedUrl,
      sourceText: normalizedText
    })
  )
  const adapted = {
    requestedCount: 1,
    candidates: adaptManualComplexPageDrafts(normalizedUrl, parsed.candidates),
    errors: parsed.errors
  }

  return previewFinderSourceAdapterCandidates(
    jobId,
    'manual_complex_page_v1',
    adapted,
    'Paste one public http(s) URL plus reviewed page notes or markdown.',
    'One explicit public URL plus owner-reviewed page notes were normalized into a local supervised preview; no store write, scheduler, browser automation, auth session, search API, or outbound action was performed.'
  )
}

export const ingestFinderPublicPageSourceCandidates = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[]
): Promise<FinderSearchStoreResult> =>
  ingestFinderSourceAdapterCandidates(
    jobId,
    drafts,
    'public_page_v1',
    'public page source adapter imported reviewed candidate',
    'public page source adapter reviewed import completed'
  )

export const ingestFinderManualComplexPageSourceCandidates = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[]
): Promise<FinderSearchStoreResult> =>
  ingestFinderSourceAdapterCandidates(
    jobId,
    drafts,
    'manual_complex_page_v1',
    'manual complex-page source adapter imported reviewed candidate',
    'manual complex-page source adapter reviewed import completed'
  )

export const setFinderPublicPageFetcherForTests = (
  fetcher: FinderPublicPageFetcher | null
) => {
  finderPublicPageFetcher = fetcher ?? defaultFinderPublicPageFetcher
}

export const setFinderMarkdownEnrichmentRunnerForTests =
  setCrawl4aiMarkdownEnrichmentRunnerForTests

export const saveFinderOutreachDraft = async (
  candidateResultId: string
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const existingDraft = store.outreachDrafts.find(
    (draft) => draft.candidateResultId === candidateResultId
  )

  if (existingDraft) {
    return { store }
  }

  const result = store.results.find(
    (candidate) => candidate.id === candidateResultId
  )

  if (!result) {
    throw new Error('Finder candidate result not found.')
  }

  const job = store.jobs.find((candidateJob) => candidateJob.id === result.jobId)

  if (!job) {
    throw new Error('Finder search job not found.')
  }

  const draft = withOutreachDraftSourceTruth(
    createFinderOutreachDraft(job, result, {
      id: randomUUID(),
      now: new Date().toISOString()
    })
  )

  return mutateStore([{ version: 1, type: 'outreach_draft_recorded', draft }])
}

export const setFinderOutreachDraftStatus = async (
  draftId: string,
  status: StoredFinderOutreachDraft['status']
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
  const current = store.outreachDrafts.find((draft) => draft.id === draftId)

  if (!current) {
    throw new Error('Finder outreach draft not found.')
  }

  if (current.status === status) {
    return { store }
  }

  const draft: StoredFinderOutreachDraft = {
    ...current,
    status,
    statusHistory: [
      {
        status,
        at: new Date().toISOString(),
        reason: `status moved to ${status}`
      },
      ...current.statusHistory
    ]
  }

  return mutateStore([
    { version: 1, type: 'outreach_draft_status_changed', draft }
  ])
}

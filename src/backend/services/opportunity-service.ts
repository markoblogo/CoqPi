import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import type { FinderCandidateResultDraft } from '../../shared/app-types'
import {
  canonicalizeOpportunityUrl,
  deduplicateOpportunityCandidates,
  migrateFinderStoreV1ToV2,
  type OpportunityCandidateV2,
  createBatchSendApproval,
  createMailDraftRecord,
  createOpportunityApplicationPack,
  type BatchSendApproval,
  type CalendarProposal,
  type CommunicationThreadSummary,
  type MailDraftRecord,
  type OpportunityMetrics,
  type OpportunityRunStatus,
  type OpportunitySearchJobV2,
  type OpportunitySearchSchedule,
  type OpportunityStoreV2,
  type SearchProviderError,
  type SearchProviderId,
  type SearchRunResult
} from '../../shared/opportunity-contracts'
import { getAppInfo } from './app-state'
import { getSessionSummaries } from './session-summary-service'
import {
  addFinderCandidateResult,
  getFinderSearchStore
} from './finder-search-service'
import { previewFinderPublicPageSource } from './finder-search-service'

interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

type OpportunityFetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<FetchResponse>

let opportunityFetch: OpportunityFetch = (url, init) =>
  fetch(url, init) as Promise<FetchResponse>
let braveKeyOverride = ''

export const setOpportunityFetchForTests = (fetcher: OpportunityFetch) => {
  opportunityFetch = fetcher
}

export const setBraveApiKeyForTests = (key: string) => {
  braveKeyOverride = key
}

const getDirectory = () =>
  path.join(getAppInfo().personalKnowledgeCoreDirectory, 'opportunities')
const getStorePath = () => path.join(getDirectory(), 'opportunity-store.v2.json')
const getEventsPath = () => path.join(getDirectory(), 'opportunity.events.jsonl')

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const readPersistedStore = async (): Promise<OpportunityStoreV2 | null> => {
  try {
    const parsed = JSON.parse(await fs.readFile(getStorePath(), 'utf8'))
    return parsed?.version === 2 ? parsed : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const writeStore = async (
  store: OpportunityStoreV2,
  event: Record<string, unknown>
) => {
  await fs.mkdir(getDirectory(), { recursive: true })
  const tempPath = `${getStorePath()}.${process.pid}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, getStorePath())
  await fs.appendFile(
    getEventsPath(),
    `${JSON.stringify({ version: 1, at: new Date().toISOString(), ...event })}\n`,
    'utf8'
  )
}

const mergeFinderStore = async (persisted: OpportunityStoreV2 | null) => {
  const finder = (await getFinderSearchStore()).store
  const migrated = migrateFinderStoreV1ToV2(finder)
  if (!persisted) return migrated

  const persistedJobs = new Map(persisted.jobs.map((job) => [job.id, job]))
  const persistedResults = new Map(
    persisted.results.map((result) => [result.id, result])
  )

  return {
    ...persisted,
    jobs: migrated.jobs.map((job) => ({ ...job, ...persistedJobs.get(job.id) })),
    results: migrated.results.map((result) => ({
      ...result,
      ...persistedResults.get(result.id)
    })),
    outreachDrafts: finder.outreachDrafts
  }
}

export const getOpportunityStore = async (): Promise<OpportunityStoreV2> =>
  mergeFinderStore(await readPersistedStore())

export interface OpportunityJobConfiguration {
  scenario?: OpportunitySearchJobV2['scenario']
  geography?: string[]
  languages?: string[]
  inclusionTerms?: string[]
  exclusionTerms?: string[]
  recencyDays?: number
  sourceAdapters?: SearchProviderId[]
  providerTargets?: OpportunitySearchJobV2['providerTargets']
  schedule?: Partial<OpportunitySearchSchedule>
}

const cleanList = (values: string[] | undefined) =>
  Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)))

export const configureOpportunityJob = async (
  jobId: string,
  config: OpportunityJobConfiguration
) => {
  const store = await getOpportunityStore()
  const index = store.jobs.findIndex((job) => job.id === jobId)
  if (index < 0) throw new Error('Finder search job not found.')
  const current = store.jobs[index]
  const sourceAdapters = config.sourceAdapters ?? current.sourceAdapters
  if (sourceAdapters.length === 0) {
    throw new Error('Select at least one search provider.')
  }
  const updated: OpportunitySearchJobV2 = {
    ...current,
    ...(config.scenario ? { scenario: config.scenario } : {}),
    geography: config.geography ? cleanList(config.geography) : current.geography,
    languages: config.languages ? cleanList(config.languages) : current.languages,
    inclusionTerms: config.inclusionTerms
      ? cleanList(config.inclusionTerms)
      : current.inclusionTerms,
    exclusionTerms: config.exclusionTerms
      ? cleanList(config.exclusionTerms)
      : current.exclusionTerms,
    recencyDays: Math.max(1, Math.min(365, config.recencyDays ?? current.recencyDays)),
    sourceAdapters,
    providerTargets: config.providerTargets ?? current.providerTargets,
    schedule: { ...current.schedule, ...config.schedule },
    updatedAt: new Date().toISOString()
  }
  store.jobs[index] = updated
  await writeStore(store, { type: 'job_configured', jobId })
  return store
}

const boundedFetchJson = async (
  url: string,
  headers: Record<string, string> = {}
) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await opportunityFetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'CoqPi/0.1 OpportunityDiscovery', ...headers },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

interface ProviderCandidate {
  provider: SearchProviderId
  providerSourceId: string
  partnerName: string
  title: string
  summary: string
  url: string
  publishedAt?: string
  deadlineAt?: string
  confidence: number
}

const searchBrave = async (job: OpportunitySearchJobV2): Promise<ProviderCandidate[]> => {
  const key = braveKeyOverride || process.env.BRAVE_SEARCH_API_KEY?.trim() || ''
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY is not configured.')
  const query = [job.query, ...job.inclusionTerms, ...job.geography]
    .filter(Boolean)
    .join(' ')
  const freshness = job.recencyDays <= 1 ? 'pd' : job.recencyDays <= 7 ? 'pw' : job.recencyDays <= 31 ? 'pm' : 'py'
  const data = (await boundedFetchJson(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&freshness=${freshness}`,
    { 'X-Subscription-Token': key }
  )) as { web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string; profile?: { long_name?: string } }> } }

  return (data.web?.results ?? []).slice(0, 10).map((item, index) => ({
    provider: 'brave_web',
    providerSourceId: item.url || `result-${index}`,
    partnerName: item.profile?.long_name || new URL(item.url || 'https://unknown.invalid').hostname,
    title: item.title || 'Untitled opportunity',
    summary: item.description || item.title || 'Public search result',
    url: item.url || '',
    publishedAt: item.age,
    confidence: item.url && item.description ? 0.72 : 0.5
  }))
}

const searchGreenhouse = async (job: OpportunitySearchJobV2) => {
  const targets = job.providerTargets.filter((item) => item.provider === 'greenhouse')
  const candidates: ProviderCandidate[] = []
  for (const { target } of targets.slice(0, 5)) {
    const data = (await boundedFetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(target)}/jobs?content=true`
    )) as { jobs?: Array<{ id: number; title?: string; absolute_url?: string; updated_at?: string; content?: string; location?: { name?: string } }> }
    for (const item of (data.jobs ?? []).slice(0, 50)) {
      const haystack = `${item.title ?? ''} ${item.content ?? ''}`.toLowerCase()
      if (!job.query.toLowerCase().split(/\s+/).some((term) => haystack.includes(term))) continue
      candidates.push({
        provider: 'greenhouse',
        providerSourceId: String(item.id),
        partnerName: target,
        title: item.title || 'Untitled role',
        summary: [item.location?.name, item.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600)].filter(Boolean).join(' — '),
        url: item.absolute_url || '',
        publishedAt: item.updated_at,
        confidence: 0.92
      })
    }
  }
  return candidates
}

const searchLever = async (job: OpportunitySearchJobV2) => {
  const targets = job.providerTargets.filter((item) => item.provider === 'lever')
  const candidates: ProviderCandidate[] = []
  for (const { target } of targets.slice(0, 5)) {
    const data = (await boundedFetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(target)}?mode=json`
    )) as Array<{ id?: string; text?: string; hostedUrl?: string; descriptionPlain?: string; createdAt?: number; categories?: { location?: string } }>
    for (const item of data.slice(0, 50)) {
      const haystack = `${item.text ?? ''} ${item.descriptionPlain ?? ''}`.toLowerCase()
      if (!job.query.toLowerCase().split(/\s+/).some((term) => haystack.includes(term))) continue
      candidates.push({
        provider: 'lever',
        providerSourceId: item.id || item.hostedUrl || randomUUID(),
        partnerName: target,
        title: item.text || 'Untitled role',
        summary: [item.categories?.location, item.descriptionPlain?.slice(0, 600)].filter(Boolean).join(' — '),
        url: item.hostedUrl || '',
        publishedAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
        confidence: 0.92
      })
    }
  }
  return candidates
}

const searchJobSpy = async (job: OpportunitySearchJobV2) => {
  const python = process.env.COQPI_JOBSPY_PYTHON?.trim()
  if (!python) throw new Error('COQPI_JOBSPY_PYTHON is not configured.')
  const script = app?.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', 'jobspy_adapter.py')
    : path.resolve(process.cwd(), 'scripts', 'jobspy_adapter.py')
  const payload = JSON.stringify({
    query: job.query,
    location: job.geography[0] ?? '',
    country: job.geography[0] ?? 'France',
    limit: 10,
    hoursOld: job.recencyDays * 24,
    sites: ['indeed', 'google']
  })
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, [script], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => child.kill('SIGTERM'), 30_000)
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || stdout || `JobSpy exited with ${code}.`))
    })
    child.stdin.end(payload)
  })
  const parsed = JSON.parse(output) as { results?: Array<{ id?: string; site?: string; title?: string; company?: string; location?: string; description?: string; jobUrl?: string; datePosted?: string }> }
  return (parsed.results ?? []).map((item, index): ProviderCandidate => ({
    provider: 'jobspy_optional',
    providerSourceId: item.id || item.jobUrl || `jobspy-${index}`,
    partnerName: item.company || item.site || 'Unknown company',
    title: item.title || 'Untitled role',
    summary: [item.location, item.description].filter(Boolean).join(' — '),
    url: item.jobUrl || '',
    publishedAt: item.datePosted,
    confidence: item.jobUrl && item.company ? 0.78 : 0.58
  }))
}

const providerSearch = async (
  provider: SearchProviderId,
  job: OpportunitySearchJobV2
) => {
  if (provider === 'brave_web') return searchBrave(job)
  if (provider === 'greenhouse') return searchGreenhouse(job)
  if (provider === 'lever') return searchLever(job)
  return searchJobSpy(job)
}

const candidateDraft = (candidate: ProviderCandidate): FinderCandidateResultDraft => ({
  sourceId: `${candidate.provider}:${candidate.providerSourceId}`,
  partnerName: candidate.partnerName,
  title: candidate.title,
  summary: candidate.summary || candidate.title,
  links: candidate.url ? [canonicalizeOpportunityUrl(candidate.url)] : [],
  whyRelevant: 'Discovered from the configured opportunity search query.',
  missingInfo: candidate.confidence < 0.7 ? 'Review source details before outreach.' : '',
  nextAction: 'Review evidence and decide whether to import.'
})

const enrichCandidateDraft = async (
  jobId: string,
  candidate: ProviderCandidate
) => {
  const fallback = candidateDraft(candidate)
  if (candidate.provider !== 'brave_web' || !candidate.url) return fallback
  try {
    const preview = await previewFinderPublicPageSource(jobId, candidate.url)
    const parsed = preview.candidates.find((item) => !item.duplicate)?.draft
    return parsed ? {
      ...fallback,
      ...parsed,
      sourceId: fallback.sourceId,
      links: Array.from(new Set([...(fallback.links ?? []), ...(parsed.links ?? [])]))
    } : fallback
  } catch {
    return fallback
  }
}

const asOpportunityCandidate = (
  stored: Awaited<ReturnType<typeof addFinderCandidateResult>>['store']['results'][number],
  candidate: ProviderCandidate,
  now: string
): OpportunityCandidateV2 => ({
  ...stored,
  version: 2,
  canonicalUrl: canonicalizeOpportunityUrl(candidate.url),
  provider: candidate.provider,
  providerSourceId: candidate.providerSourceId,
  evidence: [{
    label: 'Discovery result',
    value: candidate.summary.slice(0, 800),
    ...(candidate.url ? { sourceUrl: canonicalizeOpportunityUrl(candidate.url) } : {}),
    observedAt: now
  }],
  ...(candidate.publishedAt ? { publishedAt: candidate.publishedAt } : {}),
  ...(candidate.deadlineAt ? { deadlineAt: candidate.deadlineAt } : {}),
  firstSeenAt: now,
  lastSeenAt: now,
  sourceConfidence: candidate.confidence,
  discoveryContentHash: sha256({
    title: candidate.title,
    partnerName: candidate.partnerName,
    canonicalUrl: canonicalizeOpportunityUrl(candidate.url),
    summary: candidate.summary
  })
})

export const runOpportunityDiscovery = async (
  jobId: string
): Promise<SearchRunResult> => {
  const store = await getOpportunityStore()
  const jobIndex = store.jobs.findIndex((item) => item.id === jobId)
  if (jobIndex < 0) throw new Error('Finder search job not found.')
  const job = store.jobs[jobIndex]
  if (job.status === 'rejected') throw new Error('Rejected jobs cannot run discovery.')

  const startedAt = new Date().toISOString()
  job.runStatus = 'running'
  const providerCounts: Partial<Record<SearchProviderId, number>> = {}
  const errors: SearchProviderError[] = []
  const raw: ProviderCandidate[] = []

  for (const provider of job.sourceAdapters.slice(0, 4)) {
    try {
      const found = await providerSearch(provider, job)
      providerCounts[provider] = found.length
      raw.push(...found)
    } catch (error) {
      errors.push({
        provider,
        code: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'provider_error',
        message: error instanceof Error ? error.message : 'Unknown provider error.'
      })
    }
  }

  const filteredRaw = raw.filter((candidate) => {
    const haystack = `${candidate.partnerName} ${candidate.title} ${candidate.summary}`.toLowerCase()
    return !job.exclusionTerms.some((term) => haystack.includes(term.toLowerCase()))
  })
  const existingKeys = new Set(
    store.results.flatMap((item) => [
      `${item.provider}:${item.providerSourceId}`,
      item.canonicalUrl,
      item.contentHash
    ]).filter(Boolean)
  )
  const provisional = filteredRaw.map((candidate, index): OpportunityCandidateV2 => {
    const canonicalUrl = canonicalizeOpportunityUrl(candidate.url)
    const contentHash = sha256({ title: candidate.title, partnerName: candidate.partnerName, canonicalUrl, summary: candidate.summary })
    return {
      version: 2,
      id: `pending-${index}`,
      jobId,
      kind: job.kind,
      ...candidateDraft(candidate),
      canonicalUrl,
      provider: candidate.provider,
      providerSourceId: candidate.providerSourceId,
      evidence: [],
      firstSeenAt: startedAt,
      lastSeenAt: startedAt,
      sourceConfidence: candidate.confidence,
      discoveryContentHash: contentHash,
      status: 'ready',
      decision: { state: 'auto', updatedAt: startedAt },
      createdAt: startedAt,
      ownerId: 'owner',
      provenance: { sourceId: `${candidate.provider}:${candidate.providerSourceId}`, locatorSha256: sha256(candidate.url) },
      contentHash,
      statusHistory: []
    }
  })
  const localDeduped = deduplicateOpportunityCandidates(provisional).unique
  const existingByProvider = new Map(
    store.results.map((item) => [`${item.provider}:${item.providerSourceId}`, item])
  )
  const existingByUrl = new Map(
    store.results.filter((item) => item.canonicalUrl).map((item) => [item.canonicalUrl, item])
  )
  const observedUpdates = new Map<string, OpportunityCandidateV2>()
  let changedCount = 0
  let unchangedCount = 0
  for (const candidate of localDeduped) {
    const existing =
      existingByProvider.get(`${candidate.provider}:${candidate.providerSourceId}`) ??
      existingByUrl.get(candidate.canonicalUrl)
    if (!existing) continue
    const changed = existing.discoveryContentHash !== candidate.discoveryContentHash
    if (changed) changedCount += 1
    else unchangedCount += 1
    observedUpdates.set(existing.id, {
      ...existing,
      ...(changed
        ? {
            title: candidate.title,
            partnerName: candidate.partnerName,
            summary: candidate.summary,
            canonicalUrl: candidate.canonicalUrl,
            links: candidate.links,
            discoveryContentHash: candidate.discoveryContentHash
          }
        : {}),
      lastSeenAt: startedAt
    })
  }
  const acceptedRaw = filteredRaw.filter((_, index) => {
    const candidate = provisional[index]
    return localDeduped.includes(candidate) &&
      ![`${candidate.provider}:${candidate.providerSourceId}`, candidate.canonicalUrl, candidate.contentHash].some((key) => key && existingKeys.has(key))
  })
  const added: OpportunityCandidateV2[] = []
  for (const candidate of acceptedRaw) {
    const result = await addFinderCandidateResult(
      jobId,
      await enrichCandidateDraft(jobId, candidate)
    )
    const stored = result.store.results.find(
      (item) => item.sourceId === `${candidate.provider}:${candidate.providerSourceId}`
    )
    if (stored) added.push(asOpportunityCandidate(stored, candidate, startedAt))
  }

  const completedAt = new Date().toISOString()
  const status: OpportunityRunStatus =
    errors.length === 0 ? 'succeeded' : added.length > 0 ? 'partial' : 'failed'
  const run: SearchRunResult = {
    jobId,
    runId: randomUUID(),
    startedAt,
    completedAt,
    status,
    query: job.query,
    providers: job.sourceAdapters,
    providerCounts,
    candidates: [...added, ...observedUpdates.values()],
    errors,
    newCount: added.length,
    changedCount,
    unchangedCount: unchangedCount + (filteredRaw.length - localDeduped.length)
  }
  const refreshed = await getOpportunityStore()
  const refreshedJob = refreshed.jobs.find((item) => item.id === jobId)
  if (refreshedJob) {
    refreshedJob.runStatus = status
    refreshedJob.schedule.lastRunAt = completedAt
  }
  refreshed.results = refreshed.results.map((item) =>
    added.find((candidate) => candidate.id === item.id) ??
    observedUpdates.get(item.id) ??
    item
  )
  refreshed.runs = [run, ...refreshed.runs].slice(0, 500)
  await writeStore(refreshed, { type: 'discovery_run_completed', runId: run.runId, jobId, status })
  return run
}

const localDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)

export const runDueOpportunityJobs = async (now = new Date()) => {
  const store = await getOpportunityStore()
  const today = localDate(now)
  const due = store.jobs.filter((job) =>
    job.schedule.enabled &&
    job.schedule.cadence === 'daily' &&
    job.schedule.lastCatchUpDate !== today &&
    (job.schedule.lastRunAt
      ? localDate(new Date(job.schedule.lastRunAt)) < today
      : now.getHours() >= job.schedule.localHour)
  )
  const results: SearchRunResult[] = []
  for (const job of due) {
    const run = await runOpportunityDiscovery(job.id)
    results.push(run)
    const refreshed = await getOpportunityStore()
    const storedJob = refreshed.jobs.find((item) => item.id === job.id)
    if (storedJob) storedJob.schedule.lastCatchUpDate = today
    await writeStore(refreshed, { type: 'daily_catch_up_recorded', jobId: job.id, localDate: today })
  }
  return results
}

export const assembleOpportunityApplicationPack = async ({
  candidateId,
  ownerFactsToUse,
  ownerFactsToAvoid,
  materialIds
}: {
  candidateId: string
  ownerFactsToUse: string[]
  ownerFactsToAvoid: string[]
  materialIds?: string[]
}) => {
  const store = await getOpportunityStore()
  const candidate = store.results.find((item) => item.id === candidateId)
  if (!candidate) throw new Error('Opportunity candidate not found.')
  const pack = createOpportunityApplicationPack({
    id: randomUUID(),
    now: new Date().toISOString(),
    candidate,
    ownerFactsToUse,
    ownerFactsToAvoid,
    materialIds
  })
  store.applicationPacks = [pack, ...store.applicationPacks]
  await writeStore(store, {
    type: 'application_pack_assembled',
    packId: pack.id,
    candidateId,
    status: pack.status,
    contentHash: pack.contentHash
  })
  return pack
}

export const saveLocalMailDraft = async ({
  applicationPackId,
  recipient,
  subject,
  body,
  attachmentPaths
}: {
  applicationPackId: string
  recipient: string
  subject: string
  body: string
  attachmentPaths?: string[]
}) => {
  const store = await getOpportunityStore()
  const applicationPack = store.applicationPacks.find(
    (item) => item.id === applicationPackId
  )
  if (!applicationPack) throw new Error('Opportunity application pack not found.')
  const draft = createMailDraftRecord({
    id: randomUUID(),
    now: new Date().toISOString(),
    applicationPack,
    recipient,
    subject,
    body,
    attachmentPaths
  })
  store.mailDrafts = [draft, ...store.mailDrafts]
  await writeStore(store, {
    type: 'mail_draft_saved',
    draftId: draft.id,
    applicationPackId,
    messageHash: draft.messageHash
  })
  return draft
}

export const updateLocalMailDraft = async (
  id: string,
  patch: Pick<MailDraftRecord, 'recipient' | 'subject' | 'body' | 'attachmentPaths'>
) => {
  const store = await getOpportunityStore()
  const index = store.mailDrafts.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('Mail draft not found.')
  const current = store.mailDrafts[index]
  const applicationPack = store.applicationPacks.find(
    (item) => item.id === current.applicationPackId
  )
  if (!applicationPack) throw new Error('Opportunity application pack not found.')
  const updated = createMailDraftRecord({
    id: current.id,
    now: new Date().toISOString(),
    applicationPack,
    ...patch
  })
  updated.createdAt = current.createdAt
  store.mailDrafts[index] = updated
  await writeStore(store, {
    type: 'mail_draft_edited',
    draftId: id,
    messageHash: updated.messageHash,
    priorApprovalsInvalidated: true
  })
  return updated
}

export const approveMailDraftBatch = async (draftIds: string[]) => {
  const store = await getOpportunityStore()
  const selected = draftIds.map((id) =>
    store.mailDrafts.find((draft) => draft.id === id)
  )
  if (selected.some((draft) => !draft)) throw new Error('One or more mail drafts are missing.')
  const approval = createBatchSendApproval({
    id: randomUUID(),
    now: new Date().toISOString(),
    messageHashes: selected.map((draft) => draft!.messageHash)
  })
  store.sendApprovals = [approval, ...store.sendApprovals]
  store.mailDrafts = store.mailDrafts.map((draft) =>
    draftIds.includes(draft.id) ? { ...draft, status: 'approved' as const } : draft
  )
  await writeStore(store, {
    type: 'mail_batch_approved',
    approvalId: approval.id,
    messageHashes: approval.messageHashes
  })
  return approval
}

export const persistMailDraftRecord = async (draft: MailDraftRecord) => {
  const store = await getOpportunityStore()
  store.mailDrafts = [
    draft,
    ...store.mailDrafts.filter((item) => item.id !== draft.id)
  ]
  await writeStore(store, {
    type: 'mail_draft_status_changed',
    draftId: draft.id,
    status: draft.status,
    messageHash: draft.messageHash
  })
  return draft
}

export const consumeBatchApproval = async (approval: BatchSendApproval) => {
  const store = await getOpportunityStore()
  store.sendApprovals = store.sendApprovals.map((item) =>
    item.id === approval.id ? approval : item
  )
  await writeStore(store, {
    type: 'mail_batch_approval_consumed',
    approvalId: approval.id
  })
}

export const saveCommunicationThreadSummary = async (
  summary: CommunicationThreadSummary
) => {
  const store = await getOpportunityStore()
  store.threadSummaries = [
    summary,
    ...store.threadSummaries.filter((item) => item.id !== summary.id)
  ]
  await writeStore(store, {
    type: 'thread_summary_saved',
    summaryId: summary.id,
    mailDraftId: summary.mailDraftId,
    classification: summary.classification,
    evidenceHash: summary.evidenceHash
  })
  return summary
}

export const createReplyDraftFromThread = async ({
  threadSummaryId,
  body
}: {
  threadSummaryId: string
  body?: string
}) => {
  const store = await getOpportunityStore()
  const summary = store.threadSummaries.find((item) => item.id === threadSummaryId)
  if (!summary) throw new Error('Communication thread summary not found.')
  const original = store.mailDrafts.find((item) => item.id === summary.mailDraftId)
  if (!original) throw new Error('Original CoqPi mail draft not found.')
  const applicationPack = store.applicationPacks.find(
    (item) => item.id === original.applicationPackId
  )
  if (!applicationPack) throw new Error('Application pack not found.')
  const replyBody = body?.trim() || [
    'Hello,',
    'Thank you for your reply.',
    summary.classification === 'call_proposed'
      ? 'The proposed call is relevant. I will confirm the exact time and meeting details separately.'
      : 'I would be glad to clarify the open points and agree on the next step.',
    'Best regards'
  ].join('\n\n')
  const draft = createMailDraftRecord({
    id: randomUUID(),
    now: new Date().toISOString(),
    applicationPack,
    recipient: summary.sender.match(/<([^>]+)>/)?.[1] ?? summary.sender,
    subject: original.subject.toLowerCase().startsWith('re:')
      ? original.subject
      : `Re: ${original.subject}`,
    body: replyBody
  })
  draft.gmailThreadId = original.gmailThreadId
  store.mailDrafts = [draft, ...store.mailDrafts]
  await writeStore(store, {
    type: 'reply_draft_saved',
    draftId: draft.id,
    threadSummaryId,
    messageHash: draft.messageHash
  })
  return draft
}

export const createFollowUpDraftFromSessionSummary = async ({
  sessionSummaryId,
  applicationPackId,
  recipient,
  body
}: {
  sessionSummaryId: string
  applicationPackId: string
  recipient: string
  body?: string
}) => {
  const summaries = await getSessionSummaries({ limit: 100 })
  const summary = summaries.summaries.find((item) => item.id === sessionSummaryId)
  if (!summary) throw new Error('Owner-confirmed session summary not found.')

  const store = await getOpportunityStore()
  const applicationPack = store.applicationPacks.find(
    (item) => item.id === applicationPackId
  )
  if (!applicationPack) throw new Error('Opportunity application pack not found.')

  const followUpBody = body?.trim() || [
    'Hello,',
    'Thank you for the conversation.',
    summary.confirmedOutcomes.length
      ? `As agreed: ${summary.confirmedOutcomes.join('; ')}.`
      : summary.summary,
    summary.followUps.length
      ? `Next steps: ${summary.followUps.join('; ')}.`
      : 'Please let me know the preferred next step.',
    'Best regards'
  ].filter(Boolean).join('\n\n')

  const draft = createMailDraftRecord({
    id: randomUUID(),
    now: new Date().toISOString(),
    applicationPack,
    recipient,
    subject: `Follow-up: ${summary.title}`,
    body: followUpBody
  })
  store.mailDrafts = [draft, ...store.mailDrafts]
  await writeStore(store, {
    type: 'post_call_follow_up_draft_saved',
    draftId: draft.id,
    sessionSummaryId,
    applicationPackId,
    messageHash: draft.messageHash
  })
  return draft
}

export const saveCalendarProposal = async (proposal: CalendarProposal) => {
  const store = await getOpportunityStore()
  store.calendarProposals = [
    proposal,
    ...store.calendarProposals.filter((item) => item.id !== proposal.id)
  ]
  await writeStore(store, {
    type: 'calendar_proposal_saved',
    proposalId: proposal.id,
    status: proposal.status,
    contentHash: proposal.contentHash
  })
  return proposal
}

export const getOpportunityMetrics = async (): Promise<OpportunityMetrics> => {
  const store = await getOpportunityStore()
  return {
    found: store.results.length,
    reviewed: store.results.filter((item) => item.decision.state !== 'auto').length,
    approved: store.mailDrafts.filter((item) => ['approved', 'sent'].includes(item.status)).length,
    sent: store.mailDrafts.filter((item) => item.status === 'sent').length,
    replied: store.threadSummaries.length,
    callsPlanned: store.calendarProposals.filter((item) => item.status === 'created').length
  }
}

export const buildOpportunitySessionHandoff = async ({
  applicationPackId,
  threadSummaryId,
  calendarProposalId
}: {
  applicationPackId?: string
  threadSummaryId?: string
  calendarProposalId?: string
}) => {
  const store = await getOpportunityStore()
  const pack = store.applicationPacks.find((item) => item.id === applicationPackId)
  const thread = store.threadSummaries.find((item) => item.id === threadSummaryId)
  const calendar = store.calendarProposals.find((item) => item.id === calendarProposalId)
  if (!pack || pack.status !== 'ready') {
    return {
      included: false,
      reason: applicationPackId ? 'selected application pack is missing or needs review' : 'no application pack selected',
      text: ''
    }
  }
  const candidate = store.results.find((item) => item.id === pack.candidateId)
  if (!candidate) return { included: false, reason: 'application pack target is missing', text: '' }
  const lines = [
    `Selected opportunity: ${candidate.partnerName} — ${candidate.title}`,
    `Target evidence: ${pack.targetFacts.map((fact) => `${fact.label}: ${fact.value}`).join('; ')}`,
    `Verified owner facts allowed for this target: ${pack.ownerFactsToUse.join('; ')}`,
    pack.ownerFactsToAvoid.length ? `Owner facts to avoid: ${pack.ownerFactsToAvoid.join('; ')}` : '',
    `Approved material version IDs: ${pack.materialIds.join(', ') || 'none'}`,
    `Questions prepared: ${pack.questions.join('; ')}`,
    thread ? `Communication status: ${thread.classification}. ${thread.compactSummary}` : '',
    calendar ? `Planned call: ${calendar.startAt} (${calendar.timezone})${calendar.meetingUrl ? `; ${calendar.meetingUrl}` : ''}` : '',
    'Use only these target-specific owner facts. If they do not support an answer, ask a concise clarifying question.'
  ].filter(Boolean)
  return { included: true, reason: 'ready application pack selected', text: lines.join('\n').slice(0, 4000) }
}

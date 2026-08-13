import { createHash } from 'node:crypto'
import type {
  CounterpartyContextPackKind,
  FinderSearchStore,
  StoredFinderCandidateResult,
  StoredFinderOutreachDraft,
  StoredFinderSearchJob
} from './app-types'

export const SEARCH_PROVIDERS = [
  'brave_web',
  'greenhouse',
  'lever',
  'jobspy_optional'
] as const

export type SearchProviderId = (typeof SEARCH_PROVIDERS)[number]
export type OpportunityScenario = 'job' | 'fund' | 'accelerator' | 'partner'
export type OpportunityRunStatus = 'idle' | 'running' | 'succeeded' | 'partial' | 'failed'

export interface OpportunitySearchSchedule {
  enabled: boolean
  cadence: 'manual' | 'daily'
  localHour: number
  lastRunAt?: string
  nextRunAt?: string
  lastCatchUpDate?: string
}

export interface OpportunitySearchJobV2 extends Omit<StoredFinderSearchJob, 'version'> {
  version: 2
  scenario: OpportunityScenario
  geography: string[]
  languages: string[]
  inclusionTerms: string[]
  exclusionTerms: string[]
  recencyDays: number
  sourceAdapters: SearchProviderId[]
  providerTargets: Array<{
    provider: 'greenhouse' | 'lever' | 'jobspy_optional'
    target: string
  }>
  schedule: OpportunitySearchSchedule
  runStatus: OpportunityRunStatus
}

export interface OpportunityEvidence {
  label: string
  value: string
  sourceUrl?: string
  observedAt: string
}

export interface OpportunityCandidateV2
  extends Omit<StoredFinderCandidateResult, 'version'> {
  version: 2
  canonicalUrl: string
  provider: SearchProviderId | 'legacy_import'
  providerSourceId: string
  evidence: OpportunityEvidence[]
  publishedAt?: string
  deadlineAt?: string
  firstSeenAt: string
  lastSeenAt: string
  sourceConfidence: number
  discoveryContentHash: string
}

export interface SearchProviderError {
  provider: SearchProviderId
  code: string
  message: string
}

export interface SearchRunResult {
  jobId: string
  runId: string
  startedAt: string
  completedAt: string
  status: OpportunityRunStatus
  query: string
  providers: SearchProviderId[]
  providerCounts: Partial<Record<SearchProviderId, number>>
  candidates: OpportunityCandidateV2[]
  errors: SearchProviderError[]
  newCount: number
  changedCount: number
  unchangedCount: number
}

export interface SearchProvider {
  id: SearchProviderId
  search(job: OpportunitySearchJobV2, cursor?: string): Promise<SearchRunResult>
}

export interface OpportunityApplicationPack {
  version: 1
  id: string
  candidateId: string
  scenario: OpportunityScenario
  status: 'needs_review' | 'ready'
  targetFacts: OpportunityEvidence[]
  ownerFactsToUse: string[]
  ownerFactsToAvoid: string[]
  opener: string
  motivationLetter: string
  materialIds: string[]
  questions: string[]
  missingInformation: string[]
  confidence: number
  createdAt: string
  contentHash: string
}

export interface MailDraftRecord {
  version: 1
  id: string
  applicationPackId: string
  recipient: string
  subject: string
  body: string
  attachmentPaths: string[]
  messageHash: string
  status: 'local_draft' | 'gmail_draft' | 'approved' | 'sent' | 'failed'
  gmailDraftId?: string
  gmailMessageId?: string
  gmailThreadId?: string
  createdAt: string
  updatedAt: string
}

export interface BatchSendApproval {
  version: 1
  id: string
  messageHashes: string[]
  approvedAt: string
  consumedAt?: string
}

export interface CommunicationThreadSummary {
  version: 1
  id: string
  mailDraftId: string
  gmailThreadId: string
  classification: 'reply' | 'question' | 'positive' | 'call_proposed' | 'rejection' | 'closed'
  compactSummary: string
  sender: string
  occurredAt: string
  evidenceHash: string
  calendarSuggestion?: {
    startAt: string
    endAt: string
    timezone: string
    attendees: string[]
    meetingUrl?: string
  }
}

export interface CalendarProposal {
  version: 1
  id: string
  threadSummaryId: string
  title: string
  startAt: string
  endAt: string
  timezone: string
  attendees: string[]
  meetingUrl?: string
  status: 'draft' | 'approved' | 'created' | 'rejected'
  contentHash: string
  googleEventId?: string
}

export interface OpportunityMetrics {
  found: number
  reviewed: number
  approved: number
  sent: number
  replied: number
  callsPlanned: number
}

export const getRemainingDailySendAllowance = (
  drafts: MailDraftRecord[],
  now: string,
  dailyLimit = 20
) => {
  const day = now.slice(0, 10)
  const sent = drafts.filter(
    (draft) => draft.status === 'sent' && draft.updatedAt.slice(0, 10) === day
  ).length
  return Math.max(0, dailyLimit - sent)
}

export interface GoogleConnectionStatus {
  configured: boolean
  connected: boolean
  mailAuthorized: boolean
  calendarAuthorized: boolean
}

export interface OpportunityStoreV2 {
  version: 2
  jobs: OpportunitySearchJobV2[]
  results: OpportunityCandidateV2[]
  outreachDrafts: StoredFinderOutreachDraft[]
  runs: SearchRunResult[]
  applicationPacks: OpportunityApplicationPack[]
  mailDrafts: MailDraftRecord[]
  sendApprovals: BatchSendApproval[]
  threadSummaries: CommunicationThreadSummary[]
  calendarProposals: CalendarProposal[]
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const scenarioForKind = (kind: CounterpartyContextPackKind): OpportunityScenario =>
  kind === 'investor' ? 'fund' : kind === 'other' ? 'partner' : kind

export const defaultSearchProvidersForScenario = (
  scenario: OpportunityScenario
): SearchProviderId[] =>
  scenario === 'job'
    ? ['brave_web', 'greenhouse', 'lever']
    : ['brave_web']

export const canonicalizeOpportunityUrl = (value: string) => {
  try {
    const url = new URL(value)
    url.hash = ''
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    url.hostname = url.hostname.toLowerCase()
    url.pathname = url.pathname.replace(/\/$/, '') || '/'
    return url.toString()
  } catch {
    return ''
  }
}

const migrateJob = (job: StoredFinderSearchJob): OpportunitySearchJobV2 => {
  const scenario = scenarioForKind(job.kind)
  return {
    ...job,
    version: 2,
    scenario,
    geography: [],
    languages: [],
    inclusionTerms: [],
    exclusionTerms: [],
    recencyDays: 30,
    sourceAdapters: defaultSearchProvidersForScenario(scenario),
    providerTargets: [],
    schedule: { enabled: false, cadence: 'manual', localHour: 9 },
    runStatus: 'idle'
  }
}

const migrateCandidate = (
  result: StoredFinderCandidateResult
): OpportunityCandidateV2 => {
  const canonicalUrl = canonicalizeOpportunityUrl(result.links?.[0] ?? '')
  return {
    ...result,
    version: 2,
    canonicalUrl,
    provider: 'legacy_import',
    providerSourceId: result.sourceId,
    evidence: canonicalUrl
      ? [{ label: 'Legacy source', value: result.summary, sourceUrl: canonicalUrl, observedAt: result.createdAt }]
      : [],
    firstSeenAt: result.createdAt,
    lastSeenAt: result.createdAt,
    sourceConfidence: 0.5,
    discoveryContentHash: result.contentHash
  }
}

export const migrateFinderStoreV1ToV2 = (
  store: FinderSearchStore | OpportunityStoreV2
): OpportunityStoreV2 => {
  if (store.version === 2) {
    return store
  }

  return {
    version: 2,
    jobs: store.jobs.map(migrateJob),
    results: store.results.map(migrateCandidate),
    outreachDrafts: store.outreachDrafts,
    runs: [],
    applicationPacks: [],
    mailDrafts: [],
    sendApprovals: [],
    threadSummaries: [],
    calendarProposals: []
  }
}

export const deduplicateOpportunityCandidates = (
  candidates: OpportunityCandidateV2[]
) => {
  const seenProviderIds = new Set<string>()
  const seenUrls = new Set<string>()
  const seenHashes = new Set<string>()
  const unique: OpportunityCandidateV2[] = []
  const duplicates: OpportunityCandidateV2[] = []

  for (const candidate of candidates) {
    const providerKey = `${candidate.provider}:${candidate.providerSourceId}`
    const isDuplicate =
      seenProviderIds.has(providerKey) ||
      Boolean(candidate.canonicalUrl && seenUrls.has(candidate.canonicalUrl)) ||
      seenHashes.has(candidate.contentHash)

    if (isDuplicate) {
      duplicates.push(candidate)
      continue
    }

    unique.push(candidate)
    seenProviderIds.add(providerKey)
    if (candidate.canonicalUrl) seenUrls.add(candidate.canonicalUrl)
    seenHashes.add(candidate.contentHash)
  }

  return { unique, duplicates }
}

export const createBatchSendApproval = ({
  id,
  now,
  messageHashes
}: {
  id: string
  now: string
  messageHashes: string[]
}): BatchSendApproval => ({
  version: 1,
  id,
  approvedAt: now,
  messageHashes: Array.from(new Set(messageHashes)).sort()
})

export const isBatchSendApprovalValid = (
  approval: BatchSendApproval,
  messageHashes: string[]
) =>
  !approval.consumedAt &&
  hash(approval.messageHashes) ===
    hash(Array.from(new Set(messageHashes)).sort())

const normalizedStrings = (values: string[], maxLength = 800) =>
  Array.from(
    new Set(values.map((value) => value.trim().slice(0, maxLength)).filter(Boolean))
  )

export const createOpportunityApplicationPack = ({
  id,
  now,
  candidate,
  ownerFactsToUse,
  ownerFactsToAvoid,
  materialIds = []
}: {
  id: string
  now: string
  candidate: OpportunityCandidateV2
  ownerFactsToUse: string[]
  ownerFactsToAvoid: string[]
  materialIds?: string[]
}): OpportunityApplicationPack => {
  const useFacts = normalizedStrings(ownerFactsToUse, 600)
  const avoidFacts = normalizedStrings(ownerFactsToAvoid, 600)
  const missingInformation = [
    ...(candidate.sourceConfidence < 0.65 ? ['Source evidence needs review.'] : []),
    ...(useFacts.length === 0 ? ['Select at least one verified owner fact.'] : []),
    ...(candidate.evidence.length === 0 ? ['Target evidence is missing.'] : [])
  ]
  const confidence = Math.max(
    0,
    Math.min(1, candidate.sourceConfidence * (useFacts.length ? 1 : 0.55))
  )
  const target = candidate.partnerName
  const opportunity = candidate.title
  const opener =
    candidate.kind === 'job'
      ? `Hello, I am interested in the ${opportunity} opportunity at ${target}. ${useFacts[0] ?? 'I would like to clarify how my experience could fit your needs.'}`
      : `Hello, I am reaching out because ${target} appears relevant to ${opportunity}. ${useFacts[0] ?? 'I would like to clarify whether there is a practical fit.'}`
  const motivationLetter = [
    opener,
    candidate.whyRelevant || candidate.summary,
    useFacts.slice(1, 4).join(' '),
    'I would be glad to discuss fit, priorities, and next steps.'
  ].filter(Boolean).join('\n\n')
  const content = {
    candidateId: candidate.id,
    scenario: scenarioForKind(candidate.kind),
    targetFacts: candidate.evidence,
    ownerFactsToUse: useFacts,
    ownerFactsToAvoid: avoidFacts,
    opener,
    motivationLetter,
    materialIds: normalizedStrings(materialIds, 240),
    questions: [
      `What are the current priorities for ${opportunity}?`,
      'What would a successful first three months look like?'
    ],
    missingInformation,
    confidence
  }
  return {
    version: 1,
    id,
    ...content,
    status: missingInformation.length > 0 ? 'needs_review' : 'ready',
    createdAt: now,
    contentHash: hash(content)
  }
}

export const createMailDraftRecord = ({
  id,
  now,
  applicationPack,
  recipient,
  subject,
  body,
  attachmentPaths = []
}: {
  id: string
  now: string
  applicationPack: OpportunityApplicationPack
  recipient: string
  subject: string
  body: string
  attachmentPaths?: string[]
}): MailDraftRecord => {
  const normalized = {
    applicationPackId: applicationPack.id,
    recipient: recipient.trim().toLowerCase(),
    subject: subject.trim().slice(0, 240),
    body: body.trim(),
    attachmentPaths: normalizedStrings(attachmentPaths, 1000)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.recipient)) {
    throw new Error('A valid recipient email is required.')
  }
  if (!normalized.subject || !normalized.body) {
    throw new Error('Mail draft requires subject and body.')
  }
  return {
    version: 1,
    id,
    ...normalized,
    messageHash: hash(normalized),
    status: 'local_draft',
    createdAt: now,
    updatedAt: now
  }
}

export const extractCalendarSuggestion = (
  text: string,
  fallbackTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
): CommunicationThreadSummary['calendarSuggestion'] | undefined => {
  const dateMatch = text.match(
    /\b(20\d{2}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?(?:\s*(Z|[+-]\d{2}:?\d{2}|[A-Za-z]+\/[A-Za-z_]+))?/u
  )
  if (!dateMatch) return undefined
  const timezone = dateMatch[3]?.includes('/') ? dateMatch[3] : fallbackTimezone
  const offset = dateMatch[3] && !dateMatch[3].includes('/') ? dateMatch[3] : ''
  const normalizedOffset = offset && !offset.includes(':') && offset !== 'Z'
    ? `${offset.slice(0, 3)}:${offset.slice(3)}`
    : offset
  const parsed = new Date(`${dateMatch[1]}T${dateMatch[2]}:00${normalizedOffset || ''}`)
  if (Number.isNaN(parsed.getTime())) return undefined
  const meetingUrl = text.match(/https?:\/\/[^\s)>]+/u)?.[0]
  const attendees = Array.from(
    new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [])
  )
  return {
    startAt: parsed.toISOString(),
    endAt: new Date(parsed.getTime() + 45 * 60 * 1000).toISOString(),
    timezone,
    attendees,
    ...(meetingUrl ? { meetingUrl } : {})
  }
}

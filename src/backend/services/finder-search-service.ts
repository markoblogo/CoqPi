import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  FinderCandidateResultDraft,
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
  createFinderOutreachDraft,
  createFinderRecordsFromRunnerPayload,
  createFinderSearchJob,
  updateFinderSearchJobStatus
} from '../../shared/finder-search-module'
import { getAppInfo } from './app-state'

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
      type: 'outreach_draft_recorded'
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
    nextAction: result.nextAction
  }),
  statusHistory: [{ status: result.status, at: result.createdAt, reason }]
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
    warnings: draft.warnings
  })
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

  await writeManifest(store)
  return store
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

  return store.outreachDrafts.some((draft) => draft.id === trimmed)
    ? trimmed
    : ''
}

export const getFinderOutreachDraftById = async (id: string) => {
  const trimmed = typeof id === 'string' ? id.trim() : ''

  if (!trimmed) {
    return null
  }

  const store = await getFinderSearchStoreRaw()

  return store.outreachDrafts.find((draft) => draft.id === trimmed) ?? null
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

export const saveFinderOutreachDraft = async (
  candidateResultId: string
): Promise<FinderSearchStoreResult> => {
  const store = await getFinderSearchStoreRaw()
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

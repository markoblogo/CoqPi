import type {
  FinderCandidateResultDraft,
  FinderOwnerSourceSessionIngressResult
} from '../../shared/app-types'
import { createContextPackDraftFromFinderResult } from '../../shared/finder-search-module'
import { getSessionContextWithImportedCounterpartyPacks } from '../../shared/session-pack-selection'
import {
  getSessionContext,
  saveSessionContext
} from './session-context-service'
import {
  ingestCounterpartyFinderPayloadDrafts
} from './context-source-service'
import {
  ingestFinderManualComplexPageSourceCandidates,
  ingestFinderPublicPageSourceCandidates,
  ingestFinderOwnerPastedSourceCandidates,
  setFinderCandidateResultStatus
} from './finder-search-service'

export const ingestFinderOwnerSourceCandidatesToSession = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[]
): Promise<FinderOwnerSourceSessionIngressResult> => {
  const finderPayload = await ingestFinderOwnerPastedSourceCandidates(jobId, drafts)
  const importedResults = finderPayload.store.results.filter(
    (result) =>
      result.jobId === jobId &&
      drafts.some((draft) => draft.sourceId === result.sourceId)
  )
  const importedPackDrafts = importedResults.map((result) =>
    createContextPackDraftFromFinderResult(result)
  )
  const manifestPayload =
    importedPackDrafts.length > 0
      ? await ingestCounterpartyFinderPayloadDrafts(importedPackDrafts)
        : {
          manifest: {
            version: 1 as const,
            counterpartyPacks: [],
            sources: [],
            knowledgePackLifecycle: []
          }
        }
  const sessionPayload = await getSessionContext()
  const nextContext = getSessionContextWithImportedCounterpartyPacks(
    sessionPayload.context,
    manifestPayload.manifest.counterpartyPacks ?? [],
    importedPackDrafts
  )
  const savedSession = await saveSessionContext(nextContext)

  let nextStore = finderPayload.store

  for (const result of importedResults) {
    const updated = await setFinderCandidateResultStatus(result.id, 'imported')
    nextStore = updated.store
  }

  return {
    store: nextStore,
    manifest: manifestPayload.manifest,
    session: savedSession,
    finderSourceAdapterSummary: finderPayload.finderSourceAdapterSummary,
    importedPackCount: importedPackDrafts.length,
    importedCandidateCount: importedResults.length
  }
}

export const ingestFinderPublicPageCandidatesToSession = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[]
): Promise<FinderOwnerSourceSessionIngressResult> => {
  const finderPayload = await ingestFinderPublicPageSourceCandidates(jobId, drafts)
  const importedResults = finderPayload.store.results.filter(
    (result) =>
      result.jobId === jobId &&
      drafts.some((draft) => draft.sourceId === result.sourceId)
  )
  const importedPackDrafts = importedResults.map((result) =>
    createContextPackDraftFromFinderResult(result)
  )
  const manifestPayload =
    importedPackDrafts.length > 0
      ? await ingestCounterpartyFinderPayloadDrafts(importedPackDrafts)
      : {
          manifest: {
            version: 1 as const,
            counterpartyPacks: [],
            sources: [],
            knowledgePackLifecycle: []
          }
        }
  const sessionPayload = await getSessionContext()
  const nextContext = getSessionContextWithImportedCounterpartyPacks(
    sessionPayload.context,
    manifestPayload.manifest.counterpartyPacks ?? [],
    importedPackDrafts
  )
  const savedSession = await saveSessionContext(nextContext)

  let nextStore = finderPayload.store

  for (const result of importedResults) {
    const updated = await setFinderCandidateResultStatus(result.id, 'imported')
    nextStore = updated.store
  }

  return {
    store: nextStore,
    manifest: manifestPayload.manifest,
    session: savedSession,
    finderSourceAdapterSummary: finderPayload.finderSourceAdapterSummary,
    importedPackCount: importedPackDrafts.length,
    importedCandidateCount: importedResults.length
  }
}

export const ingestFinderManualComplexPageCandidatesToSession = async (
  jobId: string,
  drafts: FinderCandidateResultDraft[]
): Promise<FinderOwnerSourceSessionIngressResult> => {
  const finderPayload = await ingestFinderManualComplexPageSourceCandidates(jobId, drafts)
  const importedResults = finderPayload.store.results.filter(
    (result) =>
      result.jobId === jobId &&
      drafts.some((draft) => draft.sourceId === result.sourceId)
  )
  const importedPackDrafts = importedResults.map((result) =>
    createContextPackDraftFromFinderResult(result)
  )
  const manifestPayload =
    importedPackDrafts.length > 0
      ? await ingestCounterpartyFinderPayloadDrafts(importedPackDrafts)
      : {
          manifest: {
            version: 1 as const,
            counterpartyPacks: [],
            sources: [],
            knowledgePackLifecycle: []
          }
        }
  const sessionPayload = await getSessionContext()
  const nextContext = getSessionContextWithImportedCounterpartyPacks(
    sessionPayload.context,
    manifestPayload.manifest.counterpartyPacks ?? [],
    importedPackDrafts
  )
  const savedSession = await saveSessionContext(nextContext)

  let nextStore = finderPayload.store

  for (const result of importedResults) {
    const updated = await setFinderCandidateResultStatus(result.id, 'imported')
    nextStore = updated.store
  }

  return {
    store: nextStore,
    manifest: manifestPayload.manifest,
    session: savedSession,
    finderSourceAdapterSummary: finderPayload.finderSourceAdapterSummary,
    importedPackCount: importedPackDrafts.length,
    importedCandidateCount: importedResults.length
  }
}

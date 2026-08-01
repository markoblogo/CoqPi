import type {
  FinderCandidateResult,
  FinderOutreachDraft,
  FinderSearchJob
} from './app-types'
import {
  buildFinderCandidateOutreachPipeline,
  type FinderCandidateOutreachPipeline
} from './finder-search-module'

export interface FinderCandidatePipelineSurface {
  pipeline: FinderCandidateOutreachPipeline
  scoreLabel: string
  importLabel: string
  queueLabel: string
  draftLabel: string
  sessionLabel: string
  sessionHint: string
  readinessLabel: 'ready for contact' | 'follow-up ready' | 'needs draft' | 'needs review' | 'enrich first'
  readinessReason: string
  recommendedAction: string
  blockers: string[]
}

const resolveReadiness = (
  pipeline: FinderCandidateOutreachPipeline
): Pick<FinderCandidatePipelineSurface, 'readinessLabel' | 'readinessReason'> => {
  if (pipeline.sessionHandoff.included && pipeline.draft.status === 'ready_for_contact') {
    return {
      readinessLabel: 'ready for contact',
      readinessReason: 'draft ready and included in the next session handoff'
    }
  }

  if (pipeline.sessionHandoff.included && pipeline.sessionHandoff.state === 'follow_up') {
    return {
      readinessLabel: 'follow-up ready',
      readinessReason: 'active contact or follow-up state is included in session context'
    }
  }

  if (pipeline.qualityReview.level === 'weak') {
    return {
      readinessLabel: 'enrich first',
      readinessReason: 'weak candidate evidence blocks reliable outreach or live-session use'
    }
  }

  if (!pipeline.draft.exists) {
    return {
      readinessLabel: 'needs draft',
      readinessReason: 'candidate is usable, but no local outreach draft is saved yet'
    }
  }

  return {
    readinessLabel: 'needs review',
    readinessReason: pipeline.sessionHandoff.hint
  }
}

export const buildFinderCandidatePipelineSurface = ({
  job,
  result,
  draft = null,
  selected = true,
  confirmedWeakImport = false
}: {
  job: FinderSearchJob
  result: FinderCandidateResult
  draft?: FinderOutreachDraft | null
  selected?: boolean
  confirmedWeakImport?: boolean
}): FinderCandidatePipelineSurface => {
  const pipeline = buildFinderCandidateOutreachPipeline({
    job,
    result,
    draft,
    selected,
    confirmedWeakImport
  })
  const readiness = resolveReadiness(pipeline)

  return {
    pipeline,
    scoreLabel: pipeline.score.fitLabel,
    importLabel: `${pipeline.importDecision.tier} · ${pipeline.importDecision.label}`,
    queueLabel: `${pipeline.queue.recommendation} · ${pipeline.queue.priority}`,
    draftLabel: pipeline.draft.exists
      ? `${pipeline.draft.status} · ${pipeline.draft.warnings.length} warning${pipeline.draft.warnings.length === 1 ? '' : 's'}`
      : 'draft missing',
    sessionLabel: pipeline.sessionHandoff.included
      ? `${pipeline.sessionHandoff.state} · included`
      : `${pipeline.sessionHandoff.state} · dropped`,
    sessionHint: pipeline.sessionHandoff.hint,
    readinessLabel: readiness.readinessLabel,
    readinessReason: readiness.readinessReason,
    recommendedAction: pipeline.recommendedAction,
    blockers: pipeline.blockers
  }
}

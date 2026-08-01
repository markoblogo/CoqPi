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
  recommendedAction: string
  blockers: string[]
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
    recommendedAction: pipeline.recommendedAction,
    blockers: pipeline.blockers
  }
}

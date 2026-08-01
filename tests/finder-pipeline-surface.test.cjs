const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createFinderCandidateResult,
  createFinderOutreachDraft,
  createFinderSearchJob
} = require('../dist-electron/shared/finder-search-module.js')
const {
  buildFinderCandidatePipelineSurface
} = require('../dist-electron/shared/finder-pipeline-surface.js')

test('finder pipeline surface exposes score import draft and session labels', () => {
  const job = createFinderSearchJob(
    { kind: 'partner', label: 'Partners', query: 'agri partners france' },
    { id: 'job-surface', now: '2026-07-27T10:00:00.000Z', status: 'ready' }
  )
  const result = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:surface-ready',
      partnerName: 'Surface Partner',
      title: 'Implementation partner',
      summary:
        'Public source. Contact: hello@surface.example. Relevant France implementation partner.',
      context: 'Strong pilot and commodity workflow angle.',
      links: ['https://surface.example'],
      fitScore: 86,
      whyRelevant: 'Matches partner rollout and operational workflow needs.',
      missingInfo: 'Verify pilot budget.',
      nextAction: 'Prepare partner intro and call questions.'
    },
    { id: 'candidate-surface', now: '2026-07-27T10:01:00.000Z' }
  )
  const draft = {
    ...createFinderOutreachDraft(job, result, {
      id: 'draft-surface',
      now: '2026-07-27T10:02:00.000Z'
    }),
    status: 'ready_for_contact',
    statusHistory: [
      {
        status: 'ready_for_contact',
        at: '2026-07-27T10:03:00.000Z',
        reason: 'owner reviewed'
      }
    ]
  }

  const ready = buildFinderCandidatePipelineSurface({ job, result, draft })

  assert.equal(ready.scoreLabel, '86/100 strong')
  assert.match(ready.importLabel, /^ready/)
  assert.equal(ready.queueLabel, 'import · now')
  assert.match(ready.draftLabel, /ready_for_contact/)
  assert.equal(ready.sessionLabel, 'ready · included')
  assert.match(ready.recommendedAction, /Use ready draft in session/)

  const weak = createFinderCandidateResult(
    job,
    {
      sourceId: 'finder:partner:surface-weak',
      partnerName: 'Sparse Partner',
      title: 'Possible partner',
      summary: 'Sparse note only.',
      fitScore: 35
    },
    { id: 'candidate-surface-weak', now: '2026-07-27T10:04:00.000Z' }
  )
  const weakSurface = buildFinderCandidatePipelineSurface({
    job,
    result: weak,
    selected: true,
    confirmedWeakImport: false
  })

  assert.match(weakSurface.importLabel, /^weak/)
  assert.equal(weakSurface.draftLabel, 'draft missing')
  assert.equal(weakSurface.sessionLabel, 'blocked · dropped')
  assert.match(weakSurface.recommendedAction, /Enrich before outreach/)
  assert.ok(weakSurface.blockers.length > 0)
})

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  AUTO_ANALYSIS_DEBOUNCE_MS,
  buildLiveTestCockpitItems,
  buildAutoAnalysisSchedule,
  decideAutoAnalysis,
  getAutoAnalysisTranscriptUtterances,
  getAutoAnalysisUtteranceEligibility,
  isRetryButtonDisabled,
  isRetryNowButtonDisabled,
  getAssistantStatusRecoveryGuide,
  getAssistantRunHint,
  getAssistantStatusLabel
} = require('../dist-electron/shared/live-loop.js')

const makeUtterance = (overrides) => ({
  id: 'u-1',
  speaker: 'other',
  text: 'I have experience with product management.',
  isFinal: true,
  timestampStart: new Date().toISOString(),
  timestampEnd: new Date().toISOString(),
  source: 'mock',
  language: 'en',
  ...overrides
})

const analysisText = 'I have experience with product management and leadership.'

test('auto analyze fingerprint includes selected counterparty pack ids', () => {
  const latestFinal = makeUtterance({ id: 'u-4' })
  const withSelection = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-B', 'pack-A', 'pack-A']
  })

  const withoutSelection = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: []
  })

  assert.equal(withSelection.shouldRun, true)
  assert.equal(withSelection.reason, 'schedule')
  assert.equal(withSelection.fingerprint.includes('::packs:pack-A,pack-B'), true)
  assert.equal(withoutSelection.shouldRun, true)
  assert.equal(withoutSelection.fingerprint.includes('::packs:'), true)
  assert.equal(withSelection.fingerprint, 'u-4::other::I have experience with product management and leadership.::packs:pack-A,pack-B::draft:')
  assert.equal(withoutSelection.fingerprint, 'u-4::other::I have experience with product management and leadership.::packs:::draft:')
})

test('auto analyze re-schedules when selected pack set changes while transcript is same', () => {
  const latestFinal = makeUtterance({ id: 'u-5' })
  const withPackA = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-A']
  })
  assert.equal(withPackA.shouldRun, true)

  const withPackB = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: withPackA.fingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(withPackB.shouldRun, true)
  assert.equal(withPackB.reason, 'schedule')
  assert.equal(withPackB.fingerprint.includes('::packs:pack-B'), true)
})

test('auto analyze re-schedules when selected outreach draft changes while transcript is same', () => {
  const latestFinal = makeUtterance({ id: 'u-5-draft' })
  const withDraftA = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-A'],
    selectedFinderOutreachDraftId: 'draft-A'
  })
  assert.equal(withDraftA.shouldRun, true)

  const withDraftB = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: withDraftA.fingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    selectedCounterpartyPackIds: ['pack-A'],
    selectedFinderOutreachDraftId: 'draft-B'
  })

  assert.equal(withDraftB.shouldRun, true)
  assert.equal(withDraftB.reason, 'schedule')
  assert.equal(withDraftB.fingerprint.includes('::draft:draft-B'), true)
})

test('buildAutoAnalysisSchedule extends delay by remaining cooldown window', () => {
  const latestFinal = makeUtterance({ id: 'u-6' })
  const now = Date.now()
  const base = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: now + 800,
    nowMs: now,
    selectedCounterpartyPackIds: ['pack-A']
  })

  assert.equal(base.shouldRun, true)
  assert.equal(base.delayMs, AUTO_ANALYSIS_DEBOUNCE_MS + 800)

  const delayed = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: now + 800,
    nowMs: now + 500,
    selectedCounterpartyPackIds: ['pack-B']
  })
  assert.equal(delayed.shouldRun, true)
  assert.equal(delayed.delayMs, AUTO_ANALYSIS_DEBOUNCE_MS + 300)
  assert.equal(
    delayed.fingerprint.includes('::packs:pack-B'),
    true
  )
  assert.notEqual(base.fingerprint, delayed.fingerprint)
})

test('selected/unselected change still reschedules during error state', () => {
  const latestFinal = makeUtterance({ id: 'u-7' })
  const failedPackPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'error',
    analysisCooldownUntil: Date.now(),
    selectedCounterpartyPackIds: ['pack-A']
  })

  assert.equal(failedPackPlan.shouldRun, true)
  assert.equal(failedPackPlan.fingerprint.includes('::packs:pack-A'), true)

  const failedRetry = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: failedPackPlan.fingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'error',
    analysisCooldownUntil: Date.now(),
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(failedRetry.shouldRun, true)
  assert.equal(failedRetry.fingerprint.includes('::packs:pack-B'), true)
})

test('App live-loop scheduling replaces pending auto-analysis request when selected packs change', async () => {
  const latestFinal = makeUtterance({ id: 'u-8' })
  const analysisText = latestFinal.text + ' Detailed discussion of this role.'
  const capturedRequests = []
  let autoAnalysisTimeoutId = null
  let scheduledAutoAnalysisFingerprint = null
  let lastAutoAnalyzedFingerprint = null
  const analysisCooldownUntil = Date.now() + 80

  const runAssistantAnalysis = (selectedCounterpartyPackIds) => {
    capturedRequests.push({ selectedCounterpartyPackIds })
    return Promise.resolve(true)
  }

  const schedule = (selectedCounterpartyPackIds) => {
    const plan = buildAutoAnalysisSchedule({
      latestFinalUtterance: latestFinal,
      transcriptText: analysisText,
      lastAutoAnalyzedFingerprint,
      scheduledAutoAnalysisFingerprint,
      assistantState: 'idle',
      analysisCooldownUntil,
      selectedCounterpartyPackIds
    })

    if (!plan.shouldRun || plan.fingerprint === null) {
      return false
    }

    if (autoAnalysisTimeoutId !== null) {
      clearTimeout(autoAnalysisTimeoutId)
    }

    autoAnalysisTimeoutId = setTimeout(() => {
      const activeFingerprint = plan.fingerprint

      if (!activeFingerprint) {
        return
      }

      scheduledAutoAnalysisFingerprint = activeFingerprint

      void runAssistantAnalysis(selectedCounterpartyPackIds).then((didRun) => {
        if (didRun) {
          lastAutoAnalyzedFingerprint = activeFingerprint
        }

        if (scheduledAutoAnalysisFingerprint === activeFingerprint) {
          scheduledAutoAnalysisFingerprint = null
        }
      })
    }, plan.delayMs ?? AUTO_ANALYSIS_DEBOUNCE_MS)

    return true
  }

  const scheduleA = schedule(['pack-A'])
  assert.equal(scheduleA, true)

  const expectedFirstPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now() + 80,
    selectedCounterpartyPackIds: ['pack-A']
  })
  const expectedSecondPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: expectedFirstPlan.fingerprint,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now() + 80,
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(expectedFirstPlan.shouldRun, true)
  assert.equal(expectedSecondPlan.shouldRun, true)
  assert.notEqual(expectedFirstPlan.fingerprint, expectedSecondPlan.fingerprint)

  await new Promise((resolve) => setTimeout(resolve, 40))

  const scheduleB = schedule(['pack-B'])
  assert.equal(scheduleB, true)

  await new Promise((resolve) => setTimeout(resolve, (AUTO_ANALYSIS_DEBOUNCE_MS + 80) + 120))

  if (autoAnalysisTimeoutId !== null) {
    clearTimeout(autoAnalysisTimeoutId)
    autoAnalysisTimeoutId = null
  }

  assert.equal(capturedRequests.length, 1)
  assert.equal(capturedRequests[0].selectedCounterpartyPackIds.join(','), 'pack-B')
})

test('selected change during in-flight analysis retries with latest pack after status error', async () => {
  const latestFinal = makeUtterance({ id: 'u-9' })
  const analysisText = latestFinal.text + ' Need to follow up.'
  const capturedRequests = []
  let autoAnalysisTimeoutId = null
  let scheduledAutoAnalysisFingerprint = null
  let lastAutoAnalyzedFingerprint = null
  let assistantState = 'idle'
  let selectedCounterpartyPackIds = ['pack-A']
  let firstRunResolver = null

  const firstPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now() + 20
  })

  const secondPlan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: firstPlan.fingerprint,
    assistantState: 'error',
    analysisCooldownUntil: Date.now() + 20,
    selectedCounterpartyPackIds: ['pack-B']
  })

  assert.equal(firstPlan.shouldRun, true)
  assert.equal(secondPlan.shouldRun, true)
  assert.notEqual(firstPlan.fingerprint, secondPlan.fingerprint)

  const runAssistantAnalysis = () =>
    new Promise((resolve) => {
      capturedRequests.push(selectedCounterpartyPackIds)

      if (selectedCounterpartyPackIds[0] === 'pack-A') {
        firstRunResolver = resolve
        return
      }

      assistantState = 'done'
      resolve(true)
    })

  const schedule = () => {
    const plan = buildAutoAnalysisSchedule({
      latestFinalUtterance: latestFinal,
      transcriptText: analysisText,
      lastAutoAnalyzedFingerprint,
      scheduledAutoAnalysisFingerprint,
      assistantState,
      analysisCooldownUntil: Date.now() + 20,
      selectedCounterpartyPackIds
    })

    if (!plan.shouldRun || plan.fingerprint === null) {
      return false
    }

    if (autoAnalysisTimeoutId !== null) {
      clearTimeout(autoAnalysisTimeoutId)
    }

    autoAnalysisTimeoutId = setTimeout(() => {
      const activeFingerprint = plan.fingerprint

      if (activeFingerprint === null) {
        return
      }

      scheduledAutoAnalysisFingerprint = activeFingerprint
      assistantState = 'analyzing'

      void runAssistantAnalysis().then((didRun) => {
        if (didRun) {
          lastAutoAnalyzedFingerprint = activeFingerprint
        }

        if (scheduledAutoAnalysisFingerprint === activeFingerprint) {
          scheduledAutoAnalysisFingerprint = null
        }

        assistantState = didRun ? 'done' : 'error'
      })
    }, plan.delayMs ?? AUTO_ANALYSIS_DEBOUNCE_MS)

    return true
  }

  assert.equal(schedule(), true)
  assert.equal(assistantState, 'idle')
  await new Promise((resolve) =>
    setTimeout(resolve, (firstPlan.delayMs ?? AUTO_ANALYSIS_DEBOUNCE_MS) + 60)
  )

  assert.equal(capturedRequests.length, 1)
  assert.deepEqual(capturedRequests[0], ['pack-A'])

  // Request is in-flight while assistant state is analyzing.
  assert.equal(assistantState, 'analyzing')

  // Simulate status switch to error and selected pack change while analyze is still running.
  selectedCounterpartyPackIds = ['pack-B']
  assistantState = 'error'
  assert.equal(schedule(), true)

  assert.equal(firstRunResolver !== null, true)
  firstRunResolver(false)
  firstRunResolver = null

  await new Promise((resolve) =>
    setTimeout(resolve, (secondPlan.delayMs ?? AUTO_ANALYSIS_DEBOUNCE_MS) + 120)
  )

  if (autoAnalysisTimeoutId !== null) {
    clearTimeout(autoAnalysisTimeoutId)
    autoAnalysisTimeoutId = null
  }

  assert.equal(capturedRequests.length, 2)
  assert.deepEqual(capturedRequests[1], ['pack-B'])
  assert.equal(lastAutoAnalyzedFingerprint, secondPlan.fingerprint)
  assert.equal(assistantState, 'done')
})

test('retry now bypasses cooldown and uses latest selected packs', async () => {
  let assistantState = 'error'
  let selectedCounterpartyPackIds = ['pack-A']
  const capturedRequests = []
  const stateTransitions = []
  const runStatus = getAssistantStatusLabel(
    assistantState,
    'prev-id',
    'live-id',
    'provider_not_retryable'
  )

  const runManualRetryNow = () => {
    if (assistantState === 'analyzing') {
      stateTransitions.push('blocked-by-state')
      return Promise.resolve(false)
    }

    // Retry-now intentionally ignores cooldown to keep the user-provided action explicit.
    stateTransitions.push(
      `run:${selectedCounterpartyPackIds.join(',')}`
    )
    capturedRequests.push([...selectedCounterpartyPackIds])
    assistantState = 'analyzing'
    stateTransitions.push('analyzing')

    return new Promise((resolve) => {
      setTimeout(() => {
        assistantState = 'done'
        stateTransitions.push('done')
        resolve(true)
      }, 10)
    })
  }

  assert.equal(runStatus.label, 'Retry blocked')
  assert.equal(runStatus.classNameSuffix, 'retry-blocked')

  const firstAttempt = await runManualRetryNow()

  assert.equal(firstAttempt, true)
  assert.equal(assistantState, 'done')
  assert.deepEqual(capturedRequests, [['pack-A']])

  selectedCounterpartyPackIds = ['pack-B']

  const secondAttempt = runManualRetryNow()

  assert.equal(assistantState, 'analyzing')

  const secondResult = await secondAttempt

  assert.equal(secondResult, true)
  assert.equal(assistantState, 'done')
  assert.deepEqual(capturedRequests, [['pack-A'], ['pack-B']])
  assert.equal(
    stateTransitions.join(' -> '),
    'run:pack-A -> analyzing -> done -> run:pack-B -> analyzing -> done'
  )
})

test('auto analyze dedupe does not rerun on repeated other final utterance', () => {
  const latestFinal = makeUtterance({ id: 'u-1' })
  const first = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(first.shouldRun, true)
  assert.equal(first.reason, 'schedule')
  assert.equal(typeof first.fingerprint, 'string')

  const repeated = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: first.fingerprint ?? null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(repeated.shouldRun, false)
  assert.equal(repeated.reason, 'already-analyzed')
})

test('auto analyze ignores busy assistant and avoids duplicate scheduling', () => {
  const latestFinal = makeUtterance({ id: 'u-2' })
  const busy = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'analyzing'
  })

  assert.equal(busy.shouldRun, false)
  assert.equal(busy.reason, 'assistant-busy')
  assert.equal(typeof busy.fingerprint, 'string')
})

test('auto analyze skips when same utterance is already scheduled before debounce', () => {
  const latestFinal = makeUtterance({ id: 'u-3' })
  const first = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(first.shouldRun, true)
  assert.equal(first.reason, 'schedule')

  const scheduled = decideAutoAnalysis({
    latestFinalUtterance: latestFinal,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: first.fingerprint,
    assistantState: 'idle'
  })

  assert.equal(scheduled.shouldRun, false)
  assert.equal(scheduled.reason, 'already-scheduled')
  assert.equal(scheduled.fingerprint, first.fingerprint)
})

test('auto analyze no-final utterance does not schedule analysis', () => {
  const noDecision = decideAutoAnalysis({
    latestFinalUtterance: undefined,
    transcriptText: analysisText,
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(noDecision.shouldRun, false)
  assert.equal(noDecision.reason, 'no-final')
  assert.equal(noDecision.fingerprint, null)
})

test('auto analyze ignores explicit non EN/FR background speech', () => {
  const russianBackground = makeUtterance({
    id: 'u-ru',
    language: 'ru',
    text: 'Сделай мне пожалуйста чай.'
  })

  const eligibility = getAutoAnalysisUtteranceEligibility(
    russianBackground,
    'auto'
  )
  assert.equal(eligibility.eligible, false)
  assert.equal(eligibility.reason, 'unsupported-language')

  const decision = decideAutoAnalysis({
    latestFinalUtterance: russianBackground,
    transcriptText: russianBackground.text,
    callLanguage: 'auto',
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(decision.shouldRun, false)
  assert.equal(decision.reason, 'unsupported-language')
  assert.equal(decision.fingerprint, null)
})

test('auto analyze allows unknown-language Latin transcript in Auto mode', () => {
  const unknownEnglish = makeUtterance({
    id: 'u-auto-unknown',
    language: 'unknown',
    text: 'Can you describe your product management experience?'
  })

  const eligibility = getAutoAnalysisUtteranceEligibility(unknownEnglish, 'auto')
  assert.equal(eligibility.eligible, true)
  assert.equal(eligibility.reason, null)

  const plan = buildAutoAnalysisSchedule({
    latestFinalUtterance: unknownEnglish,
    transcriptText: unknownEnglish.text,
    callLanguage: 'auto',
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now()
  })

  assert.equal(plan.shouldRun, true)
  assert.equal(plan.reason, 'schedule')
  assert.match(plan.fingerprint ?? '', /u-auto-unknown::other::/)
})

test('auto analyze skips too-short transcript noise', () => {
  const shortNoise = makeUtterance({
    id: 'u-short',
    language: 'unknown',
    text: 'ok'
  })

  const decision = decideAutoAnalysis({
    latestFinalUtterance: shortNoise,
    transcriptText: shortNoise.text,
    callLanguage: 'auto',
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle'
  })

  assert.equal(decision.shouldRun, false)
  assert.equal(decision.reason, 'too-short-transcript')
  assert.equal(decision.fingerprint, null)
})

test('auto analyze keeps latest eligible utterance when ignored background arrives', () => {
  const englishQuestion = makeUtterance({
    id: 'u-eligible',
    language: 'en',
    text: 'Can you describe your product management background?'
  })
  const ignoredBackground = makeUtterance({
    id: 'u-ignored',
    language: 'ru',
    text: 'Сделай мне пожалуйста чай.'
  })
  const utterances = [englishQuestion, ignoredBackground]
  const latestEligible = [...utterances]
    .reverse()
    .find((utterance) =>
      getAutoAnalysisUtteranceEligibility(utterance, 'auto').eligible
    )

  assert.equal(latestEligible?.id, 'u-eligible')

  const plan = buildAutoAnalysisSchedule({
    latestFinalUtterance: latestEligible,
    transcriptText: utterances.map((utterance) => utterance.text).join('\n'),
    callLanguage: 'auto',
    lastAutoAnalyzedFingerprint: null,
    scheduledAutoAnalysisFingerprint: null,
    assistantState: 'idle',
    analysisCooldownUntil: Date.now()
  })

  assert.equal(plan.shouldRun, true)
  assert.equal(plan.reason, 'schedule')
  assert.match(plan.fingerprint ?? '', /u-eligible::other::/)
})

test('auto analysis transcript window excludes ignored background speech', () => {
  const englishQuestion = makeUtterance({
    id: 'u-window-eligible',
    language: 'en',
    text: 'Can you describe your product management background?'
  })
  const ignoredBackground = makeUtterance({
    id: 'u-window-ignored',
    language: 'ru',
    text: 'Сделай мне пожалуйста чай.'
  })

  const transcriptWindow = getAutoAnalysisTranscriptUtterances(
    [englishQuestion, ignoredBackground],
    'auto'
  )

  assert.deepEqual(
    transcriptWindow.map((utterance) => utterance.id),
    ['u-window-eligible']
  )
})

test('live test cockpit summarizes listening, ignored, sent, context, and freshness', () => {
  const englishQuestion = makeUtterance({
    id: 'u-cockpit-eligible',
    language: 'en',
    text: 'Can you describe your product management background?'
  })
  const ignoredBackground = makeUtterance({
    id: 'u-cockpit-ignored',
    language: 'ru',
    text: 'Сделай мне пожалуйста чай.'
  })

  const items = buildLiveTestCockpitItems({
    callLanguage: 'auto',
    realtimeLabel: 'listening',
    assistantStatus: {
      label: 'Ready',
      classNameSuffix: 'ready'
    },
    autoTranscriptText: englishQuestion.text,
    selectedPackLabel: 'Acme',
    selectedPackCount: 1,
    transcriptUtterances: [englishQuestion, ignoredBackground],
    latestRelevantUtteranceId: englishQuestion.id,
    lastAnalyzedUtteranceId: englishQuestion.id
  })
  const byId = Object.fromEntries(items.map((item) => [item.id, item]))

  assert.equal(byId.listening.value, 'AUTO / listening')
  assert.equal(byId.ignored.value, '1 / non EN/FR')
  assert.equal(byId.ignored.tone, 'warning')
  assert.equal(byId.sent.value, `1 lines / ${englishQuestion.text.length} chars`)
  assert.equal(byId.context.value, 'Acme')
  assert.equal(byId.context.tone, 'ok')
  assert.equal(byId.assistant.value, 'Ready / fresh')
  assert.equal(byId.assistant.tone, 'ok')
})

test('live test cockpit exposes no-pack and stale assistant state', () => {
  const latestQuestion = makeUtterance({
    id: 'u-cockpit-latest',
    language: 'fr',
    text: 'Pouvez-vous presenter votre parcours produit ?'
  })

  const items = buildLiveTestCockpitItems({
    callLanguage: 'fr',
    realtimeLabel: 'idle',
    assistantStatus: {
      label: 'Ready',
      classNameSuffix: 'ready'
    },
    autoTranscriptText: '',
    selectedPackLabel: 'No pack selected',
    selectedPackCount: 0,
    transcriptUtterances: [latestQuestion],
    latestRelevantUtteranceId: latestQuestion.id,
    lastAnalyzedUtteranceId: 'older'
  })
  const byId = Object.fromEntries(items.map((item) => [item.id, item]))

  assert.equal(byId.listening.value, 'FR / idle')
  assert.equal(byId.sent.tone, 'warning')
  assert.equal(byId.context.value, 'No pack')
  assert.equal(byId.context.tone, 'warning')
  assert.equal(byId.assistant.value, 'Ready / stale')
  assert.equal(byId.assistant.tone, 'warning')
})

test('auto analyze maps timeout and budget statuses for UI chain', () => {
  const waiting = getAssistantStatusLabel(
    'idle',
    'current-id',
    'current-id',
    null
  )
  assert.equal(waiting.label, 'Waiting')

  const timeout = getAssistantStatusLabel(
    'error',
    'prev-id',
    'prev-id',
    'provider_timeout'
  )
  assert.equal(timeout.label, 'Timeout')
  assert.equal(timeout.classNameSuffix, 'timeout')

  const budget = getAssistantStatusLabel(
    'error',
    'prev-id',
    'prev-id',
    'analysis_budget_exhausted'
  )
  assert.equal(budget.label, 'Budget exhausted')
  assert.equal(budget.classNameSuffix, 'budget-exhausted')

  const blocked = getAssistantStatusLabel(
    'error',
    'prev-id',
    'prev-id',
    'provider_not_retryable'
  )
  assert.equal(blocked.label, 'Retry blocked')
  assert.equal(blocked.classNameSuffix, 'retry-blocked')
})

test('budget exhausted exposes recovery guidance and button behavior stays explicit', () => {
  const hasTranscript = true
  const budget = getAssistantStatusLabel(
    'error',
    'u-final',
    'u-final',
    'analysis_budget_exhausted'
  )
  assert.equal(budget.label, 'Budget exhausted')
  assert.equal(budget.classNameSuffix, 'budget-exhausted')

  const budgetHint = getAssistantRunHint(
    'error',
    'analysis_budget_exhausted',
    'analysis budget exhausted',
    'u-final',
    'u-final'
  )
  assert.equal(budgetHint !== null, true)
  assert.equal(budgetHint?.title, 'Лимит budget исчерпан')
  assert.match(
    budgetHint?.actionHint ?? '',
    /сбрось|reset|паузы|pause/i
  )

  const budgetRecovery = getAssistantStatusRecoveryGuide(
    'error',
    'analysis_budget_exhausted',
    'analysis budget exhausted',
    'local budget gate'
  )
  assert.equal(budgetRecovery !== null, true)
  assert.equal(budgetRecovery?.source, 'local budget gate')
  assert.match(budgetRecovery?.recovery ?? '', /сбрось|reset|паузы|pause/i)

  const retryDisabled = isRetryButtonDisabled({
    assistantState: 'error',
    cooldownRemainingSeconds: 12,
    hasTranscript
  })
  assert.equal(retryDisabled, true)

  const retryNowDisabled = isRetryNowButtonDisabled({
    assistantState: 'error',
    hasTranscript
  })
  assert.equal(retryNowDisabled, false)
})

test('auto analyze maps stale/ready/error statuses for UI chain', () => {
  const stale = getAssistantStatusLabel('done', 'old-id', 'new-id', null)
  assert.equal(stale.label, 'Stale')
  assert.equal(stale.classNameSuffix, 'stale')

  const ready = getAssistantStatusLabel('done', 'same-id', 'same-id', null)
  assert.equal(ready.label, 'Ready')
  assert.equal(ready.classNameSuffix, 'ready')

  const genericError = getAssistantStatusLabel(
    'error',
    'same-id',
    'same-id',
    'provider_error'
  )
  assert.equal(genericError.label, 'Error')
  assert.equal(genericError.classNameSuffix, 'error')
})

test('assistant run hint summarizes operational failures for UI', () => {
  const budget = getAssistantRunHint(
    'error',
    'analysis_budget_exhausted',
    'analysis budget exhausted',
    'u-a',
    'u-a'
  )
  assert.equal(budget !== null, true)
  assert.equal(budget.tone, 'warning')
  assert.equal(
    budget.title,
    'Лимит budget исчерпан'
  )
  assert.equal(typeof budget.actionHint, 'string')

  const timeout = getAssistantRunHint(
    'error',
    'provider_timeout',
    'provider timeout',
    'u-a',
    'u-a'
  )
  assert.equal(timeout.tone, 'warning')
  assert.equal(timeout.title, 'Тайм-аут ответа провайдера')

  const blockedHint = getAssistantRunHint(
    'error',
    'provider_not_retryable',
    'assistant analysis failed: non-retryable provider policy violation',
    'u-a',
    'u-a'
  )
  assert.equal(blockedHint !== null, true)
  assert.equal(blockedHint.tone, 'error')
  assert.equal(blockedHint.title, 'Анализ заблокирован')

  const ready = getAssistantRunHint('idle', null, null, null, undefined)
  assert.equal(ready, null)
})

test('assistant recovery guide surfaces manual recovery for retry-blocked flow', () => {
  const blocked = getAssistantStatusRecoveryGuide(
    'error',
    'provider_not_retryable',
    'Schema validation rejected by policy boundary.',
    'openai(test-model)'
  )

  assert.equal(blocked !== null, true)
  assert.equal(blocked?.source, 'openai(test-model)')
  assert.match(blocked.reason, /не подходит|policy|policy boundary|почему/)
  assert.match(blocked.recovery, /ручн|проверь|запусти/)

  const retryable = getAssistantStatusRecoveryGuide(
    'error',
    'provider_error',
    'openai temporary failure',
    'provider gateway'
  )

  assert.equal(retryable !== null, true)
  assert.equal(retryable?.source, 'provider gateway')
  assert.match(retryable.recovery, /Retry|паузы|провайдер/)
})

test('manual retry after blocked state keeps active transcript non-stale in UI status model', () => {
  const liveUtteranceId = 'final-11'

  const blockedLabel = getAssistantStatusLabel(
    'error',
    'old-id',
    liveUtteranceId,
    'provider_not_retryable'
  )
  assert.equal(blockedLabel.label, 'Retry blocked')

  const recoveryGuide = getAssistantStatusRecoveryGuide(
    'error',
    'provider_not_retryable',
    'Schema validation rejected by policy boundary.'
  )
  assert.equal(recoveryGuide !== null, true)

  const blockedHint = getAssistantRunHint(
    'error',
    'provider_not_retryable',
    'Schema validation rejected by policy boundary.',
    'old-id',
    liveUtteranceId,
    0,
    'openai(test-model)'
  )
  assert.equal(blockedHint?.tone, 'error')
  assert.match(blockedHint.actionHint ?? '', /Retry|ручн|повтори/i)
  assert.match(blockedHint.message, /не подходит|policy|policy boundary|почему/i)

  const resetToActiveState = getAssistantStatusLabel(
    'idle',
    liveUtteranceId,
    liveUtteranceId,
    null
  )
  assert.equal(resetToActiveState.label, 'Waiting')

  const analyzing = getAssistantStatusLabel(
    'analyzing',
    liveUtteranceId,
    liveUtteranceId,
    null
  )
  assert.equal(analyzing.label, 'Analyzing')

  const recovered = getAssistantStatusLabel(
    'done',
    liveUtteranceId,
    liveUtteranceId,
    null
  )
  assert.equal(recovered.label, 'Ready')
})

test('assistant run hint adds retry guidance with cooldown window', () => {
  const timeoutWithDelay = getAssistantRunHint(
    'error',
    'provider_timeout',
    'provider timeout',
    'u-a',
    'u-a',
    7
  )

  assert.equal(timeoutWithDelay !== null, true)
  assert.equal(timeoutWithDelay.tone, 'warning')
  assert.match(timeoutWithDelay.actionHint ?? '', /Через\s+7\s+сек\.|Повтор запланирован через 7 сек\./)
})

test('auto-analysis debounce constant stays as expected', () => {
  assert.equal(AUTO_ANALYSIS_DEBOUNCE_MS, 900)
})

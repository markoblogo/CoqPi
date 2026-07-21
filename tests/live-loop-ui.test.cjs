const assert = require('node:assert/strict')
const test = require('node:test')

const {
  AUTO_ANALYSIS_DEBOUNCE_MS,
  buildAutoAnalysisSchedule,
  decideAutoAnalysis,
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
  assert.equal(withSelection.fingerprint, 'u-4::other::I have experience with product management and leadership.::packs:pack-A,pack-B')
  assert.equal(withoutSelection.fingerprint, 'u-4::other::I have experience with product management and leadership.::packs:')
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
  await new Promise((resolve) => setTimeout(resolve, firstPlan.delayMs ?? AUTO_ANALYSIS_DEBOUNCE_MS + 40))

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
    'Schema validation rejected by policy boundary.'
  )

  assert.equal(blocked !== null, true)
  assert.match(blocked.reason, /не подходит|policy|policy boundary|почему/)
  assert.match(blocked.recovery, /ручн|проверь|запусти/) 

  const retryable = getAssistantStatusRecoveryGuide(
    'error',
    'provider_error',
    'openai temporary failure'
  )

  assert.equal(retryable !== null, true)
  assert.match(retryable.recovery, /Retry|паузы|провайдер/)
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

/* global window */
const assert = require('node:assert/strict')
const { start } = require('../test-support/recording-ui-harness.cjs')
;(async () => {
  const h = await start()
  try {
    const p = h.page
    p.setDefaultTimeout(20000)
    await p.evaluate(() => {
      const a = window.__audit
      a.materials = []; a.recordings = {}; a.reports = {}; a.questionRequests = []; a.reviewRequests = []
      a.api.rehearsal = {
        list: async () => a.materials,
        create: async draft => {
          const id = crypto.randomUUID(), hash = (a.materials.length ? 'b' : 'a').repeat(64)
          const result = { ...draft, cv: undefined, vacancy: undefined, companyInfo: undefined, id, hash, createdAt: new Date().toISOString(), version: 1, materials: ['cv', 'vacancy', 'companyInfo'].map(kind => ({ kind, label: draft[kind].label, characters: draft[kind].text.length, hash })) }
          a.materials.push(result); return result
        },
        question: async request => {
          a.questionRequests.push(request)
          if (a.failNextQuestion) { a.failNextQuestion = false; throw new Error('Synthetic question interruption; recording preserved') }
          const current = a.recordings[request.sessionId]
          if (request.index > 0 && !current.segments.some(item => item.sourceItemId?.startsWith(`turn-${request.index - 1}:`))) throw new Error('Missing previous learner answer')
          return { question: current.language === 'fr' ? `Comment aborderiez-vous cette mission, étape ${request.index + 1} ?` : `How would you approach this role, step ${request.index + 1}?`, evidence: [], reason: 'Fixture' }
        },
        review: async request => {
          a.reviewRequests.push(request)
          const recording = a.recordings[request.sessionId]
          if (recording.status !== 'stopped' || recording.practice.snapshotId !== request.snapshotId) throw new Error('Wrong report scope')
          const report = { ...request, strengths: [], claimsToCheck: [], languagePoints: [], nextSteps: [{ text: `Prepare a specific example for ${recording.practice.company}.`, evidence: [{ source: 'answer', quote: 'Synthetic voice answer' }] }] }
          a.reports[request.sessionId] = report; return report
        },
        readReview: async request => a.reports[request.sessionId] ?? null
      }
      a.api.meetingTranscription.audioReviewRead = async () => null
      a.api.meetingTranscription.history = async () => Object.values(a.recordings).map(item => ({ ...item, practiceCompany: item.practice.company }))
      a.api.meetingTranscription.read = async id => a.recordings[id]
      const save = a.api.meetingTranscription.saveCurrent
      a.api.meetingTranscription.saveCurrent = async recording => { a.recordings[recording.id] = structuredClone(recording); return save(recording) }
      window.speechSynthesis.speak = utterance => setTimeout(() => utterance.onend?.(), 10)
      window.speechSynthesis.cancel = () => undefined
    })
    await h.openMode('Practice interview answers')
    await p.getByLabel('Practice mode').selectOption('personal')
    const stored = []
    for (const [language, company, fact] of [['en', 'Synthetic Alpha', 'booking discovery'], ['fr', 'Synthetic Beta', 'museum visitor research']]) {
      await p.getByLabel('Rehearsal company').fill(company)
      await p.getByLabel('Rehearsal role').fill('Product research manager')
      await p.getByLabel('Rehearsal language').selectOption(language)
      await p.getByLabel('Number of interview questions').selectOption('3')
      for (const [index, label, text] of [
        [0, 'Submitted CV', `Synthetic candidate worked on ${fact} for two years. Led customer interviews, designed a small pilot and worked with engineering and design on research priorities.`],
        [1, 'Vacancy', `${company} seeks a product research manager for ${fact}. The role coordinates research and prioritisation with a small design and engineering team for a six-week pilot.`],
        [2, 'Company information', `${company} builds tools and services related to ${fact}. Its small team plans a bounded pilot.`]
      ]) {
        const editor = p.locator('.personal-material').nth(index)
        await editor.locator('summary').click()
        await p.getByLabel(`${label} reviewed text`, { exact: true }).fill(text)
      }
      await p.getByLabel('Confirm exact CV and OpenAI processing').check()
      await p.getByRole('button', { name: 'Freeze reviewed materials' }).click()
      await p.getByRole('button', { name: 'Start rehearsal', exact: true }).waitFor()
      for (const width of [400, 640]) { await p.setViewportSize({ width, height: 400 }); assert.equal((await h.snap(`personal-frozen-${language}-${width}`)).scrollWidth, width) }
      await p.getByRole('button', { name: 'Start rehearsal', exact: true }).click()
      await p.getByRole('button', { name: 'Start', exact: true }).click()
      for (let index = 0; index < 3; index++) {
        await p.getByText('Your answer', { exact: false }).waitFor()
        await p.locator('.virtual-hint').filter({ hasText: language === 'fr' ? 'Je commencerais' : 'I would first' }).waitFor()
        await p.evaluate(index => {
          window.__audit.channels.at(-1).dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: `personal-${index}`, transcript: `Synthetic voice answer ${index}` }) }))
        }, index)
        if (index === 0 && language === 'en') {
          await p.evaluate(() => { window.__audit.failNextQuestion = true })
          await p.getByRole('button', { name: 'Next', exact: true }).click()
          await p.getByRole('button', { name: 'Retry question', exact: true }).click()
        } else await p.getByRole('button', { name: index === 2 ? 'Finish' : 'Next', exact: true }).click()
      }
      await p.getByText('Interview saved.', { exact: true }).waitFor()
      assert.equal(await p.getByText('Voice answer review', { exact: true }).count(), 1)
      assert.equal(await p.getByRole('region', { name: 'Personal interview review', exact: true }).count(), 1)
      await p.getByRole('button', { name: 'Review interview', exact: true }).click()
      await p.getByText(`Prepare a specific example for ${company}.`, { exact: true }).waitFor()
      for (const width of [400, 640]) { await p.setViewportSize({ width, height: 400 }); assert.equal((await h.snap(`personal-report-${language}-${width}`)).scrollWidth, width) }
      stored.push(await p.evaluate(() => ({ id: window.__audit.current.id, snapshot: window.__audit.current.practice.snapshotId })))
      if (language === 'en') {
        await p.getByRole('button', { name: 'Materials', exact: true }).click()
        await p.getByRole('button', { name: 'New materials', exact: true }).click()
      }
    }
    await p.getByText('Recording & timing', { exact: true }).click()
    await p.getByLabel('Saved practice').selectOption(stored[0].id)
    await p.getByText('Prepare a specific example for Synthetic Alpha.', { exact: true }).waitFor()
    const audit = await p.evaluate(() => ({ requests: window.__audit.requests, records: Object.values(window.__audit.recordings), reports: window.__audit.reviewRequests }))
    assert.equal(audit.records.length, 2)
    assert.ok(audit.records.every(item => item.status === 'stopped' && item.practice.kind === 'personal-interview' && item.segments.filter(segment => segment.speaker === 'ME').length === 3))
    assert.ok(audit.requests.every(item => item.practiceScenario === 'personal-interview-v1' && !item.includeProfileContext && item.selectedCounterpartyPackIds.length === 0))
    assert.deepEqual(new Set(audit.requests.map(item => item.rehearsalId)), new Set(stored.map(item => item.snapshot)))
    assert.equal(audit.reports.length, 2, 'reopening a cached report must not generate it again')
    assert.deepEqual(h.errors, [])
    console.log('Personal rehearsal UI passed: two CV/company scopes, EN/FR voice turns, question retry, Stop, review restore and 400/640px layouts (synthetic providers).')
  } catch (error) {
    await h.snap('personal-failure')
    console.log(await h.page.getByRole('button', { name: 'Review interview', exact: true }).evaluate(element => ({ button: element.getBoundingClientRect().toJSON(), main: element.closest('main')?.getBoundingClientRect().toJSON() })).catch(() => 'Review button absent'))
    throw error
  } finally { await h.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })

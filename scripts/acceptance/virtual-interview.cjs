/* global window */
const assert = require('node:assert/strict')
const { start } = require('../test-support/recording-ui-harness.cjs')
;(async () => {
  const h = await start()
  try {
    const p = h.page
    p.setDefaultTimeout(15000)
    await p.evaluate(() => {
      window.__audit.api.meetingTranscription.history = () => []
      window.__audit.api.meetingTranscription.read = () => window.__audit.current
      window.__audit.api.meetingTranscription.audioReviewRead = async () => null
      window.__audit.api.meetingTranscription.audioClip = async () => ({ base64: '', durationMs: 2000 })
      window.__audit.api.meetingTranscription.audioReview = async request => ({ ...request, status: 'reviewed', summary: 'Synthetic audio feedback.', findings: [{ word: 'three', heard: 'tree', correction: 'Use /θ/.', explanation: 'Synthetic fixture.', example: 'Three priorities.', startMs: 100, endMs: 600, confidence: 0.9, decision: 'pending' }] })
      window.__audit.api.meetingTranscription.audioReviewDecide = async request => ({ ...request, status: 'reviewed', summary: 'Synthetic audio feedback.', findings: [{ word: 'three', heard: 'tree', correction: 'Use /θ/.', explanation: 'Synthetic fixture.', example: 'Three priorities.', startMs: 100, endMs: 600, confidence: 0.9, decision: request.decision }] })
      window.__audit.repeatAttempts = []
      window.__audit.api.meetingTranscription.repeatList = async () => window.__audit.repeatAttempts
      window.__audit.api.meetingTranscription.repeatCreate = async target => {
        const id = crypto.randomUUID()
        const attempt = { version: 1, id, target, createdAt: new Date().toISOString(), audioSessionId: `practice-repeat:${id}`, example: 'Three priorities.', language: 'en' }
        window.__audit.repeatAttempts = [attempt]
        return attempt
      }
      window.__audit.api.meetingTranscription.repeatFinish = async request => {
        const attempt = window.__audit.repeatAttempts.find(item => item.id === request.id)
        attempt.recorded = true; attempt.captureFailed = request.failed
        return attempt
      }
      window.__audit.api.meetingTranscription.repeatClip = async () => ({ base64: '', durationMs: 2000 })
      window.__audit.api.meetingTranscription.repeatCompare = async request => {
        const attempt = window.__audit.repeatAttempts.find(item => item.id === request.id)
        attempt.comparison = { outcome: 'not_assessed', reason: 'No improvement claim.', check: { quality: 'unsupported', reason: 'Original is clear.' } }
        return attempt
      }
      const analyze = window.__audit.api.assistant.analyzeRecentTranscript
      window.__audit.api.assistant.analyzeRecentTranscript = async request => {
        const response = await analyze(request)
        response.data.suggestedAnswers[0].text = Array(4).fill(response.data.suggestedAnswers[0].text).join(' ')
        return response
      }
      window.speechSynthesis.speak = utterance => setTimeout(() => utterance.onend?.(), 10)
      window.speechSynthesis.cancel = () => undefined
    })
    await h.openMode('Practice interview answers')
    await p.getByLabel('Practice mode').selectOption('virtual')
    for (const language of ['en', 'fr']) {
      await p.getByLabel('Interview language').selectOption(language)
      await p.getByRole('button', { name: 'Start', exact: true }).click()
      for (let index = 0; index < 5; index++) {
        console.log(`Checking ${language} turn ${index + 1}`)
        await p.getByText('Your answer', { exact: false }).waitFor()
        await p.locator('.virtual-hint').filter({ hasText: language === 'fr' ? 'Je commencerais' : 'I would first' }).waitFor()
        if (index === 0) {
          for (const width of [400, 640]) {
            await p.setViewportSize({ width, height: 320 })
            const shot = await h.snap(`virtual-active-${language}-${width}`)
            assert.equal(shot.scrollWidth, width)
          }
        }
        await p.evaluate(index => {
          const channel = window.__audit.channels.at(-1)
          channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'input_audio_buffer.speech_stopped' }) }))
          channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: `turn-${index}`, transcript: 'Synthetic microphone answer.' }) }))
        }, index)
        await p.locator('.virtual-interview').evaluate(element => { element.scrollTop = element.scrollHeight })
        const nextBounds = await p.getByRole('button', { name: index === 4 ? 'Finish' : 'Next', exact: true }).boundingBox()
        assert.ok(nextBounds && nextBounds.y >= 0 && nextBounds.y + nextBounds.height <= 320, 'Next stays visible while reading a long response')
        await p.getByRole('button', { name: index === 4 ? 'Finish' : 'Next', exact: true }).click()
      }
      await p.getByText('Interview saved.', { exact: true }).waitFor()
      await p.getByText('Voice answer review', { exact: true }).click()
      await p.getByRole('button', { name: 'Send clip to OpenAI for review' }).click()
      await p.getByText('Tentative audio feedback', { exact: false }).waitFor()
      await p.getByRole('button', { name: 'Repeat & compare', exact: true }).click()
      console.log(`Checking ${language} repeat capture`)
      await p.getByRole('button', { name: 'Record repeat', exact: true }).click()
      await p.getByText('Recording · max 20 s', { exact: true }).waitFor()
      if (language === 'en') await p.getByRole('button', { name: 'Stop repeat', exact: true }).click()
      await p.getByRole('button', { name: 'Send both clips to OpenAI', exact: true }).waitFor({ timeout: 30000 })
      await p.getByRole('button', { name: 'Send both clips to OpenAI', exact: true }).click()
      await p.getByLabel('Tentative comparison').filter({ hasText: 'Recommendation not supported' }).waitFor()
      for (const width of [400, 640]) {
        await p.setViewportSize({ width, height: 400 })
        const shot = await h.snap(`repeat-feedback-${language}-${width}`)
        assert.equal(shot.scrollWidth, width)
      }
      await p.getByRole('button', { name: 'Dismiss', exact: true }).click()
      await p.getByText('dismissed', { exact: false }).waitFor()
      const result = await p.evaluate(() => window.__audit.current)
      assert.equal(result.segments.length, 10)
      assert.equal(result.segments.filter(s => s.speaker === 'ME').length, 5)
      assert.equal(result.practice.turns.length, 5)
      assert.equal(result.status, 'stopped')
    }
    for (const width of [400, 640]) {
      await p.setViewportSize({ width, height: 400 })
      const shot = await h.snap(`virtual-interview-${width}`)
      assert.equal(shot.scrollWidth, width)
    }
    const requests = await p.evaluate(() => window.__audit.requests)
    assert.equal(requests.length, 10)
    assert.ok(requests.every(request => request.responseStyle === 'brief' && request.latestIncomingUtterance && !request.includeProfileContext && request.selectedCounterpartyPackIds.length === 0))
    assert.deepEqual(h.errors, [])
    console.log('Virtual interview: 5 EN + 5 FR turns, microphone events, isolated real request contract, durable Stop and 400/640px layout passed (mock providers).')
  } finally { await h.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })

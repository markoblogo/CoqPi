/* global window */
// Explicit paid acceptance; synthetic materials and real loopback speech only.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const run = require('node:util').promisify(require('node:child_process').execFile)
const { _electron } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
;(async () => {
  if (process.env.COQPI_ACCEPTANCE_PAID !== '1' || !process.env.COQPI_ACCEPTANCE_EXECUTABLE) throw new Error('Explicit paid authorization and candidate required')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-personal-paid-'))
  await fs.chmod(directory, 0o700)
  const secret = path.join(directory, 'electron/secrets/openai-key.bin')
  await fs.mkdir(path.dirname(secret), { recursive: true })
  await fs.copyFile(path.join(os.homedir(), 'Library/Application Support/CoqPi/secrets/openai-key.bin'), secret)
  const report = { status: 'started', directory, sessions: [], retries: [] }
  let app, watchdog
  try {
    app = await _electron.launch({ executablePath: process.env.COQPI_ACCEPTANCE_EXECUTABLE, args: [`--user-data-dir=${path.join(directory, 'electron')}`], cwd: directory,
      env: { PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(), COQPI_ENV_FILE: path.join(directory, 'absent.env'), COQPI_DATA_DIR: path.join(directory, 'data'), COQPI_PROFILE_DIR: path.join(directory, 'profile'), COQPI_SESSIONS_DIR: path.join(directory, 'sessions'), COQPI_GOVERNANCE_DIR: path.join(directory, 'governance'), COQPI_PERSONAL_KNOWLEDGE_CORE_DIR: path.join(directory, 'knowledge'), COQPI_ASSISTANT_PROVIDER_PROFILE: 'openai:0', COQPI_ASSISTANT_FAILOVER_MODE: 'none', OPENAI_ASSISTANT_MODEL: 'gpt-4o-mini', OPENAI_REHEARSAL_MODEL: 'gpt-4o-mini' }, timeout: 60000 })
    watchdog = setTimeout(() => app.process().kill('SIGTERM'), 240000)
    await app.evaluate(() => {
      const original = globalThis.fetch
      const stats = globalThis.__personalPaid = { responses: 0, realtime: 0, textReservationUsd: 0 }
      globalThis.fetch = async (url, options) => {
        const address = String(url)
        if (address === 'https://api.openai.com/v1/responses') {
          const body = JSON.parse(options.body)
          if (body.model !== 'gpt-4o-mini' || ++stats.responses > 12 || body.max_output_tokens > 2200) throw new Error('Paid model-call cap')
          stats.textReservationUsd += Buffer.byteLength(JSON.stringify(body)) * 0.15 / 1e6 + (body.max_output_tokens || 2200) * 0.60 / 1e6
          if (stats.textReservationUsd > 0.40) throw new Error('Paid text budget cap')
          return original(url, options)
        }
        if (address.startsWith('https://api.openai.com/v1/realtime/') && ++stats.realtime <= 4) return original(url, options)
        throw new Error('Unexpected endpoint or paid test call count')
      }
    })
    const page = await app.firstWindow(); page.setDefaultTimeout(45000)
    const waitSession = async (predicate, label) => {
      const deadline = Date.now() + 45000
      while (Date.now() < deadline) {
        const session = await page.evaluate(() => window.coqpi.meetingTranscription.getCurrent())
        if (session && predicate(session)) return session
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      throw new Error(`Session did not reach ${label}`)
    }
    await page.getByTitle('Practice interview answers', { exact: true }).click()
    await page.getByLabel('Practice mode').selectOption('personal')
    for (const [language, company, voice, facts, answer] of [
      ['en', 'Synthetic Alpha', 'Samantha', 'booking discovery', 'I interviewed studio owners and helped the team prioritise a small booking pilot. I would ask customers about their current workflow before choosing what to test.'],
      ['fr', 'Synthetic Beta', 'Thomas', 'museum visitor research', 'J’ai interrogé des visiteurs et aidé l’équipe à préparer un petit pilote. Je commencerais par comprendre leurs besoins avant de choisir les priorités.']
    ]) {
      await page.getByLabel('Rehearsal company').fill(company)
      await page.getByLabel('Rehearsal role').fill('Product research manager')
      await page.getByLabel('Rehearsal language').selectOption(language)
      await page.getByLabel('Number of interview questions').selectOption('3')
      for (const [index, label, text] of [
        [0, 'Submitted CV', `Synthetic candidate worked on ${facts}. Interviewed users, helped prioritise a small pilot and coordinated research with a design team. No revenue or conversion metrics are documented.`],
        [1, 'Vacancy', `${company} seeks a product research manager for ${facts}. The role involves customer discovery, pilot prioritisation and collaboration with designers and engineers.`],
        [2, 'Company information', `${company} is a fictional organisation preparing a small pilot related to ${facts}. No additional company facts are verified.`]
      ]) {
        await page.locator('.personal-material').nth(index).locator('summary').click()
        await page.getByLabel(`${label} reviewed text`, { exact: true }).fill(text)
      }
      await page.getByLabel('Confirm exact CV and OpenAI processing').check()
      await page.getByRole('button', { name: 'Freeze reviewed materials' }).click()
      await page.getByRole('button', { name: 'Start rehearsal', exact: true }).click()
      await page.getByText('Microphone', { exact: true }).click()
      const input = page.getByLabel('Practice microphone')
      const device = await input.locator('option').filter({ hasText: 'BlackHole' }).first().getAttribute('value')
      assert.ok(device, 'BlackHole input required')
      await input.selectOption(device)
      await page.getByRole('button', { name: 'Start', exact: true }).click()
      for (let turn = 0; turn < 2; turn++) {
        await page.getByText('Your answer', { exact: false }).waitFor()
        await waitSession(session => session.practice?.turns.length === turn + 1 && !!session.practice.turns[turn].questionAudioEndedAt && !!session.practice.turns[turn].answerStartedAt, `spoken question ${turn}`)
        await waitSession(session => session.assistantEvents?.length >= turn + 1, `final hint ${turn}`)
        await page.getByText('Your answer', { exact: false }).waitFor()
        await run('say', ['-a', 'BlackHole 2ch', '-v', voice, answer], { timeout: 25000 })
        await waitSession(session => {
          const text = session.segments.filter(segment => segment.speaker === 'ME' && segment.sourceItemId?.startsWith(`turn-${turn}:`)).map(segment => segment.text).join(' ')
          return text?.length > 80 && Object.keys(session.interim || {}).length === 0
        }, `saved learner answer ${turn}`)
        if (turn === 0) {
          await page.getByRole('button', { name: 'Next', exact: true }).click()
          await page.getByText(/Your answer|Retry question/, { exact: false }).first().waitFor()
          const retry = page.getByRole('button', { name: 'Retry question', exact: true })
          if (await retry.isVisible()) {
            report.retries.push({ language, error: await page.getByRole('alert').innerText() })
            await retry.click()
          }
        }
      }
      await page.getByRole('button', { name: 'Stop', exact: true }).click()
      await page.getByText('Interview saved.', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Review interview', exact: true }).click()
      await page.getByText('Draft review · pronunciation not assessed from text', { exact: true }).waitFor()
      const current = await page.evaluate(() => window.coqpi.meetingTranscription.getCurrent())
      const restored = await page.evaluate(id => window.coqpi.meetingTranscription.read(id), current.id)
      const review = await page.evaluate(session => window.coqpi.rehearsal.readReview({ snapshotId: session.practice.snapshotId, sessionId: session.id }), restored)
      assert.equal(restored.status, 'stopped'); assert.equal(restored.practice.turns.length, 2)
      for (let index = 0; index < 2; index++) assert.ok(restored.segments.some(segment => segment.speaker === 'ME' && segment.sourceItemId?.startsWith(`turn-${index}:`)), `Missing saved answer ${index}`)
      assert.equal(review.snapshotHash, restored.practice.snapshotHash)
      assert.equal(restored.assistantEvents.length, 2)
      const wav = await fs.readFile(path.join(directory, 'sessions/audio-backups', createHash('sha256').update(current.id).digest('hex'), 'microphone.wav'))
      assert.ok(wav.length > 32044 && wav.readUInt32LE(40) === wav.length - 44)
      let audible = false
      for (let offset = 44; offset + 1 < wav.length; offset += 2) if (wav.readInt16LE(offset)) { audible = true; break }
      assert.ok(audible, 'Backup must contain actual audio')
      await page.screenshot({ path: path.join(directory, `${language}-review.png`) })
      report.sessions.push({ language, company, sessionId: current.id, snapshotHash: restored.practice.snapshotHash, turns: restored.practice.turns, segments: restored.segments, hints: restored.assistantEvents, review, audioBytes: wav.length })
      if (language === 'en') {
        await page.getByRole('button', { name: 'Materials', exact: true }).click()
        await page.getByRole('button', { name: 'New materials', exact: true }).click()
      }
    }
    report.calls = await app.evaluate(() => globalThis.__personalPaid)
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'; report.error = error.message; process.exitCode = 1
    if (app) {
      report.calls = await app.evaluate(() => globalThis.__personalPaid).catch(() => undefined)
      const page = await app.firstWindow().catch(() => null)
      if (page) {
        report.failureUi = await page.locator('body').innerText({ timeout: 3000 }).catch(() => 'Unavailable')
        await page.screenshot({ path: path.join(directory, 'failure.png'), timeout: 3000 }).catch(() => undefined)
      }
    }
  }
  finally {
    clearTimeout(watchdog)
    if (app) await app.close().catch(() => undefined)
    await fs.rm(path.join(directory, 'electron/secrets'), { recursive: true, force: true })
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
    console.log(JSON.stringify({ status: report.status, error: report.error, directory, calls: report.calls, sessions: report.sessions.map(item => ({ language: item.language, turns: item.turns.length, audioBytes: item.audioBytes, reviewMs: item.review.latencyMs })) }, null, 2))
  }
})().catch(error => { console.error(error.message); process.exitCode = 1 })

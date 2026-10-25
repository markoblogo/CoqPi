/* global window, document */
// Explicit paid acceptance: synthetic speech through a real BlackHole input, no provider mocks.
const { _electron } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const run = promisify(execFile)
const { words, wordErrors } = require('./transcript-quality.cjs')

;(async () => {
  if (process.env.COQPI_ACCEPTANCE_PAID !== '1') throw new Error('Explicit paid authorization required')
  const executablePath = process.env.COQPI_ACCEPTANCE_EXECUTABLE
  if (!executablePath) throw new Error('Candidate app required')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-virtual-paid-'))
  await fs.chmod(directory, 0o700)
  const secret = path.join(directory, 'electron/secrets/openai-key.bin')
  await fs.mkdir(path.dirname(secret), { recursive: true })
  await fs.copyFile(path.join(os.homedir(), 'Library/Application Support/CoqPi/secrets/openai-key.bin'), secret)
  let app, watchdog
  const report = { directory, sessions: [], status: 'started', input: 'synthetic macOS speech through real BlackHole audio' }
  try {
    app = await _electron.launch({ executablePath, args: [`--user-data-dir=${path.join(directory, 'electron')}`], cwd: directory,
      env: { PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(),
        COQPI_ENV_FILE: path.join(directory, 'absent.env'), COQPI_DATA_DIR: path.join(directory, 'data'),
        COQPI_PROFILE_DIR: path.join(directory, 'data/profile'), COQPI_SESSIONS_DIR: path.join(directory, 'data/sessions'),
        COQPI_PERSONAL_KNOWLEDGE_CORE_DIR: path.join(directory, 'knowledge'), COQPI_GOVERNANCE_DIR: path.join(directory, 'governance'),
        COQPI_ASSISTANT_PROVIDER_PROFILE: 'openai:0', COQPI_ASSISTANT_FAILOVER_MODE: 'none', OPENAI_ASSISTANT_MODEL: 'gpt-4o-mini' }, timeout: 60000 })
    // At most two model calls and two short STT sessions; 3-minute hard audio cap.
    watchdog = setTimeout(() => app.process().kill('SIGTERM'), 180000)
    await app.evaluate(() => {
      const original = globalThis.fetch
      let responses = 0, realtime = 0, reserved = 0
      globalThis.fetch = async (url, options) => {
        const address = String(url)
        if (address === 'https://api.openai.com/v1/responses') {
          const body = JSON.parse(options.body)
          if (body.model !== 'gpt-4o-mini' || ++responses > 2) throw new Error('Paid model-call cap')
          body.max_output_tokens = 512
          reserved += Buffer.byteLength(JSON.stringify(body)) * 0.15 / 1e6 + 512 * 0.60 / 1e6
          if (reserved > 0.40) throw new Error('Paid text budget cap')
          return original(url, { ...options, body: JSON.stringify(body) })
        }
        if (address.startsWith('https://api.openai.com/v1/realtime/') && ++realtime <= 2) return original(url, options)
        throw new Error('Unexpected paid test endpoint or call count')
      }
    })
    const page = await app.firstWindow(); page.setDefaultTimeout(30000)
    await page.getByTitle('Practice interview answers', { exact: true }).click()
    await page.getByLabel('Practice mode').selectOption('virtual')
    for (const [language, voice, text] of [
      ['en', 'Samantha', 'I would start by understanding the team goals and listening to customers. Then I would agree on a small pilot with clear measures of success.'],
      ['fr', 'Thomas', 'Je commencerais par comprendre les objectifs et écouter les clients. Ensuite, je proposerais un petit pilote avec des critères de réussite clairs.']
    ]) {
      await page.getByLabel('Interview language').selectOption(language)
      await page.getByText('Microphone', { exact: true }).click()
      const select = page.getByLabel('Practice microphone')
      const option = select.locator('option').filter({ hasText: 'BlackHole' }).first()
      await select.selectOption(await option.getAttribute('value'))
      await page.getByRole('button', { name: 'Start', exact: true }).click()
      await page.getByText('Your answer', { exact: false }).waitFor()
      await run('say', ['-a', 'BlackHole 2ch', '-v', voice, text], { timeout: 20000 })
      const speechFinishedAt = Date.now()
      await page.getByRole('button', { name: 'Next', exact: true }).waitFor()
      await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Next')?.disabled)
      await page.waitForFunction(() => { const text = document.querySelector('.virtual-hint')?.textContent; return text && !text.includes('Preparing your response') })
      // Wait for final provider result in the durable journal, not only streamed UI text.
      await page.waitForFunction(async () => (await window.coqpi.meetingTranscription.getCurrent())?.assistantEvents?.length > 0)
      await page.waitForFunction(async tail => {
        const session = await window.coqpi.meetingTranscription.getCurrent()
        return session?.segments.filter(segment => segment.speaker === 'ME').map(segment => segment.text).join(' ').toLowerCase().includes(tail)
      }, language === 'en' ? 'success' : 'clairs')
      await page.screenshot({ path: path.join(directory, `${language}-active.png`) })
      await page.getByRole('button', { name: 'Stop', exact: true }).click()
      await page.getByText('Interview saved. Pronunciation was not evaluated.', { exact: true }).waitFor()
      const session = await page.evaluate(() => window.coqpi.meetingTranscription.getCurrent())
      const restored = await page.evaluate(id => window.coqpi.meetingTranscription.read(id), session.id)
      if (restored.segments.filter(segment => segment.speaker === 'ME').length < 1) throw new Error('No recorded learner speech')
      if (!restored.practice.turns[0].questionAudioEndedAt) throw new Error('Interviewer question audio did not finish')
      const reference = words(text)
      const actual = words(restored.segments.filter(segment => segment.speaker === 'ME').map(segment => segment.text).join(' '))
      const wordErrorRate = wordErrors(reference, actual) / Math.max(1, reference.length)
      if (wordErrorRate > 0.25) throw new Error(`Poor ${language} transcription: ${wordErrorRate}`)
      const wav = await fs.readFile(path.join(directory, 'data/sessions/audio-backups', createHash('sha256').update(session.id).digest('hex'), 'microphone.wav'))
      if (wav.length <= 44 || wav.readUInt32LE(40) !== wav.length - 44) throw new Error('Invalid WAV backup')
      let nonzero = 0
      for (let offset = 44; offset + 1 < wav.length; offset += 2) if (wav.readInt16LE(offset)) nonzero++
      if (nonzero === 0) throw new Error('Silent WAV backup')
      report.sessions.push({ language, segments: restored.segments, timing: restored.practice.turns, hints: restored.assistantEvents, audioBytes: wav.length, nonzero, wordErrorRate, speechEndToFinalMs: Math.max(0, Date.parse(restored.practice.turns[0].answerFinalAt) - speechFinishedAt), stopped: restored.status })
    }
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1 }
  finally {
    clearTimeout(watchdog)
    if (app) await app.close().catch(() => undefined)
    await fs.rm(secret, { force: true })
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
    console.log(JSON.stringify({ status: report.status, error: report.error, directory, sessions: report.sessions.map(item => ({ language: item.language, timing: item.timing, audioBytes: item.audioBytes })) }, null, 2))
  }
})().catch(error => { console.error(error.message); process.exitCode = 1 })

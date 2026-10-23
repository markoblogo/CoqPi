/* global document, window, RTCPeerConnection */
// Real installed binary and real devices. No provider, IPC, audio or DOM mocks.
const { _electron } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const run = promisify(execFile)

const {words, wordErrors} = require('./transcript-quality.cjs')

;(async () => {
  const root = path.resolve('tmp/real-user-acceptance')
  await fs.mkdir(root, { recursive: true })
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-acceptance-'))
  const mode = process.argv[2] || 'preflight'
  const questionFile = process.argv[3]
  if (!['preflight', 'offline', 'live'].includes(mode)) throw new Error('Unknown mode')
  if (mode === 'live' && process.env.COQPI_ACCEPTANCE_PAID !== '1') throw new Error('Paid authorization required')
  const secretPath = path.join(directory, 'electron/secrets/openai-key.bin')
  if (mode === 'live') {
    await fs.mkdir(path.dirname(secretPath), { recursive: true })
    await fs.copyFile(path.join(os.homedir(), 'Library/Application Support/coqpi/secrets/openai-key.bin'), secretPath)
    await fs.chmod(secretPath, 0o600)
  }
  const executablePath = process.env.COQPI_ACCEPTANCE_EXECUTABLE || (process.env.COQPI_ACCEPTANCE_CANDIDATE === '1'
    ? path.resolve('dist-packages/mac-arm64/CoqPi.app/Contents/MacOS/CoqPi')
    : '/Applications/CoqPi.app/Contents/MacOS/CoqPi')
  const env = { PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(),
    COQPI_ENV_FILE: path.join(directory, 'absent.env'), COQPI_DATA_DIR: directory,
    COQPI_SESSIONS_DIR: path.join(directory, 'sessions'), COQPI_PROFILE_DIR: path.join(directory, 'profile'),
    COQPI_PERSONAL_KNOWLEDGE_CORE_DIR: path.join(directory, 'knowledge'), COQPI_GOVERNANCE_DIR: path.join(directory, 'governance') }
  const launchArgs = [`--user-data-dir=${path.join(directory, 'electron')}`]
  const report = { startedAt: new Date().toISOString(), directory, executablePath, mocks: [],
    asarSha256: createHash('sha256').update(await fs.readFile(path.resolve(path.dirname(executablePath), '../Resources/app.asar'))).digest('hex'), observations: [] }
  let app
  try {
    app = await _electron.launch({ executablePath, cwd: directory, args: launchArgs, env, timeout: 60000 })
    report.runtime = await app.evaluate(({ app, systemPreferences }) => ({ version: app.getVersion(), electronVersion: process.versions.electron, userData: app.getPath('userData'), microphonePermission: systemPreferences.getMediaAccessStatus('microphone') }))
    const page = await app.firstWindow()
    page.setDefaultTimeout(10000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.evaluate(() => {
      window.__sttTiming = []
      const original = RTCPeerConnection.prototype.createDataChannel
      let channelIndex = 0
      RTCPeerConnection.prototype.createDataChannel = function (...args) {
        const channel = original.apply(this, args), sourceIndex = channelIndex++
        channel.addEventListener('message', event => {
          try {
            const data = JSON.parse(event.data)
            if (['input_audio_buffer.speech_started','input_audio_buffer.speech_stopped','input_audio_buffer.committed','conversation.item.input_audio_transcription.delta','conversation.item.input_audio_transcription.completed','conversation.item.input_audio_transcription.failed'].includes(data.type)) {
              window.__sttTiming.push({at:Date.now(),sourceIndex,type:data.type,itemId:data.item_id,audioEndMs:data.audio_end_ms})
            }
          } catch { /* Observation only: never affect the real data channel. */ }
        })
        return channel
      }
    })
    await page.locator('.call-focus, .mode-chooser').waitFor({ timeout: 60000 })
    const newUi = await page.locator('.mode-chooser').isVisible()
    const openMode = async title => {
      if (newUi && !await page.locator('.mode-chooser').isVisible()) await page.getByRole('button', {name:'Choose mode',exact:true}).first().click()
      await page.getByTitle(title, {exact:true}).click()
      if (newUi && title === 'Live assistant') {
        if (process.env.COQPI_ACCEPTANCE_DUAL === '1') {
          await page.getByLabel('Наушники + микрофон', {exact:true}).check()
          await page.getByLabel('Microphone', {exact:true}).selectOption('')
          const other = page.getByLabel('Other side input', {exact:true})
          await other.locator('option').filter({hasText:'BlackHole'}).waitFor({state:'attached'})
          await other.selectOption(await other.locator('option').filter({hasText:'BlackHole'}).getAttribute('value'))
        }
        await page.getByRole('button', {name:'Продолжить',exact:true}).click()
      }
    }
    if (newUi) await openMode('Live assistant')
    await page.screenshot({ path: path.join(directory, '01-live.png') })
    await openMode('Meeting transcription')
    await page.screenshot({ path: path.join(directory, '02-recorder.png') })
    report.recorderVisibleText = await page.locator('body').innerText()
    const mic = page.locator('label').filter({ has: page.locator('span', { hasText: /^Mic$/ }) }).locator('select')
    await mic.locator('option').filter({ hasText: 'BlackHole' }).waitFor({ state: 'attached', timeout: 10000 })
    report.devices = await mic.locator('option').allTextContents()
    report.devicesApi = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).map(d => ({ kind: d.kind, label: d.label })))
    report.errors = errors
    report.status = 'PREFLIGHT_ONLY'
    if (mode !== 'preflight') {
      if (report.runtime.microphonePermission !== 'granted') throw new Error('Microphone permission unavailable')
      await mic.selectOption(await mic.locator('option').filter({ hasText: 'BlackHole' }).getAttribute('value'))
      await page.locator('label').filter({ has: page.locator('span', { hasText: /^Language$/ }) }).locator('select').selectOption('en')
      if (mode === 'live') await openMode('Live assistant')
      const start = page.getByRole('button', { name: mode === 'live' ? 'Start listening' : 'Start', exact: true })
      const stop = page.getByRole('button', { name: mode === 'live' ? 'Stop listening' : 'Stop', exact: true })
      const watchdog = setTimeout(() => { app.process().kill('SIGTERM') }, 90000)
      try {
        report.startClickedAt = new Date().toISOString()
        await start.click()
        await stop.waitFor()
        await page.waitForTimeout(5000)
        await page.screenshot({ path: path.join(directory, '03-started.png') })
        report.startedVisibleText = await page.locator('body').innerText()
        report.speechStartedAt = new Date().toISOString()
        await run('say', ['-a', 'BlackHole 2ch', '-v', process.env.COQPI_ACCEPTANCE_VOICE || 'Samantha', ...(questionFile ? ['-f', questionFile] : ['This is a local recording test. The recording must survive stopping and reopening the application.'])], { timeout: 20000 })
        report.speechEndedAt = new Date().toISOString()
        for (let i = 0; i < (mode === 'live' ? 140 : 12); i++) {
          await page.waitForTimeout(250)
          const visible = await page.locator(mode === 'live' ? '.call-focus' : '.transcribe-layout').innerText()
          report.observations.push({ at: new Date().toISOString(), visible })
          if (mode === 'live') {
            const answer = (await page.locator('.call-answer > p').innerText()).trim()
            const meaning = (await page.locator('.call-heard > p').innerText()).trim()
            if (!report.firstTranslationAt && meaning && !['…', '—', 'Перевожу…', 'Ожидаю собеседника…'].includes(meaning)) report.firstTranslationAt = new Date().toISOString()
            if (!['', '…', '—'].includes(answer)) {
              report.firstAnswerAt ||= new Date().toISOString()
              if (await page.locator('.call-answer').getAttribute('aria-busy') !== 'true') {
                if (process.env.COQPI_ACCEPTANCE_EXPECT_TAIL) {
                  const current = JSON.parse(await fs.readFile(path.join(directory, 'sessions/meeting-transcription-current.json'), 'utf8'))
                  const lastText = current.segments.filter(segment => segment.source === 'system').at(-1)?.text || ''
                  if (!lastText.toLocaleLowerCase().includes(process.env.COQPI_ACCEPTANCE_EXPECT_TAIL.toLocaleLowerCase())) continue
                }
                report.finalAnswerAt = new Date().toISOString()
                break
              }
            }
          }
          if (mode === 'live' && await page.locator('.call-error').isVisible()) break
        }
        await page.screenshot({ path: path.join(directory, '04-result.png') })
        report.finalVisibleText = await page.locator('body').innerText()
        if (mode === 'live' && !report.finalAnswerAt) throw new Error('No finalized assistant answer within the bounded live probe')
        if (mode === 'live' && process.env.COQPI_ACCEPTANCE_SECOND_FILE) {
          const previous = await page.locator('.call-answer > p').innerText()
          await run('say', ['-a', 'BlackHole 2ch', '-v', 'Thomas', '-f', process.env.COQPI_ACCEPTANCE_SECOND_FILE], {timeout:20000})
          report.secondSpeechEndedAt = new Date().toISOString()
          await page.waitForFunction(old => {
            const answer=document.querySelector('.call-answer > p')?.textContent.trim()
            return answer && !['…','—',old].includes(answer) && document.querySelector('.call-answer')?.getAttribute('aria-busy') !== 'true'
          }, previous, {timeout:35000})
          report.secondAnswerAt = new Date().toISOString()
          report.secondVisibleText = await page.locator('body').innerText()
          await page.screenshot({path:path.join(directory,'04-second-result.png')})
        }
        report.sttTiming = await page.evaluate(() => window.__sttTiming)
        await stop.click()
        const stopStarted = Date.now()
        await page.waitForFunction(() => {
          const buttons = [...document.querySelectorAll('button')]
          const start = buttons.find(b => b.getAttribute('aria-label') === 'Start listening' || b.textContent.trim() === 'Start')
          return start && !start.disabled
        }, null, { timeout: 30000 })
        report.stopLatencyMs = Date.now() - stopStarted
        await page.waitForTimeout(500)
        await page.screenshot({ path: path.join(directory, '05-stopped.png') })
        report.stoppedVisibleText = await page.locator('body').innerText()
        report.session = JSON.parse(await fs.readFile(path.join(directory, 'sessions/meeting-transcription-current.json'), 'utf8'))
        if (questionFile && process.env.COQPI_ACCEPTANCE_DUAL === '1') {
          const referenceFiles = [questionFile, process.env.COQPI_ACCEPTANCE_SECOND_FILE].filter(Boolean)
          const reference = words((await Promise.all(referenceFiles.map(file => fs.readFile(file, 'utf8')))).join(' '))
          const actual = words(report.session.segments.filter(segment => segment.source === 'system').map(segment => segment.text).join(' '))
          report.accuracy = {referenceWords:reference.length, wordErrors:wordErrors(reference, actual)}
          report.accuracy.wordErrorRate = report.accuracy.wordErrors / Math.max(1, reference.length)
        }
        const wavPath = path.join(directory, 'sessions/audio-backups', createHash('sha256').update(report.session.id).digest('hex'), 'microphone.wav')
        const wav = await fs.readFile(wavPath)
        let square = 0; let nonzero = 0
        for (let i = 44; i + 1 < wav.length; i += 2) { const s = wav.readInt16LE(i); square += s * s; if (s !== 0) nonzero++ }
        report.audio = { bytes: wav.length, declaredPcmBytes: wav.readUInt32LE(40), sampleRate: wav.readUInt32LE(24), nonzeroSamples: nonzero, rms: Math.sqrt(square / ((wav.length - 44) / 2)) / 32768 }
        if (process.env.COQPI_ACCEPTANCE_DUAL === '1') {
          const system = await fs.readFile(path.join(path.dirname(wavPath), 'system.wav'))
          report.systemAudio = {bytes: system.length, declaredPcmBytes: system.readUInt32LE(40)}
        }
        report.status = 'EXECUTED_REQUIRES_REVIEW'
        if (report.accuracy?.wordErrorRate > 0.15) throw new Error('Transcript quality gate failed: more than 15% normalized word errors')
      } finally { clearTimeout(watchdog) }
    }
  } catch (error) {
    report.status = 'BLOCKED'; report.error = error.message
  } finally {
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(report, null, 2))
    if (app) {
      let timer
      await Promise.race([app.close(), new Promise(resolve => { timer = setTimeout(() => {
        report.closeTimeout = true; app.process().kill('SIGTERM'); resolve()
      }, 10000) })]).catch(error => { report.closeError = error.message })
      clearTimeout(timer)
    }
    if (report.session && !report.closeTimeout && !report.closeError) {
      let reopened
      try {
        reopened = await _electron.launch({ executablePath, cwd: directory, args: launchArgs, env, timeout: 60000 })
        const page = await reopened.firstWindow()
        await page.locator('.mode-chooser, .call-focus').waitFor({ timeout: 60000 })
        await page.getByTitle('Meeting transcription', {exact:true}).click()
        await page.waitForTimeout(1000)
        await page.screenshot({path:path.join(directory, '06-reopened.png')})
        report.reopenedVisibleText = await page.locator('body').innerText()
        const saved = JSON.parse(await fs.readFile(path.join(directory, 'sessions/meeting-transcription-current.json'), 'utf8'))
        report.reopenPreserved = saved.id === report.session.id && JSON.stringify(saved.segments) === JSON.stringify(report.session.segments)
      } catch (error) { report.reopenError = error.message }
      finally {
        if (reopened) {
          let timer
          await Promise.race([reopened.close(), new Promise(resolve => {timer=setTimeout(() => {reopened.process().kill('SIGTERM'); report.reopenCloseTimeout=true; resolve()},10000)})]).catch(error => {report.reopenError=error.message})
          clearTimeout(timer)
        }
      }
    }
    await fs.rm(secretPath, { force: true })
    report.endedAt = new Date().toISOString()
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(report, null, 2))
    await fs.cp(directory, path.join(root, path.basename(directory)), { recursive: true, filter: source => !source.includes(`${path.sep}electron`) })
    console.log(JSON.stringify(report, null, 2))
    if (report.status === 'BLOCKED' || report.closeTimeout || report.reopenError || report.reopenPreserved === false) process.exitCode = 1
  }
})().catch(error => { console.error(error.message); process.exitCode = 1 })

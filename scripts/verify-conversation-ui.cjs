/* global MediaStream, window, document, innerWidth, getComputedStyle */
const { _electron } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

;(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-conversation-ui-'))
  const env = { ...process.env, COQPI_DATA_DIR: dir, COQPI_SESSIONS_DIR: path.join(dir, 'sessions'), COQPI_PROFILE_DIR: path.join(dir, 'profile'), COQPI_PERSONAL_KNOWLEDGE_CORE_DIR: path.join(dir, 'knowledge'), OPENAI_API_KEY: 'test-placeholder' }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.COQPI_TEST_EXECUTABLE || require('electron')
  const app = await _electron.launch({ executablePath, args: [...(process.env.COQPI_TEST_EXECUTABLE ? [] : ['.']), `--user-data-dir=${path.join(dir, 'electron')}`], env, timeout:60000 })
  try {
    const page = await app.firstWindow()
    page.setDefaultTimeout(20000)
    await page.locator('.call-focus').waitFor()
    await app.evaluate(({ ipcMain }) => {
      global.__conversationRequests = []
      ipcMain.removeHandler('coqpi:assistant:analyze-recent-transcript')
      ipcMain.handle('coqpi:assistant:analyze-recent-transcript', async (_event, request) => {
        global.__conversationRequests.push(request)
        const answers = { fr: 'Je peux vous aider à développer ce projet avec une approche claire et mesurable.', en: 'I can help your team develop this project with clear goals and measurable results.', ru: 'Я могу помочь вашей команде развивать проект с понятными целями и измеримыми результатами.', uk: 'Я можу допомогти вашій команді розвивати проєкт із чіткими цілями та вимірюваними результатами.' }
        return { ok: true, data: { meaningRu: 'Расскажите о вашем опыте и подходе к работе.', detectedQuestion: 'What would you improve next?', intent:'question', risk:'', suggestedAnswers:[{label:'short',text:answers[request.answerLanguage] || answers.en,answerMeaningRu:'Короткий ответ о подходе к работе.'}], keywordsToRemember:[],model:'fixture',latencyMs:25 } }
      })
      ipcMain.removeHandler('coqpi:realtime:create-transcription-answer')
      ipcMain.handle('coqpi:realtime:create-transcription-answer', () => ({ok:true,data:{answerSdp:'fixture'}}))
    })
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => new MediaStream()
      window.RTCPeerConnection = class {
        iceGatheringState = 'complete'; connectionState = 'new'; localDescription = {sdp:'fixture'}
        createDataChannel() { this.channel = new EventTarget(); this.channel.readyState = 'open'; this.channel.close = () => {}; window.__testChannel = this.channel; return this.channel }
        addTrack() {} async createOffer() { return {sdp:'fixture'} } async setLocalDescription() {}
        async setRemoteDescription() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); this.channel.dispatchEvent(new Event('open')) }
        close() {} addEventListener() {} removeEventListener() {}
      }
    })
    await page.locator('.call-focus').getByRole('button', {name:'Start listening',exact:true}).click()
    for (const [index, language, text] of [[0,'fr','Bonjour, pouvez vous parler de votre parcours professionnel ?'],[1,'en','Could you tell us about your experience in product management?'],[2,'ru','Расскажите о вашем опыте работы и профессиональных достижениях.'],[3,'uk','Розкажіть про ваш професійний досвід і досягнення.'],[4,'fr','Quelles sont vos principales compétences pour notre équipe ?']]) {
      await page.evaluate(({index,text}) => window.__testChannel.dispatchEvent(new MessageEvent('message', {data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:`item-${index}`,transcript:text})})), {index,text})
      await page.waitForFunction(() => document.querySelector('.call-section-label')?.textContent.includes('Your answer'), undefined, {timeout:15000})
      const requests = await app.evaluate(() => global.__conversationRequests)
      assert.equal(requests.at(-1).answerLanguage, language)
      assert.equal(requests.at(-1).callLanguage, language)
      assert.equal(requests.at(-1).responseStyle, 'brief')
      for (const [width,height] of [[860,540],[720,480],[1100,700]]) {
        await page.setViewportSize({width,height})
        const bounds = await page.locator('.call-focus').evaluate(el => ({width:el.getBoundingClientRect().width, scroll:document.documentElement.scrollWidth, viewport:innerWidth, answerSize:getComputedStyle(el.querySelector('.call-answer > p')).fontSize}))
        assert.ok(bounds.scroll <= bounds.viewport + 1, JSON.stringify(bounds))
        assert.ok(parseFloat(bounds.answerSize) >= 26)
        await page.screenshot({path:path.join(dir,`${index}-${language}-${width}.png`)})
      }
    }
    await page.locator('.call-focus').getByRole('button', {name:'Stop listening',exact:true}).click()
    await page.waitForFunction(() => document.querySelector('.call-focus-toolbar')?.textContent.includes('stopped'))
    const current = await page.evaluate(() => window.coqpi.meetingTranscription.getCurrent())
    assert.equal(current.segments.length, 5)
    assert.equal(current.assistantEvents.length, 5)
    assert.deepEqual(current.segments.map(segment => segment.language), ['fr','en','ru','uk','fr'])
    await page.getByRole('button', {name:'Meeting transcription'}).click()
    await page.getByText('Saved conversations', {exact:true}).click()
    await page.getByRole('button',{name:'Export conversation',exact:true}).waitFor()
    await page.getByTitle('Live assistant', {exact:true}).click()
    await page.locator('.call-focus').getByRole('button', {name:'Start listening',exact:true}).click()
    await page.waitForFunction(() => document.querySelector('.call-focus-toolbar [role="status"]')?.textContent === 'Listening')
    await page.evaluate(() => window.__testChannel.dispatchEvent(new MessageEvent('message', {data:JSON.stringify({type:'conversation.item.input_audio_transcription.delta',item_id:'pending',delta:'Unfinished but saved'})})))
    await page.evaluate(() => window.coqpi.meetingTranscription.flush())
    const closing = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.close(); window.close() })
    await closing
    const stopped = JSON.parse(await fs.readFile(path.join(dir,'sessions','meeting-transcription-current.json'),'utf8'))
    assert.ok(stopped.endedAt, 'close must persist a stopped session')
    assert.equal(stopped.interim.pending.text, 'Unfinished but saved')
    console.log(JSON.stringify({ok:true, screenshots:dir, languages:['fr','en','ru','uk','fr'],savedSegments:current.segments.length,closePreservedInterim:true}))
  } finally {
    // Test cleanup cannot wait on a production save-error dialog.
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {})
    await app.close().catch(() => {})
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

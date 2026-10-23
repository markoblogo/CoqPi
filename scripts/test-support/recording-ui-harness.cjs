/* global window, document, innerWidth */
const path = require('node:path')
const fs = require('node:fs/promises')
const { chromium } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
exports.start = async () => {
  const {createServer}=await import(path.join(process.cwd(),'node_modules/vite/dist/node/index.js'))
  const server=await createServer({server:{host:'127.0.0.1',port:5191,strictPort:true}})
  try { await server.listen() } catch (error) { await server.close(); throw error }
  let browser
  try { browser = await chromium.launch({headless:true}) } catch(e) { await server.close(); throw e }
  const context = await browser.newContext({viewport:{width:1100,height:700}})
  const blocked = [], errors = []
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:5191') return route.continue()
    blocked.push(route.request().url()); return route.abort()
  })
  await context.addInitScript(() => {
    window.__audit = {calls:[], requests:[], current:null, key:false, failAssistant:false}
    const a=window.__audit
    let session={company:'',role:'',context:'',goal:'',notes:'',selectedCounterpartyPackIds:[],selectedFinderOutreachDraftId:''}
    let settings={costMode:'balanced',defaultCallLanguage:'Auto',defaultAnswerLanguage:'Auto',includeProfileContextByDefault:true,saveTranscriptByDefault:false,monitorBaseUrl:'https://example.invalid',monitorCompanyId:'',monitorClientName:'',monitorLiveCopilotEnabled:false,monitorConsentConfirmed:false,monitorAllowAiProcessing:false}
    const meta={appVersion:'0.3.2',productName:'CoqPi',safeStorageAvailable:true}
    const manifest={version:1,sources:[],counterpartyPacks:[],knowledgePackLifecycle:[]}
    const finder={version:1,jobs:[],results:[],outreachDrafts:[]}
    let sessions=[]
    const status=()=>({hasEnvFile:false,hasOpenAIKey:a.key,hasStoredKey:a.key,effectiveKeyAvailable:a.key})
    const api={
      config:{getStatus:status},profile:{getContext:()=>({content:''}),reloadContext:()=>({content:''})},
      session:{getContext:()=>({context:session}),saveContext:v=>({context:session=v})},
      contextSources:{get:()=>({manifest})},
      settings:{get:()=>({settings,meta}),save:v=>({settings:settings=v,meta})},
      secrets:{getOpenAIKeyStatus:()=>({hasStoredKey:a.key,hasEnvKey:false,effectiveKeyAvailable:a.key,source:a.key?'secure-storage':'none'}),saveOpenAIKey:()=>{a.key=true;return {}},deleteOpenAIKey:()=>{a.key=false;return {}}},
      monitor:{getTokenStatus:()=>({hasStoredToken:false,effectiveTokenAvailable:false})},
      smokeNotes:{get:()=>({notes:[]})},finderSearch:{get:()=>({store:finder})},
      trainingSessions:{get:()=>({sessions}),save:entry=>{sessions=[entry,...sessions.filter(x=>x.id!==entry.id)];return {sessions}}},
      meetingTranscription:{getCurrent:()=>a.current,saveCurrent:v=>{a.current=v;return v},flush:()=>{},clearCurrent:()=>{a.current=null},onShutdown:()=>()=>{},list:()=>({sessions:[]})},
      realtime:{createTranscriptionAnswer:()=>a.failRealtime ? {ok:false,error:{message:'Synthetic STT unavailable'}} : {ok:true,data:{answerSdp:'fixture'}}},
      assistant:{analyzeRecentTranscript:async request=>{a.requests.push(request);await new Promise(r=>setTimeout(r,700));if(a.failAssistant)return {ok:false,error:{message:'Synthetic network interruption',code:'network_error'}};return {ok:true,data:{meaningRu:'Расскажите о вашем подходе к работе.',detectedQuestion:request.transcriptText,intent:'question',risk:'',suggestedAnswers:[{label:'short',text:request.answerLanguage==='fr'?'Je commencerais par clarifier les objectifs et les contraintes.':'I would first clarify the goals and constraints.',answerMeaningRu:'Я бы начал с уточнения целей и ограничений.'}],keywordsToRemember:[],model:'AUDIT FIXTURE',latencyMs:700}}}}
    }
    a.api=api
    window.AudioContext=class {
      sampleRate=24000;destination={};state='running'
      async resume(){} async close(){}
      createMediaStreamSource(){return {connect(){},disconnect(){}}}
      createScriptProcessor(){return {connect(){},disconnect(){}}}
      createGain(){return {gain:{value:0},connect(){},disconnect(){}}}
      createAnalyser(){return {fftSize:256,frequencyBinCount:128,connect(){},disconnect(){},getByteTimeDomainData(b){b.fill(128)}}}
    }
    api.meetingTranscription.backupStart=()=>({manifestId:'synthetic',manifest:{status:'recording',updatedAt:new Date().toISOString()}})
    api.meetingTranscription.backupStop=()=>({manifestId:'synthetic',manifest:{status:'stopped',updatedAt:new Date().toISOString()}})
    window.coqpi = new Proxy(api, {get(target,group) {
      return new Proxy(target[group] || {}, {get(methods,method) {
        if(method==='then') return undefined
        return (...args) => {
          a.calls.push(`${String(group)}.${String(method)}`)
          if(method==='onShutdown') return ()=>{}
          if(methods[method]) return Promise.resolve(methods[method](...args))
          return Promise.reject(new Error(`AUDIT_UNIMPLEMENTED ${String(group)}.${String(method)}`))
        }
      }})
    }})
    navigator.mediaDevices.getUserMedia=async constraints=>{if(a.denyMic)throw new DOMException('Synthetic permission denied','NotAllowedError');if(a.delayInput)await new Promise(resolve=>{a.releaseInput=resolve});const label=constraints.audio?.deviceId?.exact || 'mic'; const make=()=>({clone:make,getTracks:()=>[{label,stop(){},addEventListener(){}}],getAudioTracks:()=>[{label,getSettings(){return {deviceId:label}},stop(){},addEventListener(){}}]});return make()}
    navigator.mediaDevices.enumerateDevices=async()=>[{kind:'audioinput',deviceId:'synthetic-mic',groupId:'audit',label:'Synthetic microphone',toJSON(){return {}}},{kind:'audioinput',deviceId:'synthetic-loopback',groupId:'audit',label:'Synthetic loopback',toJSON(){return {}}}]
    navigator.permissions.query=async()=>({state:'granted',addEventListener(){},removeEventListener(){}})
    window.RTCPeerConnection=class {
      iceGatheringState='complete';connectionState='new';localDescription={sdp:'fixture'}
      createDataChannel(){this.channel=new EventTarget();this.channel.readyState='open';this.channel.close=()=>{};a.channel=this.channel;(a.channels ||= []).push(this.channel);return this.channel}
      addTrack(track){(a.tracks ||= []).push(track.label)} async createOffer(){return {sdp:'fixture'}} async setLocalDescription(){}
      async setRemoteDescription(){this.connectionState='connected';this.onconnectionstatechange?.();this.channel.dispatchEvent(new Event('open'))}
      close(){} addEventListener(){} removeEventListener(){}
    }
  })
  const page=await context.newPage()
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5191')
  await page.locator('.call-focus').waitFor()
  const dir=path.join(process.cwd(),'tmp/recording-regression');await fs.mkdir(dir,{recursive:true})
  const snap=async name=>{
    await page.screenshot({path:path.join(dir,name+'.png')})
    const evidence=await page.evaluate(()=>({text:document.body.innerText,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,calls:window.__audit.calls,requests:window.__audit.requests,overflow:[...document.querySelectorAll('main,section,article,button,select,input,textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+2||r.left< -2)}).map(el=>({tag:el.tagName,class:el.className,text:el.textContent.slice(0,100),bounds:el.getBoundingClientRect().toJSON()}))}))
    await fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(evidence,null,2));return {name,width:evidence.width,scrollWidth:evidence.scrollWidth,overflow:evidence.overflow.length,errors}
  }
  return {page,browser,server,context,snap,blocked,errors,close:async()=>{await browser.close();await server.close()}}
}

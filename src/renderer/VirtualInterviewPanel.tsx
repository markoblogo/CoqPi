import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Play, Square, Download } from 'lucide-react'
import { VirtualInterviewSession } from '@shared/virtual-interview-session'
import type { MeetingTranscriptionSession } from '@shared/meeting-transcription'
import { RealtimeTranscriptionClient } from './realtime/realtime-transcription-client'
import { RawAudioBackupRecorder } from './raw-audio-backup-recorder'
import './virtual-interview.css'
import { InterviewAudioReviewPanel } from './InterviewAudioReviewPanel'
import { personalHintRequest, type RehearsalSummary } from '@shared/personal-rehearsal'
import { PersonalRehearsalReport } from './PersonalRehearsalReport'

export const VirtualInterviewPanel = ({ onBack, personal }: { onBack: () => void; personal?: RehearsalSummary }) => {
  const [, render] = useState(0)
  const [language, setLanguage] = useState<'en' | 'fr'>(personal?.language ?? 'fr')
  const [typed, setTyped] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [inputId, setInputId] = useState('')
  const input = useRef('')
  input.current = inputId
  const [archives, setArchives] = useState<Array<{ id: string; startedAt: string; practiceCompany?: string }>>([])
  const [archive, setArchive] = useState<MeetingTranscriptionSession | null>(null)
  const mounted = useRef(true)
  const mic = useRef<MediaStream | null>(null)
  const voice = useRef(new RealtimeTranscriptionClient())
  const cancelSpeech = useRef<() => void>(() => undefined)
  const backup = useRef(new RawAudioBackupRecorder(message => {
    if (controller.current) { controller.current.error = message; if (mounted.current) render(value => value + 1) }
  }))
  const controller = useRef<VirtualInterviewSession | null>(null)
  if (!controller.current) controller.current = new VirtualInterviewSession({
    id: () => crypto.randomUUID(), now: () => Date.now(),
    changed: () => { if (mounted.current) render(value => value + 1) },
    save: session => window.coqpi.meetingTranscription.saveCurrent(session),
    flush: () => window.coqpi.meetingTranscription.flush(),
    analyze: request => window.coqpi.assistant.analyzeRecentTranscript(request),
    cancel: id => window.coqpi.assistant.cancel(id),
    openAudio: async sessionId => {
      // Keep an independent PCM stream alive through STT and assistant failures.
      mic.current = await navigator.mediaDevices.getUserMedia({ audio: { ...(input.current ? { deviceId: { exact: input.current } } : {}), echoCancellation: true, noiseSuppression: true }, video: false })
      const result = await backup.current.start({ sessionId, stream: mic.current.clone(), now: new Date().toISOString() })
      if (controller.current?.session) controller.current.session.audioBackup = { manifestId: result.manifestId, status: result.manifest.status, updatedAt: result.manifest.updatedAt }
    },
    closeAudio: async () => {
      mic.current?.getTracks().forEach(track => track.stop()); mic.current = null
      const result = await backup.current.stop(new Date().toISOString())
      if (result && controller.current?.session) controller.current.session.audioBackup = { manifestId: result.manifestId, status: result.manifest.status, updatedAt: result.manifest.updatedAt }
    },
    speak: (text, lang) => new Promise<void>((resolve, reject) => {
      if (!window.speechSynthesis) { reject(new Error('Speech synthesis unavailable')); return }
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang === 'fr' ? 'fr-FR' : 'en-GB'
      const finish = (failed = false) => { clearTimeout(timeout); cancelSpeech.current = () => undefined; if (failed) reject(new Error('Question audio interrupted')); else resolve() }
      const timeout = setTimeout(() => { window.speechSynthesis.cancel(); finish(true) }, 30000)
      utterance.onend = () => finish()
      utterance.onerror = () => finish(true)
      cancelSpeech.current = () => { window.speechSynthesis.cancel(); finish(true) }
      window.speechSynthesis.speak(utterance)
    }),
    cancelSpeech: () => cancelSpeech.current(),
    listen: async (lang, onEvent, onError) => {
      if (!mic.current) throw new Error('Microphone unavailable')
      await voice.current.start({ inputStream: mic.current, selectedAudioDeviceId: '', callLanguage: lang, latencyMode: 'conversation',
        onEvent, onError, onStatusChange: () => undefined, onDebugEventType: () => undefined,
        onLifecycleLog: () => undefined, onPeerConnectionStateChange: () => undefined,
        onIceConnectionStateChange: () => undefined, onIceGatheringStateChange: () => undefined,
        onDataChannelStateChange: () => undefined })
    },
    stopListening: () => voice.current.stop()
  }, personal ? {
    snapshotId: personal.id, snapshotHash: personal.hash, company: personal.company, maxTurns: personal.maxTurns,
    question: (session, index) => window.coqpi.rehearsal.question({ snapshotId: personal.id, sessionId: session.id, index }).then(value => value.question),
    request: (sessionId, language, question, streamId) => personalHintRequest(personal.id, sessionId, language, question, streamId)
  } : undefined)
  const interview = controller.current
  useEffect(() => {
    mounted.current = true
    void navigator.mediaDevices.enumerateDevices().then(items => setDevices(items.filter(item => item.kind === 'audioinput'))).catch(() => undefined)
    const unsubscribe = window.coqpi.assistant.onProgress(event => interview.progress(event))
    const shutdown = window.coqpi.meetingTranscription.onShutdown(() => interview.stop())
    void window.coqpi.meetingTranscription.history().then(items => setArchives(items.filter(item => item.scenario === (personal ? 'PERSONAL interview rehearsal' : 'FICTIONAL virtual interview')))).catch(() => undefined)
    return () => {
      mounted.current = false; unsubscribe()
      // Keep the close barrier until navigation-triggered saving has completed.
      void interview.stop().then(shutdown).catch(() => undefined)
    }
  }, [interview, personal])

  const run = (operation: Promise<unknown>) => { void operation.catch(error => { interview.error = error instanceof Error ? error.message : 'Operation failed'; render(value => value + 1) }) }
  const active = !['idle', 'stopped'].includes(interview.phase)
  const session = archive ?? interview.session
  const question = interview.session?.practice?.turns[interview.index]?.question
  const answers = interview.session?.segments.filter(segment => segment.sourceItemId?.startsWith(`turn-${interview.index}:`)) ?? []
  const pending = Object.values(interview.session?.interim ?? {}).filter(segment => segment.itemId.startsWith(`turn-${interview.index}:`))
  const timing = session?.practice?.turns ?? []
  const ms = (value?: number) => value === undefined ? '—' : `${(value / 1000).toFixed(1)} s`

  return <main className="virtual-interview" aria-label={personal ? 'Personal interview' : 'Virtual interview'}>
    {!active && <header className="virtual-setup">
      <h2>{personal ? personal.company : 'Virtual interview'}</h2>
      <select aria-label="Interview language" disabled={!!personal} value={language} onChange={event => setLanguage(event.target.value as 'en' | 'fr')}><option value="fr">Français</option><option value="en">English</option></select>
      <button onClick={() => { setArchive(null); run(interview.start(language)) }}><Play size={16} /> Start</button>
      <button onClick={onBack}>{personal ? 'Materials' : 'Language lesson'}</button>
      <p>{personal ? `${personal.role} · ${personal.maxTurns} questions · ${personal.goal}` : 'Fictional company: Atelier Pilot. Product strategy role, booking tool for small studios, six-week pilot. Five questions.'}</p>
      {personal && <details><summary>Frozen materials</summary>{personal.materials.map(item => <p key={item.kind}>{item.label} · {item.hash.slice(0, 12)}</p>)}</details>}
      <details><summary>Microphone</summary><select aria-label="Practice microphone" value={inputId} onChange={event => setInputId(event.target.value)}><option value="">System default</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Audio input'}</option>)}</select></details>
    </header>}
    {active && <div className="virtual-controls virtual-toolbar">
      <span>{Math.max(1, interview.index + 1)} / {interview.maxTurns} · {interview.phase === 'question' ? 'Interviewer speaking' : interview.phase === 'answer' ? 'Your answer' : interview.phase === 'preparing' ? 'Preparing question' : interview.phase}</span>
      <button disabled={(!['answer', 'question-error'].includes(interview.phase)) || answers.length === 0 || (pending.length > 0 && interview.session?.practice?.turns[interview.index]?.input !== 'typed')} onClick={() => run(interview.next())}>{interview.phase === 'question-error' ? 'Retry question' : interview.index === interview.maxTurns - 1 ? 'Finish' : 'Next'}<ArrowRight size={16} /></button>
      <button title="Stop and save interview" onClick={() => run(interview.stop())}><Square size={16} /> Stop</button>
    </div>}
    {interview.error && <p role="alert">{interview.error}</p>}
    {active && <>
      <p className="virtual-question">{interview.phase === 'preparing' ? 'Preparing the next interview question…' : question ?? 'Opening microphone…'}</p>
      <div className="virtual-hint" aria-live="polite">{interview.hint || 'Preparing your response…'}</div>
      <div className="virtual-controls">
        <span className="virtual-answer">{pending.map(item => item.text).join(' ') || answers.map(item => item.text).join(' ') || (interview.phase === 'answer' ? 'Listening…' : '')}</span>
      </div>
      <details><summary>Typed answer</summary><textarea aria-label="Typed practice answer" value={typed} onChange={event => setTyped(event.target.value)} /><button disabled={interview.phase !== 'answer' || !typed.trim()} onClick={() => { interview.typed(typed); setTyped('') }}>Save typed answer</button></details>
    </>}
    {!active && interview.phase === 'stopped' && <p>Interview saved.</p>}
    {!active && session?.status === 'stopped' && !!session.practice?.turns.length && <InterviewAudioReviewPanel key={`audio:${session.id}`} session={session} />}
    {!active && session?.status === 'stopped' && session.practice?.kind === 'personal-interview' && <PersonalRehearsalReport key={`report:${session.id}`} session={session} />}
    <details className="virtual-results"><summary>Recording & timing</summary>
      {!active && <select aria-label="Saved practice" value={archive?.id ?? ''} onChange={event => {
        if (!event.target.value) { setArchive(null); return }
        run(window.coqpi.meetingTranscription.read(event.target.value).then(item => { if (item?.practice?.kind === (personal ? 'personal-interview' : 'virtual-interview')) setArchive(item); else throw new Error('This recording is not in the selected practice mode.') }))
      }}><option value="">Current interview</option>{archives.map(item => <option key={item.id} value={item.id}>{item.startedAt}{item.practiceCompany ? ` · ${item.practiceCompany}` : ''}</option>)}</select>}
      {session && <button title="Export transcript" onClick={() => run(window.coqpi.meetingTranscription.exportSession({ session, format: 'md' }))}><Download size={16} /> Transcript</button>}
      {timing.map((turn, index) => <p key={index}>{index + 1}. First text {ms(turn.firstHintMs)} · Full hint {ms(turn.fullHintMs)} · Model {ms(turn.modelMs)} · STT after speech {turn.input === 'typed' ? 'typed input' : ms(turn.sttFinalMs)}{turn.error ? ` · ${turn.error}` : ''}</p>)}
      {session?.segments.map(segment => <p key={segment.id}><strong>{segment.speaker}</strong> {segment.text}</p>)}
    </details>
  </main>
}

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Play, Headphones } from 'lucide-react'
import { RepeatCapture } from '@shared/repeat-capture'
import type { RepeatAttempt, RepeatTarget } from '@shared/interview-repeat'
import { RawAudioBackupRecorder } from './raw-audio-backup-recorder'

export const RepeatPracticePanel = ({ target, onBusy }: { target: RepeatTarget; onBusy: (active: boolean) => void }) => {
  const [, render] = useState(0)
  const [attempts, setAttempts] = useState<RepeatAttempt[]>([])
  const [selected, setSelected] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [audio, setAudio] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const device = useRef(''); device.current = deviceId
  const alive = useRef(true)
  const busyCallback = useRef(onBusy); busyCallback.current = onBusy
  const recorder = useRef(new RawAudioBackupRecorder(message => { if (capture.current) { capture.current.error = message; if (alive.current) render(value => value + 1) } }))
  const capture = useRef<RepeatCapture | null>(null)
  const targetRef = useRef(target); targetRef.current = target
  if (!capture.current) capture.current = new RepeatCapture({
    create: () => window.coqpi.meetingTranscription.repeatCreate(targetRef.current),
    open: async audioSessionId => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(device.current ? { deviceId: { exact: device.current } } : {}), echoCancellation: true, noiseSuppression: true }, video: false })
      await recorder.current.start({ sessionId: audioSessionId, stream, now: new Date().toISOString() })
    },
    close: async () => { await recorder.current.stop(new Date().toISOString()) },
    finish: async (id, failed) => { await window.coqpi.meetingTranscription.repeatFinish({ id, failed }) },
    changed: () => { if (alive.current) render(value => value + 1) }
  })
  const controller = capture.current
  const active = ['opening', 'recording', 'stopping'].includes(controller.phase)
  const refresh = async () => {
    const values = await window.coqpi.meetingTranscription.repeatList(targetRef.current)
    if (alive.current) { setAttempts(values); setSelected(current => values.some(value => value.id === current) ? current : values.find(value => value.recorded && !value.captureFailed)?.id ?? '') }
  }
  const perform = (operation: Promise<unknown>) => {
    setWorking(true); setError('')
    void operation.catch(reason => { if (alive.current) setError(String(reason)) }).finally(() => { if (alive.current) setWorking(false) })
  }
  useEffect(() => {
    alive.current = true
    void navigator.mediaDevices.enumerateDevices().then(values => { if (alive.current) setDevices(values.filter(value => value.kind === 'audioinput')) }).catch(() => undefined)
    void window.coqpi.meetingTranscription.repeatList(targetRef.current).then(values => { if (alive.current) { setAttempts(values); setSelected(values.find(value => value.recorded && !value.captureFailed)?.id ?? '') } }).catch(reason => { if (alive.current) setError(String(reason)) })
    const unregister = window.coqpi.meetingTranscription.onShutdown(() => controller.stop())
    return () => {
      alive.current = false
      void controller.stop().then(unregister).catch(() => undefined)
      busyCallback.current(false)
    }
  }, [controller])
  useEffect(() => { busyCallback.current(active || working) }, [active, working])
  useEffect(() => {
    if (controller.phase !== 'recording') return
    const timeout = setTimeout(() => { perform(controller.stop().then(refresh)) }, 20000)
    return () => clearTimeout(timeout)
    // The capture phase, not elapsed rerenders, owns the hard time limit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller.phase])
  const attempt = attempts.find(item => item.id === selected)
  return <section aria-label="Repeat and compare">
    <div className="virtual-controls">
      <select aria-label="Repeat microphone" disabled={active || working} value={deviceId} onChange={event => setDeviceId(event.target.value)}><option value="">System default microphone</option>{devices.map(item => <option key={item.deviceId} value={item.deviceId}>{item.label || 'Microphone'}</option>)}</select>
      {!active ? <button disabled={working} onClick={() => { setAudio(''); window.speechSynthesis?.cancel(); perform(controller.start()) }}><Mic size={16} /> Record repeat</button> : <button onClick={() => perform(controller.stop().then(refresh))}><Square size={16} /> Stop repeat</button>}
      {active && <span role="status">{controller.phase === 'recording' ? 'Recording · max 20 s' : controller.phase}</span>}
    </div>
    {(error || controller.error) && <p role="alert">{error || controller.error}</p>}
    {!active && attempts.length > 0 && <>
      <select aria-label="Saved repeat attempt" disabled={working} value={selected} onChange={event => { setSelected(event.target.value); setAudio('') }}><option value="">Choose a saved attempt</option>{attempts.map(item => <option key={item.id} value={item.id}>{item.createdAt} {item.captureFailed ? '· capture failed' : !item.recorded ? '· incomplete' : ''}</option>)}</select>
      {attempt?.recorded && !attempt.captureFailed && <div className="virtual-controls">
        <button disabled={working} onClick={() => perform(window.coqpi.meetingTranscription.repeatClip(attempt.id).then(clip => { if (alive.current) setAudio(`data:audio/wav;base64,${clip.base64}`) }))}><Play size={16} /> Play repeat</button>
        <button disabled={working || !!attempt.comparison} onClick={() => perform(window.coqpi.meetingTranscription.repeatCompare({ id: attempt.id, consent: true }).then(refresh))}><Headphones size={16} /> {working ? 'Comparing…' : 'Send both clips to OpenAI'}</button>
      </div>}
      {audio && <audio controls src={audio} aria-label="Repeat recording" />}
      {attempt?.comparison && <div aria-label="Tentative comparison">
        <p>Tentative comparison</p>
        <p><strong>{{ supported: 'Possible issue heard', unsupported: 'Recommendation not supported', uncertain: 'Original issue uncertain', not_checked: 'Not checked' }[attempt.comparison.check.quality]}</strong> · {attempt.comparison.check.reason}</p>
        <p><strong>{{ improved: 'Possibly clearer', not_improved: 'No clear improvement', uncertain: 'Not enough evidence', same_audio: 'Identical audio', not_assessed: 'Not assessed' }[attempt.comparison.outcome]}</strong> · {attempt.comparison.reason}</p>
        {attempt.comparison.originalEvidence && <p>A: {attempt.comparison.originalEvidence}<br />B: {attempt.comparison.repeatEvidence}</p>}
      </div>}
    </>}
  </section>
}

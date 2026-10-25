import { useEffect, useRef, useState } from 'react'
import { Play, Check, X, Headphones } from 'lucide-react'
import type { MeetingTranscriptionSession } from '@shared/meeting-transcription'
import type { InterviewAudioReview } from '@shared/interview-audio-review'
import { RepeatPracticePanel } from './RepeatPracticePanel'

export const InterviewAudioReviewPanel = ({ session }: { session: MeetingTranscriptionSession }) => {
  const [index, setIndex] = useState(0)
  return <details className="virtual-results"><summary>Voice answer review</summary>
    <select aria-label="Answer to review" value={index} onChange={event => setIndex(Number(event.target.value))}>
      {session.practice?.turns.map((turn, i) => <option key={i} value={i}>{i + 1}. {turn.question}</option>)}
    </select>
    <AnswerReview key={`${session.id}:${index}`} session={session} index={index} />
  </details>
}

const AnswerReview = ({ session, index }: { session: MeetingTranscriptionSession; index: number }) => {
  const [review, setReview] = useState<InterviewAudioReview | null>(null)
  const [mode, setMode] = useState<'read' | 'paraphrase'>('read')
  const [audio, setAudio] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [practiceIndex, setPracticeIndex] = useState<number | null>(null)
  const alive = useRef(true)
  const request = { sessionId: session.id, turnIndex: index }
  const turn = session.practice?.turns[index]
  const eligible = turn?.input === 'voice' && !!turn.answerStartedAt && !!turn.answerEndedAt
  const run = (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    void operation().catch(reason => { if (alive.current) setError(reason instanceof Error ? reason.message : 'Review unavailable. Recording is preserved.') }).finally(() => { if (alive.current) setBusy(false) })
  }
  useEffect(() => {
    alive.current = true
    if (eligible) void window.coqpi.meetingTranscription.audioReviewRead({ sessionId: session.id, turnIndex: index }).then(value => {
      if (alive.current) { setReview(value); if (value) setMode(value.mode) }
    }).catch(reason => { if (alive.current) setError(String(reason)) }).finally(() => { if (alive.current) setBusy(false) })
    return () => { alive.current = false; window.speechSynthesis?.cancel() }
  }, [session.id, index, eligible])
  const speak = (text: string) => {
    window.speechSynthesis?.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = session.language === 'fr' ? 'fr-FR' : 'en-GB'
    window.speechSynthesis.speak(utterance)
  }
  if (!eligible) return <p>Not assessed: typed answer or missing audio boundaries. Record a new voice interview.</p>
  return <section aria-label="Audio answer feedback">
    <div className="virtual-controls">
      <select aria-label="Answer delivery" disabled={busy} value={mode} onChange={event => { setMode(event.target.value as 'read' | 'paraphrase'); setReview(null) }}><option value="read">Read the hint</option><option value="paraphrase">My own wording</option></select>
      <button disabled={busy} onClick={() => run(async () => { const clip = await window.coqpi.meetingTranscription.audioClip(request); if (alive.current) setAudio(`data:audio/wav;base64,${clip.base64}`) })}><Play size={16} /> My recording</button>
      <button disabled={busy || (!!review && review.mode === mode)} onClick={() => run(async () => { const result = await window.coqpi.meetingTranscription.audioReview({ ...request, mode, consent: true }); if (alive.current) setReview(result) })}><Headphones size={16} /> {busy ? 'Working…' : 'Send clip to OpenAI for review'}</button>
    </div>
    {audio && <audio controls src={audio} aria-label="Recorded answer" />}
    {error && <p role="alert">{error}</p>}
    {review && <>
      <p>{review.status === 'not_assessed' ? 'Not assessed' : 'Tentative audio feedback'} · {review.summary}</p>
      {review.findings.length === 0 && review.status === 'reviewed' && <p>No sufficiently clear pronunciation issue identified.</p>}
      {review.findings.map((finding, findingIndex) => <div key={findingIndex} className="virtual-finding">
        <strong>{finding.word}</strong> · {(finding.startMs / 1000).toFixed(1)}–{(finding.endMs / 1000).toFixed(1)} s · {finding.decision}
        <p>{finding.heard} → {finding.correction}</p><p>{finding.explanation}</p>
        <button disabled={busy} title="Hear a correct example" onClick={() => speak(finding.example)}><Play size={16} /> {finding.example}</button>
        <div className="virtual-controls">{(['confirmed', 'dismissed'] as const).map(decision => <button key={decision} disabled={busy || finding.decision === decision} onClick={() => run(async () => { const value = await window.coqpi.meetingTranscription.audioReviewDecide({ ...request, findingIndex, decision }); if (alive.current) setReview(value) })}>{decision === 'confirmed' ? <Check size={16} /> : <X size={16} />}{decision === 'confirmed' ? 'Confirm' : 'Dismiss'}</button>)}</div>
        {finding.decision !== 'dismissed' && <button disabled={busy} onClick={() => setPracticeIndex(practiceIndex === findingIndex ? null : findingIndex)}>Repeat & compare</button>}
        {practiceIndex === findingIndex && finding.decision !== 'dismissed' && <RepeatPracticePanel key={`${review.audioHash}:${findingIndex}`} target={{ ...request, findingIndex }} onBusy={active => { setBusy(active); if (active) { setAudio(''); window.speechSynthesis?.cancel() } }} />}
      </div>)}
    </>}
  </section>
}

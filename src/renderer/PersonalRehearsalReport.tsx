import { useEffect, useRef, useState } from 'react'
import type { MeetingTranscriptionSession } from '@shared/meeting-transcription'
import type { RehearsalReport } from '@shared/personal-rehearsal'

export const PersonalRehearsalReport = ({ session }: { session: MeetingTranscriptionSession }) => {
  const [report, setReport] = useState<RehearsalReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  const hasAnswers = session.segments.some(segment => segment.sourceItemId?.startsWith('turn-') && segment.speaker?.startsWith('ME'))
  useEffect(() => {
    alive.current = true; setReport(null); setError('')
    if (hasAnswers) {
      setBusy(true)
      void window.coqpi.rehearsal.readReview({ snapshotId: session.practice?.snapshotId ?? '', sessionId: session.id }).then(value => { if (alive.current) setReport(value) }).catch(reason => { if (alive.current) setError(String(reason)) }).finally(() => { if (alive.current) setBusy(false) })
    }
    return () => { alive.current = false }
  }, [session.id, session.practice?.snapshotId, hasAnswers])
  return <section className="virtual-results" aria-label="Personal interview review">
    <p>{session.practice?.company} · {session.practice?.snapshotHash?.slice(0, 12)}</p>
    <button disabled={busy || !hasAnswers} onClick={() => { setBusy(true); setError(''); void window.coqpi.rehearsal.review({ snapshotId: session.practice?.snapshotId ?? '', sessionId: session.id }).then(value => { if (alive.current) setReport(value) }).catch(reason => { if (alive.current) setError(String(reason)) }).finally(() => { if (alive.current) setBusy(false) }) }}>{busy ? 'Reviewing…' : report ? 'Reload saved review' : 'Review interview'}</button>
    {error && <p role="alert">{error}</p>}
    {report && <><p>Draft review · pronunciation not assessed from text</p>{(['strengths', 'claimsToCheck', 'languagePoints', 'nextSteps'] as const).map(key => <details key={key} open={key === 'nextSteps'}><summary>{{ strengths: 'What worked', claimsToCheck: 'Facts to verify', languagePoints: 'Language', nextSteps: 'Before the interview' }[key]}</summary>{report[key].map((item, index) => <div key={index}><p>{item.text}</p><details><summary>Source evidence</summary>{item.evidence.map((evidence, i) => <blockquote key={i}>{evidence.source}: {evidence.quote}</blockquote>)}</details></div>)}</details>)}</>}
  </section>
}

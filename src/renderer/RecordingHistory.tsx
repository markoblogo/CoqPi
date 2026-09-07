import { useState } from 'react'
import { Download, RefreshCw, NotebookPen } from 'lucide-react'

export const RecordingHistory = () => {
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof window.coqpi.meetingTranscription.history>>>([])
  const [error, setError] = useState('')
  const [review, setReview] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const analyze = async (id: string) => {
    setReviewing(true); setError('')
    try {
      const session = await window.coqpi.meetingTranscription.read(id)
      if (!session) throw new Error('Recording not found')
      const response = await window.coqpi.assistant.analyzeRecentTranscript({
        transcriptText: session.segments.map(segment => `${segment.speaker ?? 'UNKNOWN'}: ${segment.text}`).join('\n'),
        callLanguage: session.language, answerLanguage: session.language, responseStyle: 'review',
        mode: 'full', includeProfileContext: false, recentWindowLabel: 'full', costMode: 'balanced'
      })
      if (!response.ok) throw new Error(response.error.message)
      setReview([response.data.meaningRu, response.data.detectedQuestion, response.data.risk, response.data.suggestedAnswers[0]?.text].filter(Boolean).join('\n\n'))
    } catch (cause) { setError(String(cause)) }
    finally { setReviewing(false) }
  }
  const refresh = async () => {
    try { setSessions(await window.coqpi.meetingTranscription.history()); setError('') }
    catch { setError('Unable to read recording history.') }
  }
  const download = async (id: string) => {
    try {
      const session = await window.coqpi.meetingTranscription.read(id)
      if (session) await window.coqpi.meetingTranscription.exportSession({ session, format: 'md' })
    } catch { setError('Unable to export this recording.') }
  }
  return <details className="recording-history" onToggle={event => { if (event.currentTarget.open) void refresh() }}>
    <summary>Saved conversations</summary>
    <button title="Refresh recordings" aria-label="Refresh recordings" onClick={() => void refresh()}><RefreshCw size={16} /></button>
    {error && <p role="alert">{error}</p>}
    {!sessions.length && <p>No saved conversations.</p>}
    {sessions.map(session => <div className="recording-history-row" key={session.id}>
      <time>{new Date(session.startedAt).toLocaleString()}</time>
      <span>{session.language.toUpperCase()} · {session.segmentCount} segments</span>
      <button title="Export conversation" aria-label="Export conversation" onClick={() => void download(session.id)}><Download size={16} /></button>
      <button title="Review conversation with assistant" aria-label="Review conversation with assistant" disabled={reviewing || !session.segmentCount} onClick={() => void analyze(session.id)}><NotebookPen size={16} /></button>
    </div>)}
    {reviewing && <p role="status">Reviewing conversation…</p>}
    {review && <div className="conversation-review"><h3>Conversation review</h3><p>{review}</p></div>}
  </details>
}

import { useState } from 'react'
import type { AssistantAnalysisResult, SessionContext } from '@shared/app-types'

export const MeetingPreparationBrief = ({ context, onPractice, onSaved }: {
  context: SessionContext; onPractice: () => void; onSaved: (context: SessionContext) => void
}) => {
  const [brief, setBrief] = useState<AssistantAnalysisResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState<'en' | 'fr'>('fr')
  const [scope, setScope] = useState('')
  const currentScope = JSON.stringify(context)
  const current = scope === currentScope ? brief : null
  const prepare = async () => {
    setBusy(true); setError('')
    try {
      const response = await window.coqpi.assistant.analyzeRecentTranscript({
        transcriptText: `Prepare the meeting with ${context.company}, role ${context.role}. Goal: ${context.goal}. Use only explicitly selected materials and the submitted CV facts provided in this session.`,
        callLanguage: language, answerLanguage: language, includeProfileContext: true,
        sessionContext: context, selectedCounterpartyPackIds: context.selectedCounterpartyPackIds,
        mode: 'full', costMode: 'balanced', recentWindowLabel: 'full', responseStyle: 'preparation'
      })
      if (!response.ok) throw new Error(response.error.message)
      setBrief(response.data); setScope(currentScope)
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!current) return
    setBusy(true)
    try {
      const notes = `${context.notes}\n\nReviewed meeting strategy:\n${current.meaningRu}\nQuestions: ${current.detectedQuestion}\nEvidence limits: ${current.risk}`
      const payload = await window.coqpi.session.saveContext({ ...context, notes })
      onSaved(payload.context)
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }
  return <section className="meeting-preparation-brief">
    <h2>Meeting strategy</h2>
    <p>{context.company || 'No company selected'}{context.role ? ` · ${context.role}` : ''}</p>
    <div className="button-row">
      <select aria-label="Practice language" disabled={busy} value={language} onChange={event => { setLanguage(event.target.value as 'en' | 'fr'); setBrief(null) }}><option value="fr">French</option><option value="en">English</option></select>
      <button disabled={busy || !context.company || !context.selectedCounterpartyPackIds.length} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Prepare strategy'}</button>
      <button onClick={onPractice}>Practice this meeting</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {current && <div className="conversation-review"><p>{current.meaningRu}</p><p>{current.detectedQuestion}</p><p>{current.risk}</p><blockquote>{current.suggestedAnswers[0]?.text}</blockquote><button disabled={busy} onClick={() => void save()}>Use reviewed strategy in this meeting</button></div>}
  </section>
}

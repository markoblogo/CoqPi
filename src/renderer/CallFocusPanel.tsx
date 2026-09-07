import { Copy, Play, Square, Settings2, RefreshCw } from 'lucide-react'
import type { AssistantAnalysisResult, CallLanguage, RealtimeConnectionStatus } from '@shared/app-types'

interface Props {
  result: AssistantAnalysisResult | null
  heard: string
  stale: boolean
  analyzing: boolean
  status: RealtimeConnectionStatus
  language: CallLanguage
  detectedLanguage: string
  savedAt: string | null
  error: string | null
  saveError: string | null
  canStart: boolean
  canStop: boolean
  expanded: boolean
  onStart: () => void
  onStop: () => void
  onRetry: () => void
  onExpand: () => void
  onLanguage: (language: CallLanguage) => void
}

export const CallFocusPanel = (props: Props) => {
  const fresh = !props.stale && !props.analyzing && !props.error
  const answer = fresh ? props.result?.suggestedAnswers[0]?.text : undefined
  const native = props.detectedLanguage === 'ru' || props.detectedLanguage === 'uk'
  return <section className="call-focus" aria-label="Conversation assistant">
    <div className="call-focus-toolbar">
      <button aria-label="Start listening" title="Start listening" disabled={!props.canStart} onClick={props.onStart}><Play size={18} fill="currentColor" /></button>
      <button aria-label="Stop listening" title="Stop and save" disabled={!props.canStop} onClick={props.onStop}><Square size={15} fill="currentColor" /></button>
      <span role="status">{props.status === 'listening' ? 'Listening' : props.status}</span>
      <select aria-label="Conversation language" value={props.language} disabled={props.canStop} onChange={event => props.onLanguage(event.target.value as CallLanguage)}>
        {['Auto', 'English', 'French', 'Russian', 'Ukrainian'].map(language => <option key={language}>{language}</option>)}
      </select>
      <span className="call-save-status">{props.saveError ? 'Not saved' : props.savedAt ? 'Saved locally' : ''}</span>
      <button aria-label="Show conversation details" title="Conversation details" aria-expanded={props.expanded} onClick={props.onExpand}><Settings2 size={18} /></button>
    </div>
    {(props.error || props.saveError) && <div className="call-error" role="alert">
      {props.saveError ? `Recording: ${props.saveError}` : props.error}
      {!props.saveError && <button title="Retry assistant" aria-label="Retry assistant" disabled={props.analyzing} onClick={props.onRetry}><RefreshCw size={16} /></button>}
    </div>}
    <div className="call-answer" aria-live="polite" aria-busy={props.analyzing}>
      <div className="call-section-label">{answer ? 'Your answer' : props.analyzing ? 'Preparing your answer' : props.stale ? 'Waiting for a fresh answer' : 'Ready when you are'}
        {answer && <button title="Copy answer" aria-label="Copy answer" onClick={() => void navigator.clipboard.writeText(answer)}><Copy size={16} /></button>}
      </div>
      <p>{answer || (props.analyzing ? '…' : '—')}</p>
    </div>
    <div className="call-heard">
      <span className="call-section-label">{native ? 'You heard' : 'Meaning in Russian'}</span>
      <p>{fresh && props.result ? (native ? props.heard : props.result.meaningRu) : props.heard || 'Waiting for speech.'}</p>
    </div>
    {props.stale && props.result?.suggestedAnswers[0] && <details><summary>Previous answer</summary><p>{props.result.suggestedAnswers[0].text}</p></details>}
  </section>
}

import { ArrowLeft, Play, Square, Settings2, RefreshCw, Mic } from 'lucide-react'
import type { AssistantAnalysisResult, CallLanguage, RealtimeConnectionStatus } from '@shared/app-types'
import type { ReactNode } from 'react'

interface Props {
  onBack: () => void
  separateSources: boolean
  speaking: boolean
  onToggleSpeaking: () => void
  result: AssistantAnalysisResult | null
  progress?: {meaningRu:string; answer:string} | null
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
  marketPanel?: ReactNode
}

export const CallFocusPanel = (props: Props) => {
  const fresh = !props.stale && !props.analyzing && !props.error
  const progress = props.analyzing && !props.error ? props.progress : null
  const answer = progress?.answer || (fresh ? props.result?.suggestedAnswers[0]?.text : undefined)
  const native = props.detectedLanguage === 'ru' || props.detectedLanguage === 'uk'
  return <section className="call-focus" aria-label="Conversation assistant">
    <div className="call-focus-toolbar">
      {!props.canStop && <button aria-label="Choose mode" title="Choose mode" onClick={props.onBack}><ArrowLeft size={17} /></button>}
      <button className={props.canStop ? 'call-stop' : 'call-start'} aria-label={props.canStop ? 'Stop listening' : 'Start listening'} title={props.canStop ? 'Stop and save' : 'Start listening'} disabled={props.status === 'stopping' || (!props.canStop && !props.canStart)} onClick={props.canStop ? props.onStop : props.onStart}>
        {props.canStop ? <Square size={15} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
      <span className="call-passive-status" role="status">{props.status === 'listening' ? 'Listening' : props.status}</span>
      {!props.separateSources && props.canStop && <button className="call-speaker-toggle" aria-label="I am speaking" aria-pressed={props.speaking} title="Говорю я (пробел)" onClick={props.onToggleSpeaking}><Mic size={17} /><span>Говорю я</span></button>}
      {!props.canStop && <details className="call-options">
        <summary aria-label="Conversation options" title="Conversation options"><Settings2 size={17} /></summary>
        <div className="call-options-content">
          <select aria-label="Conversation language" value={props.language} onChange={event => props.onLanguage(event.target.value as CallLanguage)}>
            {['Auto', 'English', 'French', 'Russian', 'Ukrainian'].map(language => <option key={language}>{language}</option>)}
          </select>
          <button aria-label="Show conversation details" title="Conversation details" aria-expanded={props.expanded} onClick={props.onExpand}><Settings2 size={17} /></button>
        </div>
      </details>}
    </div>
    {(props.error || props.saveError) && <div className="call-error" role="alert">
      {props.saveError ? `Recording: ${props.saveError}` : props.error}
      {!props.saveError && <button title="Retry assistant" aria-label="Retry assistant" disabled={props.analyzing} onClick={props.onRetry}><RefreshCw size={16} /></button>}
    </div>}
    <div className="call-heard">
      <span className="call-section-label">{native ? 'Собеседник' : 'Перевод'}</span>
      <p>{native ? props.heard || 'Ожидаю собеседника…' : progress?.meaningRu || (fresh && props.result ? props.result.meaningRu : props.heard ? 'Перевожу…' : 'Ожидаю собеседника…')}</p>
    </div>
    <div className="call-answer" aria-live="polite" aria-busy={props.analyzing}>
      <div className="call-section-label">{props.analyzing ? 'Готовлю ответ…' : 'Ваш ответ'}</div>
      <p>{answer || (props.analyzing ? '…' : '—')}</p>
    </div>
    {props.expanded && props.marketPanel}
    {props.expanded && props.stale && props.result?.suggestedAnswers[0] && <details><summary>Previous answer</summary><p>{props.result.suggestedAnswers[0].text}</p></details>}
  </section>
}

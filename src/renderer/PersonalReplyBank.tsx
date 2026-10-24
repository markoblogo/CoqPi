import { useState } from 'react'
import { Check, Save, Plus, RefreshCw } from 'lucide-react'
import type { SessionContext, AssistantAnalysisRequest } from '@shared/app-types'
import type { PersonalReply, PersonalReplyBank as Bank } from '@shared/personal-reply-bank'

export const PersonalReplyBank = ({context}: {context: SessionContext}) => {
  const [bank, setBank] = useState<Bank | null>(null)
  const [entry, setEntry] = useState<PersonalReply | null>(null)
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const currentContext = JSON.stringify(context)
  const current = scope === currentContext ? bank : null
  const request: AssistantAnalysisRequest = {transcriptText:'Interview preparation context',mode:'full',
    callLanguage:'auto',answerLanguage:'en',includeProfileContext:true,sessionContext:context,
    selectedCounterpartyPackIds:context.selectedCounterpartyPackIds,costMode:'balanced',recentWindowLabel:'full',responseStyle:'brief'}
  const load = async () => {
    setBusy(true); setError(''); setEntry(null)
    try { setBank(await window.coqpi.assistant.getPersonalReplyBank(request)); setScope(currentContext) }
    catch (cause) { setError(String(cause)) } finally { setBusy(false) }
  }
  const save = async (approve: boolean) => {
    if (!entry || !current) return
    setBusy(true); setError('')
    try {
      setBank(await window.coqpi.assistant.savePersonalReply(request, {...entry, scopeHash:current.scopeHash}, approve))
      setEntry(null)
    } catch (cause) { setError(String(cause)) } finally { setBusy(false) }
  }
  return <details className="personal-reply-bank" onToggle={event => { if (event.currentTarget.open && !bank && !busy) void load() }}>
    <summary>Мои готовые ответы · EN / FR</summary>
    <div className="button-row">
      <button title="Обновить контекст" aria-label="Обновить банк ответов" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/></button>
      <button disabled={!current || busy} onClick={() => setEntry({id:'',language:'en',questions:[''],answer:'',evidence:[''],scopeHash:current!.scopeHash,approvedHash:null})}><Plus size={16}/> Новый ответ</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {bank && !current && <p role="status">Контекст изменён. Обновите банк.</p>}
    {current && <>
      {!current.entries.length && <p>Нет сохранённых ответов.</p>}
      {!!current.entries.length && <label>Выбрать ответ<select aria-label="Выбрать ответ" disabled={busy} value={entry?.id ?? ''}
        onChange={event => setEntry({...current.entries.find(item => item.id === event.target.value)!})}>
        <option value="" disabled>EN / FR · {current.entries.length}</option>
        {current.entries.map(item => <option key={item.id} value={item.id}>
          {item.language.toUpperCase()} · {item.questions[0]} · {item.scopeHash !== current.scopeHash ? 'Контекст изменён' : item.approvedHash ? 'Подтверждён' : 'Черновик'}
        </option>)}
      </select></label>}
      {entry && <fieldset disabled={busy}>
        <label>Язык<select value={entry.language} onChange={event => setEntry({...entry,language:event.target.value as 'en'|'fr',approvedHash:null})}><option value="en">English</option><option value="fr">Français</option></select></label>
        <label>Варианты вопроса<textarea rows={3} value={entry.questions.join('\n')} onChange={event => setEntry({...entry,questions:event.target.value.split('\n'),approvedHash:null})}/></label>
        <label>Мой ответ<textarea aria-label="Мой ответ" rows={5} value={entry.answer} onChange={event => setEntry({...entry,answer:event.target.value,approvedHash:null})}/></label>
        <label>Подтверждающие цитаты из профиля<textarea rows={3} value={entry.evidence.join('\n')} onChange={event => setEntry({...entry,evidence:event.target.value.split('\n'),approvedHash:null})}/></label>
        <details><summary>Факты моего профиля</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{current.ownerFacts}</pre></details>
        <div className="button-row">
          <button onClick={() => void save(false)}><Save size={16}/> Сохранить черновик / снять подтверждение</button>
          <button onClick={() => void save(true)}><Check size={16}/> Подтверждаю факты и ответ</button>
        </div>
      </fieldset>}
    </>}
  </details>
}

import { useEffect, useState } from 'react'
import { FileUp, Download, Lock } from 'lucide-react'
import type { RehearsalDraft, RehearsalMaterial, RehearsalSummary } from '@shared/personal-rehearsal'
import { validateRehearsalDraft } from '@shared/personal-rehearsal'
import { VirtualInterviewPanel } from './VirtualInterviewPanel'
import './virtual-interview.css'

const blank = (): RehearsalDraft => ({ company: '', role: '', goal: 'Prepare for the interview and clarify expectations.', language: 'fr', maxTurns: 8, confirmed: false,
  cv: { label: 'Exact submitted CV', text: '' }, vacancy: { label: 'Vacancy', text: '' }, companyInfo: { label: 'Company information', text: '' } })
export const PersonalRehearsalPanel = ({ onBack }: { onBack: () => void }) => {
  const [draft, setDraft] = useState(blank)
  const [snapshots, setSnapshots] = useState<RehearsalSummary[]>([])
  const [selected, setSelected] = useState<RehearsalSummary | null>(null)
  const [running, setRunning] = useState(false)
  const [packs, setPacks] = useState<RehearsalMaterial[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    void Promise.all([window.coqpi.rehearsal.list(), window.coqpi.session.getContext(), window.coqpi.contextPacks.get()]).then(([saved, prep, context]) => {
      if (!alive) return
      setSnapshots(saved)
      setDraft(current => ({ ...current, company: current.company || prep.context.company, role: current.role || prep.context.role }))
      setPacks((context.manifest.counterpartyPacks ?? []).filter(pack => pack.selected && pack.status === 'retrieval_ready' && prep.context.selectedCounterpartyPackIds.includes(pack.id) && Date.parse(pack.retention.expiresAt) > Date.now()).map(pack => ({ label: `${pack.partnerName} · ${pack.title}`, text: `${pack.summary}\n${pack.context}`, locator: pack.links[0] })))
    }).catch(reason => { if (alive) setError(String(reason)) })
    return () => { alive = false }
  }, [])
  const perform = (operation: () => Promise<void>) => { setBusy(true); setError(''); void operation().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false)) }
  const setMaterial = (kind: 'cv' | 'vacancy' | 'companyInfo', value: RehearsalMaterial) => setDraft(current => ({ ...current, [kind]: value, confirmed: false }))
  if (running && selected) return <VirtualInterviewPanel key={selected.id} personal={selected} onBack={() => setRunning(false)} />
  return <main className="virtual-interview" aria-label="Personal interview setup">
    <header className="virtual-setup"><h2>Personal interview</h2><button onClick={onBack}>Language lesson</button></header>
    {error && <p role="alert">{error}</p>}
    <select aria-label="Saved interview materials" disabled={busy} value={selected?.id ?? ''} onChange={event => setSelected(snapshots.find(item => item.id === event.target.value) ?? null)}><option value="">New materials</option>{snapshots.map(item => <option key={item.id} value={item.id}>{item.company} · {item.role} · {item.createdAt.slice(0, 10)}</option>)}</select>
    {selected ? <>
      <h3>{selected.company} · {selected.role}</h3>
      <p>{selected.language.toUpperCase()} · {selected.maxTurns} questions · {selected.goal}</p>
      <details><summary>Frozen material versions</summary>{selected.materials.map(item => <p key={item.kind}>{item.label} · {item.characters} characters · {item.hash.slice(0, 12)}</p>)}<p>{selected.hash}</p></details>
      <div className="virtual-controls"><button onClick={() => setRunning(true)}>Start rehearsal</button><button onClick={() => { setSelected(null); setDraft(current => ({ ...current, confirmed: false })) }}>New materials</button></div>
    </> : <>
      <label>Company<input aria-label="Rehearsal company" disabled={busy} value={draft.company} onChange={event => setDraft({ ...draft, company: event.target.value, confirmed: false })} /></label>
      <label>Role<input aria-label="Rehearsal role" disabled={busy} value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value, confirmed: false })} /></label>
      <label>Goal<input aria-label="Rehearsal goal" disabled={busy} value={draft.goal} onChange={event => setDraft({ ...draft, goal: event.target.value, confirmed: false })} /></label>
      <div className="virtual-controls"><select aria-label="Rehearsal language" disabled={busy} value={draft.language} onChange={event => setDraft({ ...draft, language: event.target.value as 'en' | 'fr', confirmed: false })}><option value="fr">Français</option><option value="en">English</option></select><select aria-label="Number of interview questions" disabled={busy} value={draft.maxTurns} onChange={event => setDraft({ ...draft, maxTurns: Number(event.target.value), confirmed: false })}>{[3, 5, 8, 10].map(count => <option key={count} value={count}>{count} questions</option>)}</select></div>
      {(['cv', 'vacancy', 'companyInfo'] as const).map(kind => <MaterialEditor key={kind} kind={kind} label={kind === 'cv' ? 'Submitted CV' : kind === 'vacancy' ? 'Vacancy' : 'Company information'} value={draft[kind]} packs={kind === 'cv' ? [] : packs} disabled={busy} onChange={value => setMaterial(kind, value)} run={perform} />)}
      <label className="personal-confirm"><input type="checkbox" aria-label="Confirm exact CV and OpenAI processing" disabled={busy} checked={draft.confirmed} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} />This is the CV I sent. Use only these reviewed materials with OpenAI for this rehearsal.</label>
      <button disabled={busy || !draft.confirmed} onClick={() => perform(async () => { const summary = await window.coqpi.rehearsal.create(validateRehearsalDraft(draft)); setSelected(summary); setSnapshots(await window.coqpi.rehearsal.list()) })}><Lock size={16} /> {busy ? 'Preparing…' : 'Freeze reviewed materials'}</button>
    </>}
  </main>
}
const MaterialEditor = ({ kind, label, value, disabled, packs, onChange, run }: { kind: 'cv' | 'vacancy' | 'companyInfo'; label: string; value: RehearsalMaterial; disabled: boolean; packs: RehearsalMaterial[]; onChange: (value: RehearsalMaterial) => void; run: (operation: () => Promise<void>) => void }) => {
  const [url, setUrl] = useState('')
  return <details className="personal-material"><summary>{label} · {value.text.length} characters · {value.label}</summary>
    <input aria-label={`${label} version label`} disabled={disabled} value={value.label} onChange={event => onChange({ ...value, label: event.target.value })} />
    <div className="virtual-controls"><button disabled={disabled} onClick={() => run(async () => { const material = await window.coqpi.rehearsal.pickMaterial(); if (material) onChange(material) })}><FileUp size={16} /> Choose file</button>
      {packs.length > 0 && <select aria-label={`Selected pack for ${label}`} disabled={disabled} value="" onChange={event => { if (event.target.value !== '') onChange(packs[Number(event.target.value)]) }}><option value="">Use selected Prepare pack</option>{packs.map((pack, index) => <option key={index} value={index}>{pack.label}</option>)}</select>}
    </div>
    {kind !== 'cv' && <div className="virtual-controls"><input aria-label={`${label} public URL`} disabled={disabled} value={url} onChange={event => setUrl(event.target.value)} /><button disabled={disabled || !url.trim()} onClick={() => run(async () => onChange(await window.coqpi.rehearsal.publicPage(url.trim())))}><Download size={16} /> Load excerpt</button></div>}
    <textarea aria-label={`${label} reviewed text`} disabled={disabled} value={value.text} onChange={event => onChange({ ...value, text: event.target.value })} />
  </details>
}

import { useState } from 'react'
import { Headphones, Volume2, ArrowLeft } from 'lucide-react'
import type { AudioInputDevice } from '@shared/app-types'

export function ConversationSetup({ devices, microphone, system, onReady, onBack }: {
  devices: AudioInputDevice[]
  microphone: string
  system: string
  onReady: (microphone: string, system: string) => void
  onBack: () => void
}) {
  const [route, setRoute] = useState<'headphones' | 'speaker'>(system ? 'headphones' : 'speaker')
  const [mic, setMic] = useState(microphone)
  const [other, setOther] = useState(system || devices.find(d => /blackhole|loopback/i.test(d.label))?.deviceId || '')
  const invalid = route === 'headphones' && (!other || other === mic)
  return <main className="conversation-setup">
    <button className="mode-back" title="Choose mode" aria-label="Choose mode" onClick={onBack}><ArrowLeft size={18} /></button>
    <h1>Как будем разговаривать?</h1>
    <div className="audio-route-options" role="radiogroup" aria-label="Conversation audio route">
      <label><input type="radio" name="route" checked={route === 'headphones'} onChange={() => setRoute('headphones')} /><Headphones size={19} /><span>Наушники + микрофон</span></label>
      <label><input type="radio" name="route" checked={route === 'speaker'} onChange={() => setRoute('speaker')} /><Volume2 size={19} /><span>Громкая связь</span></label>
    </div>
    <label className="setup-device">Микрофон<select aria-label="Microphone" value={mic} onChange={event => setMic(event.target.value)}><option value="">Системный микрофон</option>{devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Audio input'}</option>)}</select></label>
    {route === 'headphones' && <label className="setup-device">Звук собеседника<select aria-label="Other side input" value={other} onChange={event => setOther(event.target.value)}><option value="">Выберите вход звука звонка</option>{devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Audio input'}</option>)}</select></label>}
    {invalid && <p role="alert">Нужен отдельный вход звука звонка, например BlackHole.</p>}
    <button className="primary-button setup-ready" disabled={invalid} onClick={() => onReady(mic, route === 'headphones' ? other : '')}>Продолжить</button>
  </main>
}

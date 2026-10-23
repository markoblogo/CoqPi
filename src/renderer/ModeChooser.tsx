import { AudioLines, FileAudio, Sparkles, Settings, FolderOpen, ClipboardList } from 'lucide-react'

type Mode = 'live' | 'transcribe' | 'training' | 'settings' | 'context' | 'prepare'

export function ModeChooser({ onSelect }: { onSelect: (mode: Mode) => void }) {
  return <main className="mode-chooser" aria-label="Choose a mode">
    <div className="mode-options">
      <button title="Live assistant" onClick={() => onSelect('live')}><AudioLines size={23} /><span>Разговор</span></button>
      <button title="Meeting transcription" onClick={() => onSelect('transcribe')}><FileAudio size={23} /><span>Запись</span></button>
      <button title="Practice interview answers" onClick={() => onSelect('training')}><Sparkles size={23} /><span>Обучение</span></button>
    </div>
    <nav className="mode-setup" aria-label="Preparation">
      <button title="Prepare a session" aria-label="Prepare a session" onClick={() => onSelect('prepare')}><ClipboardList size={18} /></button>
      <button title="Knowledge and context packs" aria-label="Knowledge and context packs" onClick={() => onSelect('context')}><FolderOpen size={18} /></button>
      <button title="Settings" aria-label="Settings" onClick={() => onSelect('settings')}><Settings size={18} /></button>
    </nav>
  </main>
}

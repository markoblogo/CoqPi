import { useCallback, useEffect, useRef, useState } from 'react'
import { ManualSpeakerTracker } from '@shared/manual-speaker'

export const useManualSpeaker = (enabled: boolean, onMarkSelf: (ids: string[]) => void) => {
  const tracker = useRef(new ManualSpeakerTracker())
  const held = useRef(false)
  const latched = useRef(false)
  const [speaking, setSpeaking] = useState(false)
  const callback = useRef(onMarkSelf)
  callback.current = onMarkSelf
  const sync = useCallback(() => {
    const value = held.current || latched.current
    const ids = tracker.current.setSpeaking(value)
    setSpeaking(value)
    if (ids.length) callback.current(ids)
  }, [])
  const reset = useCallback(() => {
    held.current = false; latched.current = false
    tracker.current.reset(); setSpeaking(false)
  }, [])

  useEffect(() => {
    if (!enabled) { held.current = false; latched.current = false; sync(); return }
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"], [role="slider"]')) return
      event.preventDefault()
      held.current = true; sync()
    }
    const release = () => { held.current = false; sync() }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !held.current) return
      event.preventDefault(); release()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      held.current = false
    }
  }, [enabled, sync])
  return { speaking, tracker, reset, isSpeaking: () => held.current || latched.current, toggle: () => { if (enabled) { latched.current = !latched.current; sync() } } }
}

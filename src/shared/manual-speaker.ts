export class ManualSpeakerTracker {
  private speaking = false
  private items = new Map<string, 'self' | 'other'>()
  private active = new Set<string>()
  private ended = new Set<string>()

  reset() {
    this.speaking = false
    this.items.clear()
    this.active.clear()
    this.ended.clear()
  }

  setSpeaking(value: boolean): string[] {
    this.speaking = value
    if (!value) return []
    const marked = [...this.active]
    for (const id of marked) this.items.set(id, 'self')
    return marked
  }

  observe(event: { type?: unknown; item_id?: unknown }): 'self' | 'other' {
    const id = typeof event.item_id === 'string' ? event.item_id : ''
    if (!id) return this.speaking ? 'self' : 'other'
    const type = typeof event.type === 'string' ? event.type : ''
    if (!type.startsWith('input_audio_buffer.speech_') && !type.startsWith('conversation.item.input_audio_transcription.')) return this.items.get(id) ?? 'other'
    if (!this.items.has(id)) this.items.set(id, this.speaking ? 'self' : 'other')
    if (type.endsWith('speech_started')) { this.ended.delete(id); this.active.add(id) }
    if (type.endsWith('.delta') && !this.ended.has(id)) this.active.add(id)
    if (type.endsWith('speech_stopped') || type.endsWith('.completed') || type.endsWith('.failed')) { this.active.delete(id); this.ended.add(id) }
    const speaker = this.items.get(id)!
    // Retain recent completed IDs for delayed/duplicate results, bounded per call.
    if (this.items.size > 4096) {
      for (const key of this.items.keys()) {
        if (key !== id && !this.active.has(key)) { this.items.delete(key); this.ended.delete(key); break }
      }
    }
    return speaker
  }
}

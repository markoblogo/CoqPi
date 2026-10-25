import type { RepeatAttempt } from './interview-repeat'

interface CaptureDependencies {
  create: () => Promise<RepeatAttempt>
  open: (audioSessionId: string) => Promise<void>
  close: () => Promise<void>
  finish: (id: string, failed: boolean) => Promise<void>
  changed: () => void
}
export class RepeatCapture {
  phase: 'idle' | 'opening' | 'recording' | 'stopping' | 'stopped' = 'idle'
  attempt: RepeatAttempt | null = null
  error = ''
  private generation = 0
  private opening: Promise<void> = Promise.resolve()
  private stopping: Promise<void> | null = null
  constructor(private readonly deps: CaptureDependencies) {}
  async start() {
    if (!['idle', 'stopped'].includes(this.phase)) return
    const generation = ++this.generation
    this.phase = 'opening'; this.error = ''; this.attempt = null; this.deps.changed()
    this.opening = (async () => {
      this.attempt = await this.deps.create()
      if (generation !== this.generation) return
      await this.deps.open(this.attempt.audioSessionId)
      if (generation === this.generation) { this.phase = 'recording'; this.deps.changed() }
    })()
    try { await this.opening } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to record repeat.'
      await this.stop()
    }
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    if (this.phase === 'idle' || this.phase === 'stopped') return Promise.resolve()
    ++this.generation; this.phase = 'stopping'; this.deps.changed()
    this.stopping = (async () => {
      await this.opening.catch(() => undefined)
      let failed = !!this.error
      try { await this.deps.close() } catch (error) { failed = true; this.error = String(error) }
      if (this.attempt) await this.deps.finish(this.attempt.id, failed)
      this.phase = 'stopped'
    })().finally(() => { this.stopping = null; this.deps.changed() })
    return this.stopping
  }
}

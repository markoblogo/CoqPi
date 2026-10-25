import type { AssistantAnalysisResponse, AssistantProgress } from './app-types'
import type { MeetingTranscriptionSession } from './meeting-transcription'
import { virtualQuestions, virtualRequest } from './virtual-interview'

type SpeechEvent = { type?: string; item_id?: string; transcript?: string; delta?: string }
export interface InterviewDependencies {
  save: (session: MeetingTranscriptionSession) => Promise<unknown>
  flush: () => Promise<void>
  openAudio: (sessionId: string) => Promise<void>
  closeAudio: () => Promise<void>
  speak: (text: string, language: 'en' | 'fr') => Promise<void>
  cancelSpeech: () => void
  listen: (language: 'en' | 'fr', event: (event: SpeechEvent) => void, error: (message: string) => void) => Promise<void>
  stopListening: () => Promise<void>
  analyze: (request: ReturnType<typeof virtualRequest>) => Promise<AssistantAnalysisResponse>
  cancel: (id: string) => void
  changed: () => void
  id: () => string
  now: () => number
}
export interface PersonalInterviewScenario {
  snapshotId: string; snapshotHash: string; company: string; maxTurns: number
  question: (session: MeetingTranscriptionSession, index: number) => Promise<string>
  request: (sessionId: string, language: 'en' | 'fr', question: string, streamId: string) => ReturnType<typeof virtualRequest>
}

export class VirtualInterviewSession {
  session: MeetingTranscriptionSession | null = null
  phase: 'idle' | 'starting' | 'preparing' | 'question-error' | 'question' | 'connecting' | 'answer' | 'stopping' | 'stopped' = 'idle'
  index = -1
  hint = ''
  error = ''
  private generation = 0
  private streamId = ''
  private started = 0
  private writes: Promise<unknown> = Promise.resolve()
  private opening: Promise<void> = Promise.resolve()
  private stopping: Promise<void> | null = null
  private seen = new Set<string>()

  constructor(private readonly deps: InterviewDependencies, private readonly scenario?: PersonalInterviewScenario) {}
  get maxTurns() { return this.scenario?.maxTurns ?? 5 }
  private date() { return new Date(this.deps.now()).toISOString() }
  private notify() { this.deps.changed() }
  private persist() {
    const snapshot = structuredClone(this.session!)
    const write = this.writes.catch(() => undefined).then(() => this.deps.save(snapshot))
    this.writes = write
    void write.catch(() => { this.error = 'Recording could not be saved. Do not close; retry Stop.'; this.notify() })
    return write
  }

  async start(language: 'en' | 'fr') {
    if (!['idle', 'stopped'].includes(this.phase)) return
    this.phase = 'starting'; this.error = ''; this.hint = ''; this.index = -1
    this.seen.clear()
    const generation = ++this.generation
    this.session = { id: this.deps.id(), language, inputLabel: 'Microphone / virtual interviewer',
      mode: 'copilot', scenario: this.scenario ? 'PERSONAL interview rehearsal' : 'FICTIONAL virtual interview', startedAt: this.date(), status: 'recording',
      segments: [], interim: {}, assistantEvents: [], practice: this.scenario ? { kind: 'personal-interview', snapshotId: this.scenario.snapshotId, snapshotHash: this.scenario.snapshotHash, company: this.scenario.company, turns: [] } : { kind: 'virtual-interview', turns: [] } }
    this.notify()
    this.opening = (async () => { await this.persist(); if (generation === this.generation) await this.deps.openAudio(this.session!.id) })()
    try {
      await this.opening
      if (generation !== this.generation) return
      await this.next()
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to start practice.'
      await this.stop().catch(() => undefined)
    }
  }

  async next() {
    if (!this.session || !['starting', 'answer', 'question-error'].includes(this.phase)) return
    if (this.index >= 0 && !this.session.segments.some(segment => segment.sourceItemId?.startsWith(`turn-${this.index}:`))) return
    if (this.index === this.maxTurns - 1) { await this.stop(); return }
    const generation = ++this.generation
    if (this.streamId) this.deps.cancel(this.streamId)
    this.phase = this.scenario ? 'preparing' : 'question'; this.hint = ''; this.error = ''; this.notify()
    await this.deps.stopListening()
    if (generation !== this.generation) return
    if (this.index >= 0) this.session.practice!.turns[this.index].answerEndedAt = this.date()
    const language = this.session.language as 'en' | 'fr'
    let question: string
    try {
      if (this.scenario) await this.persist()
      if (generation !== this.generation) return
      question = this.scenario ? await this.scenario.question(this.session, this.index + 1) : virtualQuestions[language][this.index + 1]
    } catch (error) { if (generation === this.generation) { this.phase = 'question-error'; this.error = 'Question unavailable. Retry or Stop; recording is preserved.'; this.notify() }; throw error }
    if (generation !== this.generation) return
    this.index++; this.phase = 'question'
    this.session.segments.push({ id: this.deps.id(), startTime: this.date(), text: question, speaker: this.scenario ? 'PRACTICE INTERVIEWER' : 'VIRTUAL INTERVIEWER', source: 'unknown', language, isFinal: true })
    this.started = this.deps.now()
    this.session.practice!.turns.push({ question, requestedAt: this.date(), input: 'voice' })
    this.streamId = this.deps.id()
    const request = this.scenario ? this.scenario.request(this.session.id, language, question, this.streamId) : virtualRequest(language, question, this.streamId)
    await this.persist()
    if (generation !== this.generation) return
    this.notify()
    void this.deps.analyze(request).then(async response => {
      if (generation !== this.generation) return
      if (!response.ok) throw new Error(response.error.message)
      const turn = this.session!.practice!.turns[this.index]
      this.hint = response.data.suggestedAnswers[0]?.text ?? ''
      turn.expectedAnswer = this.hint
      turn.fullHintMs = this.deps.now() - this.started
      if (this.hint && turn.firstHintMs === undefined) turn.firstHintMs = turn.fullHintMs
      turn.modelMs = response.data.latencyMs; turn.model = response.data.model
      this.session!.assistantEvents!.push({ timestamp: this.date(), answer: this.hint, meaning: response.data.meaningRu, model: turn.model, latencyMs: turn.fullHintMs, language })
      this.notify(); await this.persist()
    }).catch(error => {
      if (generation !== this.generation) return
      this.error = error instanceof Error ? error.message : 'Hint unavailable; recording continues.'
      this.session!.practice!.turns[this.index].error = this.error
      this.notify(); void this.persist().catch(() => undefined)
    })
    try {
      await this.deps.speak(question, language)
      if (generation !== this.generation) return
      this.session.practice!.turns[this.index].questionAudioEndedAt = this.date()
    } catch {
      if (generation !== this.generation) return
      this.error = 'Question audio unavailable. Read the question on screen.'
    }
    if (generation !== this.generation) return
    this.phase = 'connecting'; this.notify()
    this.session.practice!.turns[this.index].answerStartedAt = this.date()
    try {
      await this.deps.listen(language, event => { if (generation === this.generation) this.receive(event) }, message => {
        if (generation !== this.generation) return
        this.error = `${message} Saved text is preserved; check the audio backup in the archive.`; this.notify()
      })
    } catch (error) {
      if (generation === this.generation) { this.error = `${error instanceof Error ? error.message : 'STT unavailable'}. Use a typed answer or Stop; saved text is preserved.`; this.notify() }
    }
    if (generation === this.generation) { this.phase = 'answer'; this.notify(); await this.persist() }
  }

  progress(event: AssistantProgress) {
    if (event.streamId !== this.streamId || !['question', 'connecting', 'answer'].includes(this.phase) || !event.answer) return
    this.hint = event.answer
    const turn = this.session!.practice!.turns[this.index]
    turn.firstHintMs ??= this.deps.now() - this.started
    this.notify()
  }

  receive(event: SpeechEvent) {
    if (this.phase !== 'answer' || !this.session || this.index < 0) return
    const turn = this.session.practice!.turns[this.index]
    if (event.type === 'input_audio_buffer.speech_stopped') { turn.speechEndedAt = this.date(); return }
    const item = event.item_id || 'pending'
    const key = `turn-${this.index}:${item}`
    if (event.type === 'conversation.item.input_audio_transcription.delta' && event.delta) {
      const old = this.session.interim[key]
      this.session.interim[key] = { itemId: key, speaker: 'ME', text: (old?.text ?? '') + event.delta, startTime: old?.startTime ?? this.date(), updatedAt: this.date() }
      void this.persist().catch(() => undefined); this.notify()
    }
    if (event.type !== 'conversation.item.input_audio_transcription.completed' || !event.transcript?.trim() || this.seen.has(key)) return
    this.seen.add(key)
    this.session.segments.push({ id: this.deps.id(), startTime: this.session.interim[key]?.startTime ?? this.date(), endTime: this.date(), text: event.transcript.trim(), speaker: 'ME', source: 'microphone', language: this.session.language, isFinal: true, sourceItemId: key })
    delete this.session.interim[key]
    turn.answerFinalAt = this.date()
    if (turn.speechEndedAt) turn.sttFinalMs = Math.max(0, this.deps.now() - Date.parse(turn.speechEndedAt))
    void this.persist().catch(() => undefined); this.notify()
  }

  typed(text: string) {
    if (this.phase !== 'answer' || this.index < 0 || !text.trim()) return
    this.session!.segments.push({ id: this.deps.id(), startTime: this.date(), text: text.trim(), isFinal: true,
      source: 'unknown', speaker: 'ME (typed)', language: this.session!.language, sourceItemId: `turn-${this.index}:typed-${this.deps.id()}` })
    const turn = this.session!.practice!.turns[this.index]
    turn.input = 'typed'; turn.answerFinalAt = this.date(); delete turn.sttFinalMs
    void this.persist().catch(() => undefined); this.notify()
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping
    if (!this.session || this.phase === 'stopped') return Promise.resolve()
    ++this.generation; this.phase = 'stopping'; this.hint = ''
    this.deps.cancelSpeech()
    if (this.streamId) this.deps.cancel(this.streamId)
    this.streamId = ''; this.notify()
    this.stopping = (async () => {
      await this.opening.catch(() => undefined)
      await this.deps.stopListening()
      if (this.index >= 0) this.session!.practice!.turns[this.index].answerEndedAt = this.date()
      let audioError: unknown
      try { await this.deps.closeAudio() } catch (error) { audioError = error }
      this.session!.status = 'stopped'; this.session!.endedAt = this.date(); this.session!.stoppedAt = this.date()
      await this.persist(); await this.deps.flush()
      this.phase = 'stopped'
      if (audioError) this.error = `Transcript saved; audio backup error: ${String(audioError)}`
    })().catch(error => { this.error = 'Save failed. Retry Stop before closing.'; throw error }).finally(() => { this.stopping = null; this.notify() })
    return this.stopping
  }
}

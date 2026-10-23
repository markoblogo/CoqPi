import type {
  MeetingAudioBackupStartResult,
  MeetingAudioBackupStopResult
} from '@shared/app-types'
import type { MeetingAudioBackupSource } from '@shared/meeting-transcription'

type BackupRecorderState = {
  sessionId: string
  source: MeetingAudioBackupSource
  stream: MediaStream
  audioContext: AudioContext
  sourceNode: MediaStreamAudioSourceNode
  processorNode: ScriptProcessorNode
  muteNode: GainNode
  writeQueue: Promise<unknown>
  error: Error | null
  pendingChunks: number
}

const getAudioContextConstructor = () => {
  const audioWindow = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }
  return globalThis.AudioContext ?? audioWindow.webkitAudioContext
}

const floatToPcm16 = (inputBuffer: AudioBuffer) => {
  const frameCount = inputBuffer.length
  const channelCount = Math.max(1, inputBuffer.numberOfChannels)
  const bytes = new ArrayBuffer(frameCount * 2)
  const view = new DataView(bytes)

  for (let frame = 0; frame < frameCount; frame++) {
    let sample = 0
    for (let channel = 0; channel < channelCount; channel++) {
      sample += inputBuffer.getChannelData(channel)[frame] ?? 0
    }
    sample = Math.max(-1, Math.min(1, sample / channelCount))
    view.setInt16(
      frame * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    )
  }

  return bytes
}

export class RawAudioBackupRecorder {
  private state: BackupRecorderState | null = null
  private lifecycle: Promise<unknown> = Promise.resolve()

  constructor(private readonly onError: (message: string) => void = () => undefined) {}

  start(options: { sessionId: string; source?: MeetingAudioBackupSource; stream: MediaStream; now: string }) {
    const operation = this.lifecycle.then(() => this.startCapture(options)).catch(error => {
      options.stream.getTracks().forEach(track => track.stop())
      throw error
    })
    this.lifecycle = operation.catch(() => undefined)
    return operation
  }

  private async startCapture({
    sessionId,
    source = 'microphone',
    stream,
    now
  }: {
    sessionId: string
    source?: MeetingAudioBackupSource
    stream: MediaStream
    now: string
  }): Promise<MeetingAudioBackupStartResult> {
    await this.stopCapture(new Date().toISOString())
    const AudioContextConstructor = getAudioContextConstructor()
    if (!AudioContextConstructor) {
      throw new Error('Web Audio API is unavailable for local audio backup.')
    }

    const audioContext = new AudioContextConstructor()
    await audioContext.resume()
    const sourceNode = audioContext.createMediaStreamSource(stream)
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    const muteNode = audioContext.createGain()
    muteNode.gain.value = 0
    sourceNode.connect(processorNode)
    processorNode.connect(muteNode)
    muteNode.connect(audioContext.destination)

    let started: MeetingAudioBackupStartResult
    try {
      started = await window.coqpi.meetingTranscription.backupStart({
      sessionId,
      source,
      sampleRate: audioContext.sampleRate,
      channelCount: 1,
      now
      })
    } catch (error) {
      sourceNode.disconnect()
      processorNode.disconnect()
      muteNode.disconnect()
      stream.getTracks().forEach(track => track.stop())
      await audioContext.close()
      throw error
    }

    const state: BackupRecorderState = {
      sessionId,
      source,
      stream,
      audioContext,
      sourceNode,
      processorNode,
      muteNode,
      writeQueue: Promise.resolve(),
      error: null,
      pendingChunks: 0
    }

    processorNode.onaudioprocess = (event) => {
      if (state.error) return
      if (state.pendingChunks >= 128) {
        state.error = new Error('Audio backup storage is too slow; recording has a gap. Stop and check available disk space.')
        this.onError(state.error.message)
        return
      }
      const pcm16 = floatToPcm16(event.inputBuffer)
      state.pendingChunks += 1
      state.writeQueue = state.writeQueue
        .then(() =>
          window.coqpi.meetingTranscription.backupChunk({
            sessionId,
            source,
            pcm16
          })
        ).catch(error => {
          if (!state.error) {
            state.error = error instanceof Error ? error : new Error('Audio backup write failed.')
            this.onError(state.error.message)
          }
        }).finally(() => { state.pendingChunks -= 1 })
    }

    this.state = state
    return started
  }

  async stop(now: string): Promise<MeetingAudioBackupStopResult | null> {
    const operation = this.lifecycle.then(() => this.stopCapture(now))
    this.lifecycle = operation.catch(() => undefined)
    return operation
  }

  private async stopCapture(now: string): Promise<MeetingAudioBackupStopResult | null> {
    const state = this.state
    this.state = null
    if (!state) return null

    state.processorNode.onaudioprocess = null
    state.sourceNode.disconnect()
    state.processorNode.disconnect()
    state.muteNode.disconnect()
    state.stream.getTracks().forEach((track) => track.stop())
    await state.writeQueue.catch(() => undefined)
    await state.audioContext.close().catch(() => undefined)
    const result = await window.coqpi.meetingTranscription.backupStop({
      sessionId: state.sessionId,
      source: state.source,
      now
    })
    if (state.error) throw state.error
    return result
  }
}

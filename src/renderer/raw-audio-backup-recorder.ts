import type {
  MeetingAudioBackupStartResult,
  MeetingAudioBackupStopResult
} from '@shared/app-types'

type BackupRecorderState = {
  sessionId: string
  source: 'microphone'
  stream: MediaStream
  audioContext: AudioContext
  sourceNode: MediaStreamAudioSourceNode
  processorNode: ScriptProcessorNode
  muteNode: GainNode
  writeQueue: Promise<unknown>
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

  async start({
    sessionId,
    stream,
    now
  }: {
    sessionId: string
    stream: MediaStream
    now: string
  }): Promise<MeetingAudioBackupStartResult> {
    await this.stop(new Date().toISOString()).catch(() => undefined)
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

    const started = await window.coqpi.meetingTranscription.backupStart({
      sessionId,
      source: 'microphone',
      sampleRate: audioContext.sampleRate,
      channelCount: 1,
      now
    })

    const state: BackupRecorderState = {
      sessionId,
      source: 'microphone',
      stream,
      audioContext,
      sourceNode,
      processorNode,
      muteNode,
      writeQueue: Promise.resolve()
    }

    processorNode.onaudioprocess = (event) => {
      const pcm16 = floatToPcm16(event.inputBuffer)
      state.writeQueue = state.writeQueue
        .catch(() => undefined)
        .then(() =>
          window.coqpi.meetingTranscription.backupChunk({
            sessionId,
            source: 'microphone',
            pcm16
          })
        )
    }

    this.state = state
    return started
  }

  async stop(now: string): Promise<MeetingAudioBackupStopResult | null> {
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
    return window.coqpi.meetingTranscription.backupStop({
      sessionId: state.sessionId,
      source: state.source,
      now
    })
  }
}

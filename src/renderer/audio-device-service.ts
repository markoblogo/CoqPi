import type {
  AudioInputDevice,
  AudioInputPermissionStatus,
  AudioLevelReading,
  AudioLevelStatus
} from '@shared/app-types'

const AUDIO_INPUT_STORAGE_KEY = 'coqpi.selectedAudioInputId'

const AUDIO_LEVEL_THRESHOLDS: Array<{
  max: number
  status: AudioLevelStatus
}> = [
  { max: 0.03, status: 'silent' },
  { max: 0.1, status: 'low' },
  { max: 0.24, status: 'active' },
  { max: 1, status: 'loud' }
]

const AUDIO_LEVEL_MULTIPLIER = 3.4

export const defaultAudioLevelReading: AudioLevelReading = {
  ratio: 0,
  percentage: 0,
  status: 'silent'
}

export const isAudioInputApiAvailable = () =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.enumerateDevices === 'function' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof window !== 'undefined'

const getAudioInputErrorMessage = (error: unknown) => {
  if (error instanceof DOMException) {
    if (
      error.name === 'NotAllowedError' ||
      error.name === 'PermissionDeniedError' ||
      error.name === 'SecurityError'
    ) {
      return 'Microphone permission was denied. Grant access and try again.'
    }

    if (
      error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError'
    ) {
      return 'Selected audio input is unavailable. Refresh the device list or choose another device.'
    }

    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The selected audio input is busy or unavailable.'
    }

    if (error.name === 'AbortError') {
      return 'Audio input startup was interrupted. Try again.'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'An unexpected audio input error occurred.'
}

const getMediaDevices = () => {
  if (!isAudioInputApiAvailable()) {
    throw new Error(
      'Browser/Electron media API is unavailable in this renderer.'
    )
  }

  return navigator.mediaDevices
}

const getPermissionStatusFromState = (
  state: PermissionState
): AudioInputPermissionStatus => {
  if (state === 'granted') {
    return 'granted'
  }

  if (state === 'denied') {
    return 'denied'
  }

  return 'unknown'
}

export const getStoredSelectedAudioInputId = () => {
  try {
    return window.localStorage.getItem(AUDIO_INPUT_STORAGE_KEY)
  } catch {
    return null
  }
}

export const storeSelectedAudioInputId = (deviceId: string) => {
  try {
    if (deviceId) {
      window.localStorage.setItem(AUDIO_INPUT_STORAGE_KEY, deviceId)
      return
    }

    window.localStorage.removeItem(AUDIO_INPUT_STORAGE_KEY)
  } catch {
    // Ignore storage failures and keep the UI usable.
  }
}

export const queryAudioInputPermissionStatus =
  async (): Promise<AudioInputPermissionStatus> => {
    if (!isAudioInputApiAvailable()) {
      return 'error'
    }

    if (typeof navigator.permissions?.query !== 'function') {
      return 'unknown'
    }

    try {
      const permissionStatus = await navigator.permissions.query({
        name: 'microphone' as PermissionName
      })

      return getPermissionStatusFromState(permissionStatus.state)
    } catch {
      return 'unknown'
    }
  }

export const requestAudioInputPermission =
  async (): Promise<AudioInputPermissionStatus> => {
    let stream: MediaStream | null = null

    try {
      stream = await getMediaDevices().getUserMedia({
        audio: true,
        video: false
      })

      return 'granted'
    } catch (error) {
      const message = getAudioInputErrorMessage(error)

      if (message.startsWith('Microphone permission was denied')) {
        return 'denied'
      }

      return 'error'
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }

export const listAudioInputDevices = async (): Promise<AudioInputDevice[]> => {
  const devices = await getMediaDevices().enumerateDevices()

  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId,
      groupId: device.groupId,
      label: device.label || `Audio input ${index + 1}`,
      isDefault: device.deviceId === 'default'
    }))
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1
      }

      return left.label.localeCompare(right.label)
    })
}

const toAudioLevelReading = (value: number): AudioLevelReading => {
  const ratio = Math.min(1, Math.max(0, value))
  const threshold =
    AUDIO_LEVEL_THRESHOLDS.find((item) => ratio <= item.max) ??
    AUDIO_LEVEL_THRESHOLDS[AUDIO_LEVEL_THRESHOLDS.length - 1]

  return {
    ratio,
    percentage: Math.round(ratio * 100),
    status: threshold.status
  }
}

const getAudioContextConstructor = () => {
  const audioWindow = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }

  return globalThis.AudioContext ?? audioWindow.webkitAudioContext
}

export class AudioLevelMonitor {
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private mediaStream: MediaStream | null = null
  private sampleBuffer: Uint8Array<ArrayBuffer> | null = null
  private frameId: number | null = null
  private lastRatio = 0

  constructor(private readonly onLevel: (level: AudioLevelReading) => void) {}

  async start(deviceId: string) {
    this.stop()

    const AudioContextConstructor = getAudioContextConstructor()

    if (!AudioContextConstructor) {
      throw new Error(
        'AudioContext failed because the Web Audio API is unavailable.'
      )
    }

    try {
      this.mediaStream = await getMediaDevices().getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined
        },
        video: false
      })
    } catch (error) {
      throw new Error(getAudioInputErrorMessage(error))
    }

    try {
      const audioContext = new AudioContextConstructor()
      await audioContext.resume()

      const sourceNode = audioContext.createMediaStreamSource(this.mediaStream)
      const analyserNode = audioContext.createAnalyser()

      analyserNode.fftSize = 2048
      analyserNode.smoothingTimeConstant = 0.82

      this.audioContext = audioContext
      this.sourceNode = sourceNode
      this.analyserNode = analyserNode
      this.sampleBuffer = new Uint8Array(new ArrayBuffer(analyserNode.fftSize))
      sourceNode.connect(analyserNode)
      this.scheduleLevelUpdate()
    } catch (error) {
      this.stop()
      throw new Error(
        getAudioInputErrorMessage(error) || 'AudioContext failed.'
      )
    }
  }

  stop() {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId)
      this.frameId = null
    }

    this.analyserNode?.disconnect()
    this.sourceNode?.disconnect()

    const audioContext = this.audioContext
    this.audioContext = null
    this.analyserNode = null
    this.sourceNode = null
    this.sampleBuffer = null
    this.lastRatio = 0

    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.mediaStream = null

    if (audioContext) {
      void audioContext.close().catch(() => undefined)
    }

    this.onLevel(defaultAudioLevelReading)
  }

  private scheduleLevelUpdate = () => {
    if (!this.analyserNode || !this.sampleBuffer) {
      return
    }

    this.analyserNode.getByteTimeDomainData(this.sampleBuffer)

    let sumSquares = 0

    for (const value of this.sampleBuffer) {
      const normalized = (value - 128) / 128
      sumSquares += normalized * normalized
    }

    const rms = Math.sqrt(sumSquares / this.sampleBuffer.length)
    const boostedRatio = Math.min(1, rms * AUDIO_LEVEL_MULTIPLIER)
    const smoothedRatio = this.lastRatio * 0.72 + boostedRatio * 0.28

    this.lastRatio = smoothedRatio
    this.onLevel(toAudioLevelReading(smoothedRatio))
    this.frameId = window.requestAnimationFrame(this.scheduleLevelUpdate)
  }
}

import type {
  RealtimeConnectionStatus,
  RealtimeTranscriptionStartRequest
} from '@shared/app-types'
import { buildAudioInputConstraints } from '@shared/audio-input-config'

type RealtimeServerEvent = {
  type?: string
  item_id?: string
  delta?: string
  transcript?: string
  [key: string]: unknown
}

export interface StartRealtimeTranscriptionOptions {
  selectedAudioDeviceId: string
  callLanguage: RealtimeTranscriptionStartRequest['callLanguage']
  onStatusChange: (status: RealtimeConnectionStatus) => void
  onEvent: (event: RealtimeServerEvent) => void
  onDebugEventType: (eventType: string) => void
  onLifecycleLog: (entry: string) => void
  onPeerConnectionStateChange: (state: RTCPeerConnectionState) => void
  onIceConnectionStateChange: (state: RTCIceConnectionState) => void
  onIceGatheringStateChange: (state: RTCIceGatheringState) => void
  onDataChannelStateChange: (state: RTCDataChannelState) => void
  onAudioBackupStream?: (stream: MediaStream) => Promise<void>
  onError: (message: string) => void
}

const ICE_GATHERING_TIMEOUT_MS = 2000

const waitForIceGathering = (peerConnection: RTCPeerConnection) => {
  if (peerConnection.iceGatheringState === 'complete') {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(finish, ICE_GATHERING_TIMEOUT_MS)

    function finish() {
      window.clearTimeout(timeoutId)
      peerConnection.removeEventListener('icegatheringstatechange', onChange)
      resolve()
    }

    function onChange() {
      if (peerConnection.iceGatheringState === 'complete') {
        finish()
      }
    }

    peerConnection.addEventListener('icegatheringstatechange', onChange)
  })
}

const getRealtimeMicrophoneErrorMessage = (error: unknown) => {
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
      return 'No selected audio input device is available.'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unable to access the selected audio input device.'
}

export class RealtimeTranscriptionClient {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private mediaStream: MediaStream | null = null
  private isStopping = false
  private generation = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0

  async start(options: StartRealtimeTranscriptionOptions) {
    await this.stop()
    this.isStopping = false
    this.reconnectAttempts = 0
    await this.connect(options)
  }

  private async connect(options: StartRealtimeTranscriptionOptions) {
    const generation = this.generation
    options.onStatusChange('connecting')
    options.onLifecycleLog('Start Listening clicked')

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioInputConstraints(options.selectedAudioDeviceId),
        video: false
      })
      if (this.isStopping || generation !== this.generation) {
        mediaStream.getTracks().forEach(track => track.stop())
        return
      }
      options.onLifecycleLog('microphone stream acquired')

      const peerConnection = new RTCPeerConnection()
      const dataChannel = peerConnection.createDataChannel('oai-events')
      options.onLifecycleLog('RTCPeerConnection created')

      this.mediaStream = mediaStream
      this.peerConnection = peerConnection
      this.dataChannel = dataChannel

      if (options.onAudioBackupStream) {
        const backupStream = mediaStream.clone()
        void options.onAudioBackupStream(backupStream).catch((error) => {
          backupStream.getTracks().forEach((track) => track.stop())
          options.onLifecycleLog(
            error instanceof Error
              ? `audio backup unavailable: ${error.message}`
              : 'audio backup unavailable'
          )
        })
      }

      mediaStream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, mediaStream)
      })
      options.onLifecycleLog('audio track added')

      peerConnection.onconnectionstatechange = () => {
        if (this.isStopping || generation !== this.generation) return
        const state = peerConnection.connectionState
        options.onPeerConnectionStateChange(state)

        if (state === 'connected') {
          options.onStatusChange('connected')
          return
        }

        if (state === 'failed') {
          options.onStatusChange('error')
          options.onError('Peer connection failed.')
          this.scheduleReconnect(options)
          return
        }

        if (state === 'disconnected' || state === 'closed') {
          options.onStatusChange('connecting')
          this.scheduleReconnect(options)
        }
      }

      peerConnection.oniceconnectionstatechange = () => {
        options.onIceConnectionStateChange(peerConnection.iceConnectionState)
      }

      peerConnection.onicegatheringstatechange = () => {
        options.onIceGatheringStateChange(peerConnection.iceGatheringState)
      }

      dataChannel.addEventListener('open', () => {
        if (this.isStopping || generation !== this.generation) return
        options.onDataChannelStateChange(dataChannel.readyState)
        options.onStatusChange('listening')
        options.onLifecycleLog('data channel open')
      })

      dataChannel.addEventListener('error', () => {
        if (this.isStopping || generation !== this.generation) return
        options.onDataChannelStateChange(dataChannel.readyState)
        options.onStatusChange('error')
        options.onError('Data channel failed to open or encountered an error.')
        this.scheduleReconnect(options)
      })

      dataChannel.addEventListener('close', () => {
        options.onDataChannelStateChange(dataChannel.readyState)
        if (!this.isStopping && generation === this.generation) this.scheduleReconnect(options)
      })

      dataChannel.addEventListener('message', (event) => {
        if (this.isStopping || generation !== this.generation) return
        try {
          const payload = JSON.parse(String(event.data)) as RealtimeServerEvent
          const eventType =
            typeof payload.type === 'string' ? payload.type : 'unknown'

          options.onDebugEventType(eventType)
          options.onEvent(payload)
        } catch {
          options.onDebugEventType('invalid_json')
          options.onError('Received an invalid realtime event payload.')
        }
      })

      const offer = await peerConnection.createOffer()
      options.onLifecycleLog('SDP offer created')
      await peerConnection.setLocalDescription(offer)
      await waitForIceGathering(peerConnection)
      options.onLifecycleLog('ICE gathering completed or timed out')

      const localDescription = peerConnection.localDescription?.sdp

      if (!localDescription?.trim()) {
        throw new Error('SDP creation failed. No local offer was produced.')
      }

      options.onLifecycleLog('backend SDP answer requested')
      const response = await window.coqpi.realtime.createTranscriptionAnswer({
        offerSdp: localDescription,
        callLanguage: options.callLanguage
      })
      if (this.isStopping || generation !== this.generation) return

      if (!response.ok) {
        throw new Error(response.error.message)
      }

      if (!response.data.answerSdp.trim()) {
        throw new Error('Invalid SDP answer received from backend.')
      }

      options.onLifecycleLog('SDP answer received')
      await peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: response.data.answerSdp
      })
      options.onLifecycleLog('remote description set')
    } catch (error) {
      if (generation !== this.generation || this.isStopping) return
      this.releaseConnection()
      options.onStatusChange('error')
      throw new Error(getRealtimeMicrophoneErrorMessage(error))
    }
  }

  private scheduleReconnect(options: StartRealtimeTranscriptionOptions) {
    if (this.reconnectTimer || this.isStopping) return
    if (this.reconnectAttempts >= 3) {
      options.onStatusChange('error')
      options.onError('Connection interrupted. Saved text is safe; press Start to reconnect. Speech during the interruption was not transcribed.')
      return
    }
    const delay = 1000 * 2 ** this.reconnectAttempts++
    options.onStatusChange('connecting')
    options.onLifecycleLog(`Reconnect scheduled in ${delay} ms; transcription gap possible`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.generation++
      this.releaseConnection()
      void this.connect(options).catch(() => this.scheduleReconnect(options))
    }, delay)
  }

  private releaseConnection() {
    if (this.peerConnection) this.peerConnection.onconnectionstatechange = null
    this.dataChannel?.close()
    this.dataChannel = null
    this.peerConnection?.close()
    this.peerConnection = null
    this.mediaStream?.getTracks().forEach(track => track.stop())
    this.mediaStream = null
  }

  async stop() {
    this.isStopping = true
    this.generation++
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null

    this.dataChannel?.close()
    this.dataChannel = null

    this.peerConnection?.close()
    this.peerConnection = null

    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.mediaStream = null
  }

}

import type {
  RealtimeConnectionStatus,
  RealtimeTranscriptionStartRequest
} from '@shared/app-types'

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

  async start(options: StartRealtimeTranscriptionOptions) {
    if (!options.selectedAudioDeviceId) {
      throw new Error(
        'No selected audio input device. Choose an input before starting realtime listening.'
      )
    }

    await this.stop()
    this.isStopping = false
    options.onStatusChange('connecting')
    options.onLifecycleLog('Start Listening clicked')

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: options.selectedAudioDeviceId }
        },
        video: false
      })
      options.onLifecycleLog('microphone stream acquired')

      const peerConnection = new RTCPeerConnection()
      const dataChannel = peerConnection.createDataChannel('oai-events')
      options.onLifecycleLog('RTCPeerConnection created')

      this.mediaStream = mediaStream
      this.peerConnection = peerConnection
      this.dataChannel = dataChannel

      mediaStream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, mediaStream)
      })
      options.onLifecycleLog('audio track added')

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState
        options.onPeerConnectionStateChange(state)

        if (state === 'connected') {
          options.onStatusChange('connected')
          return
        }

        if (state === 'failed') {
          options.onStatusChange('error')
          options.onError('Peer connection failed.')
          return
        }

        if (state === 'disconnected' || state === 'closed') {
          options.onStatusChange(this.isStopping ? 'stopped' : 'idle')
        }
      }

      peerConnection.oniceconnectionstatechange = () => {
        options.onIceConnectionStateChange(peerConnection.iceConnectionState)
      }

      peerConnection.onicegatheringstatechange = () => {
        options.onIceGatheringStateChange(peerConnection.iceGatheringState)
      }

      dataChannel.addEventListener('open', () => {
        options.onDataChannelStateChange(dataChannel.readyState)
        options.onStatusChange('listening')
        options.onLifecycleLog('data channel open')
      })

      dataChannel.addEventListener('error', () => {
        options.onDataChannelStateChange(dataChannel.readyState)
        options.onStatusChange('error')
        options.onError('Data channel failed to open or encountered an error.')
      })

      dataChannel.addEventListener('close', () => {
        options.onDataChannelStateChange(dataChannel.readyState)
      })

      dataChannel.addEventListener('message', (event) => {
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
      await this.stop()
      options.onStatusChange('error')
      throw new Error(getRealtimeMicrophoneErrorMessage(error))
    }
  }

  async stop() {
    this.isStopping = true

    this.dataChannel?.close()
    this.dataChannel = null

    this.peerConnection?.close()
    this.peerConnection = null

    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.mediaStream = null
  }

}

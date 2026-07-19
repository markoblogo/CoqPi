export interface RealtimeCallSessionConfig {
  type: 'transcription'
  audio: {
    input: {
      transcription: {
        model: string
        language?: 'en' | 'fr'
        prompt: string
      }
      turn_detection: {
        type: 'server_vad'
        threshold: number
        prefix_padding_ms: number
        silence_duration_ms: number
      }
    }
  }
}

export const buildRealtimeCallFormData = (
  offerSdp: string,
  sessionConfig: RealtimeCallSessionConfig
) => {
  const formData = new FormData()
  formData.set('sdp', offerSdp)
  formData.set('session', JSON.stringify(sessionConfig))
  return formData
}

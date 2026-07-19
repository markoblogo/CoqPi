import type {
  RealtimeTranscriptionSdpResult,
  RealtimeTranscriptionStartRequest
} from '../../shared/app-types'
import { resolveOpenAIApiKey } from './secret-storage-service'
import { runGovernedProviderAction } from './governance-service'

const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = 'gpt-realtime-whisper'
const DEFAULT_REALTIME_TRANSCRIPTION_DELAY = 'low'
const DEFAULT_SAFETY_IDENTIFIER = 'coqpi-local-user'

const getRealtimeModel = () => {
  return (
    process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() ||
    DEFAULT_REALTIME_TRANSCRIPTION_MODEL
  )
}

const getRealtimeDelay = () => {
  return (
    process.env.OPENAI_REALTIME_TRANSCRIPTION_DELAY?.trim() ||
    DEFAULT_REALTIME_TRANSCRIPTION_DELAY
  )
}

const getSafetyIdentifier = () => {
  return (
    process.env.OPENAI_SAFETY_IDENTIFIER?.trim() || DEFAULT_SAFETY_IDENTIFIER
  )
}

const getApiKey = async () => {
  const apiKey = await resolveOpenAIApiKey()

  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is missing. Add it to .env or save it in Settings to start realtime transcription.'
    )
  }

  return apiKey
}

const buildSessionConfig = (
  callLanguage: RealtimeTranscriptionStartRequest['callLanguage']
) => {
  const transcriptionConfig: {
    model: string
    delay: string
    language?: 'en' | 'fr'
  } = {
    model: getRealtimeModel(),
    delay: getRealtimeDelay()
  }

  if (callLanguage === 'en' || callLanguage === 'fr') {
    transcriptionConfig.language = callLanguage
  }

  return {
    type: 'transcription',
    audio: {
      input: {
        transcription: transcriptionConfig,
        // Per the current realtime transcription docs, gpt-realtime-whisper
        // should use manual commits rather than server VAD.
        turn_detection: null
      }
    }
  }
}

const toOpenAIErrorMessage = async (response: Response) => {
  const bodyText = await response.text()
  const trimmed = bodyText.trim()

  if (!trimmed) {
    return `OpenAI Realtime API request failed with status ${response.status}.`
  }

  return `OpenAI Realtime API request failed with status ${response.status}: ${trimmed}`
}

export const createRealtimeTranscriptionAnswer = async (
  request: RealtimeTranscriptionStartRequest
): Promise<RealtimeTranscriptionSdpResult> => {
  const offerSdp = request.offerSdp.trim()

  if (!offerSdp) {
    throw new Error(
      'SDP offer is empty. Unable to start realtime transcription.'
    )
  }

  const formData = new FormData()
  formData.set('sdp', offerSdp)
  formData.set(
    'session',
    JSON.stringify(buildSessionConfig(request.callLanguage))
  )

  const response = await runGovernedProviderAction(
    {
      kind: 'realtime_transcription',
      provider: 'openai',
      model: getRealtimeModel(),
      external: true
    },
    async () =>
      fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await getApiKey()}`,
          'OpenAI-Safety-Identifier': getSafetyIdentifier()
        },
        body: formData
      })
  )

  if (!response.ok) {
    throw new Error(await toOpenAIErrorMessage(response))
  }

  const answerSdp = (await response.text()).trim()

  if (!answerSdp) {
    throw new Error('OpenAI Realtime API returned an empty SDP answer.')
  }

  return { answerSdp }
}

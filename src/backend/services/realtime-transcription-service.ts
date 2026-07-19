import type {
  RealtimeTranscriptionSdpResult,
  RealtimeTranscriptionStartRequest
} from '../../shared/app-types'
import { resolveOpenAIApiKey } from './secret-storage-service'
import { runGovernedProviderAction } from './governance-service'
import {
  buildRealtimeCallFormData,
  type RealtimeCallSessionConfig
} from './realtime-call-form-data'

const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe'
const DEFAULT_SAFETY_IDENTIFIER = 'coqpi-local-user'

const getRealtimeModel = () => {
  return (
    process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() ||
    DEFAULT_REALTIME_TRANSCRIPTION_MODEL
  )
}

const getSafetyIdentifier = () => {
  return (
    process.env.OPENAI_SAFETY_IDENTIFIER?.trim() || DEFAULT_SAFETY_IDENTIFIER
  )
}

const getTranscriptionPrompt = (
  callLanguage: RealtimeTranscriptionStartRequest['callLanguage']
) => {
  if (callLanguage === 'en') {
    return 'Transcribe spoken English only. Ignore other languages and background speech. Do not translate.'
  }

  if (callLanguage === 'fr') {
    return 'Transcribe spoken French only. Ignore other languages and background speech. Do not translate.'
  }

  return 'Transcribe spoken English or French only. Ignore all other languages and background speech. Do not translate.'
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
): RealtimeCallSessionConfig => {
  const transcriptionConfig: {
    model: string
    language?: 'en' | 'fr'
    prompt: string
  } = {
    model: getRealtimeModel(),
    prompt: getTranscriptionPrompt(callLanguage)
  }

  if (callLanguage === 'en' || callLanguage === 'fr') {
    transcriptionConfig.language = callLanguage
  }

  return {
    type: 'transcription',
    audio: {
      input: {
        transcription: transcriptionConfig,
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800
        }
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
  const offerSdp = request.offerSdp

  if (!offerSdp.trim()) {
    throw new Error(
      'SDP offer is empty. Unable to start realtime transcription.'
    )
  }

  const formData = buildRealtimeCallFormData(
    offerSdp,
    buildSessionConfig(request.callLanguage)
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

  const answerSdp = await response.text()

  if (!answerSdp.trim()) {
    throw new Error('OpenAI Realtime API returned an empty SDP answer.')
  }

  return { answerSdp }
}

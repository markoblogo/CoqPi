import type { TranscriptUtterance } from './app-types'

const toTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

export const getFullTranscriptText = (utterances: TranscriptUtterance[]) => {
  return utterances
    .map((utterance) => utterance.text.trim())
    .join('\n')
    .trim()
}

export const getRecentTranscriptText = (
  utterances: TranscriptUtterance[],
  seconds: number
) => {
  if (utterances.length === 0) {
    return ''
  }

  const latestTimestamp = Math.max(
    ...utterances.map((utterance) =>
      toTimestamp(utterance.timestampEnd ?? utterance.timestampStart)
    )
  )
  const threshold = latestTimestamp - Math.max(0, seconds) * 1000

  return utterances
    .filter(
      (utterance) =>
        toTimestamp(utterance.timestampEnd ?? utterance.timestampStart) >=
        threshold
    )
    .map((utterance) => utterance.text.trim())
    .join('\n')
    .trim()
}

export const getLastUtterance = (utterances: TranscriptUtterance[]) => {
  return utterances[utterances.length - 1] ?? null
}

export const appendUtterance = (
  utterances: TranscriptUtterance[],
  nextUtterance: TranscriptUtterance
) => {
  return [...utterances, nextUtterance]
}

export const clearTranscript = () => {
  return [] as TranscriptUtterance[]
}

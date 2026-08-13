export type MeetingTranscriptionLanguage = 'uk' | 'ru' | 'en' | 'fr'

export type MeetingTranscriptionStatus =
  | 'idle'
  | 'recording'
  | 'stopped'
  | 'error'

export interface MeetingTranscriptionSegment {
  id: string
  startTime: string
  endTime?: string
  text: string
  speaker?: string
  isFinal: true
  sourceItemId?: string
}

export interface MeetingTranscriptionInterim {
  itemId: string
  text: string
  startTime: string
  updatedAt: string
}

export interface MeetingTranscriptionSession {
  id: string
  language: MeetingTranscriptionLanguage
  inputLabel: string
  startedAt: string
  stoppedAt?: string
  status: MeetingTranscriptionStatus
  segments: MeetingTranscriptionSegment[]
  interim: Record<string, MeetingTranscriptionInterim>
}

export interface MeetingRealtimeEvent {
  type?: string
  item_id?: string
  delta?: string
  transcript?: string
}

export const meetingTranscriptionLanguageLabels: Record<
  MeetingTranscriptionLanguage,
  string
> = {
  uk: 'Ukrainian',
  ru: 'Russian',
  en: 'English',
  fr: 'French'
}

const pad2 = (value: number) => String(value).padStart(2, '0')

export const formatMeetingDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

const formatDate = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10)
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`
}

const formatSegmentOffset = (
  session: MeetingTranscriptionSession,
  timestamp: string
) => {
  const start = new Date(session.startedAt).getTime()
  const current = new Date(timestamp).getTime()

  if (Number.isNaN(start) || Number.isNaN(current)) {
    return '00:00:00'
  }

  return formatMeetingDuration(current - start)
}

export const createMeetingTranscriptionSession = ({
  id,
  language,
  inputLabel,
  now
}: {
  id: string
  language: MeetingTranscriptionLanguage
  inputLabel: string
  now: string
}): MeetingTranscriptionSession => ({
  id,
  language,
  inputLabel,
  startedAt: now,
  status: 'recording',
  segments: [],
  interim: {}
})

export const applyMeetingTranscriptionRealtimeEvent = ({
  session,
  event,
  now,
  createSegmentId
}: {
  session: MeetingTranscriptionSession
  event: MeetingRealtimeEvent
  now: string
  createSegmentId: () => string
}): {
  session: MeetingTranscriptionSession
  committed: boolean
} => {
  if (session.status !== 'recording') {
    return { session, committed: false }
  }

  const itemId = typeof event.item_id === 'string' ? event.item_id : ''

  if (!itemId) {
    return { session, committed: false }
  }

  if (event.type === 'conversation.item.input_audio_transcription.delta') {
    const delta = typeof event.delta === 'string' ? event.delta : ''

    if (!delta) {
      return { session, committed: false }
    }

    const current = session.interim[itemId]
    const interim: MeetingTranscriptionInterim = {
      itemId,
      text: current ? `${current.text}${delta}` : delta,
      startTime: current?.startTime ?? now,
      updatedAt: now
    }

    return {
      session: {
        ...session,
        interim: {
          ...session.interim,
          [itemId]: interim
        }
      },
      committed: false
    }
  }

  if (event.type !== 'conversation.item.input_audio_transcription.completed') {
    return { session, committed: false }
  }

  const text = typeof event.transcript === 'string' ? event.transcript.trim() : ''

  if (!text) {
    return { session, committed: false }
  }

  const interim = session.interim[itemId]
  const nextInterim = { ...session.interim }
  delete nextInterim[itemId]

  const existingIndex = session.segments.findIndex(
    (segment) => segment.sourceItemId === itemId
  )

  if (existingIndex !== -1) {
    const nextSegments = [...session.segments]
    nextSegments[existingIndex] = {
      ...nextSegments[existingIndex],
      text,
      endTime: now
    }

    return {
      session: {
        ...session,
        segments: nextSegments,
        interim: nextInterim
      },
      committed: true
    }
  }

  return {
    session: {
      ...session,
      segments: [
        ...session.segments,
        {
          id: createSegmentId(),
          startTime: interim?.startTime ?? now,
          endTime: now,
          text,
          isFinal: true,
          sourceItemId: itemId
        }
      ],
      interim: nextInterim
    },
    committed: true
  }
}

export const stopMeetingTranscriptionSession = (
  session: MeetingTranscriptionSession,
  now: string
): MeetingTranscriptionSession => ({
  ...session,
  status: 'stopped',
  stoppedAt: now,
  interim: {}
})

export const generateMeetingTranscriptFilename = (
  session: Pick<MeetingTranscriptionSession, 'startedAt' | 'language'>,
  extension: 'md' | 'txt' = 'md'
) => {
  const date = new Date(session.startedAt)

  if (Number.isNaN(date.getTime())) {
    return `meeting-${session.language}.${extension}`
  }

  return `meeting-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}-${pad2(date.getHours())}${pad2(date.getMinutes())}-${
    session.language
  }.${extension}`
}

export const exportMeetingTranscriptMarkdown = (
  session: MeetingTranscriptionSession
) => {
  const stoppedAt = session.stoppedAt ?? new Date().toISOString()
  const duration = formatMeetingDuration(
    new Date(stoppedAt).getTime() - new Date(session.startedAt).getTime()
  )
  const lines = [
    '# Meeting Transcript',
    '',
    `Date: ${formatDate(session.startedAt)}`,
    `Language: ${meetingTranscriptionLanguageLabels[session.language]}`,
    `Duration: ${duration}`,
    `Input: ${session.inputLabel || 'Unknown microphone'}`,
    '',
    '## Transcript',
    ''
  ]

  for (const segment of session.segments) {
    lines.push(`[${formatSegmentOffset(session, segment.startTime)}] ${segment.text}`)
  }

  return `${lines.join('\n')}\n`
}

export const exportMeetingTranscriptText = (
  session: MeetingTranscriptionSession
) => {
  const header = [
    'Meeting Transcript',
    `Date: ${formatDate(session.startedAt)}`,
    `Language: ${meetingTranscriptionLanguageLabels[session.language]}`,
    `Input: ${session.inputLabel || 'Unknown microphone'}`,
    ''
  ]

  return `${[
    ...header,
    ...session.segments.map(
      (segment) =>
        `[${formatSegmentOffset(session, segment.startTime)}] ${segment.text}`
    )
  ].join('\n')}\n`
}

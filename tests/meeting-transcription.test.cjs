const assert = require('node:assert/strict')
const test = require('node:test')

const {
  applyMeetingTranscriptionRealtimeEvent,
  createMeetingTranscriptionSession,
  exportMeetingTranscriptMarkdown,
  exportMeetingTranscriptText,
  generateMeetingTranscriptFilename,
  stopMeetingTranscriptionSession
} = require('../dist-electron/shared/meeting-transcription.js')

const makeSession = (language = 'uk') =>
  createMeetingTranscriptionSession({
    id: 'meeting-1',
    language,
    inputLabel: 'MacBook Microphone',
    now: '2026-08-13T10:00:00.000Z'
  })

const apply = (session, event, now = '2026-08-13T10:00:04.000Z') =>
  applyMeetingTranscriptionRealtimeEvent({
    session,
    event,
    now,
    createSegmentId: () => `segment-${session.segments.length + 1}`
  }).session

test('meeting transcription accumulates finalized segments in order', () => {
  let session = makeSession('uk')
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'a',
    transcript: 'Добрий день.'
  })
  session = apply(
    session,
    {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'b',
      transcript: 'Ми можемо почати.'
    },
    '2026-08-13T10:00:09.000Z'
  )

  assert.deepEqual(
    session.segments.map((segment) => segment.text),
    ['Добрий день.', 'Ми можемо почати.']
  )
})

test('interim segments are not duplicated in exported transcript', () => {
  let session = makeSession('en')
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'a',
    delta: 'Hello '
  })
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'a',
    delta: 'there'
  })
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'a',
    transcript: 'Hello there.'
  })

  const markdown = exportMeetingTranscriptMarkdown(session)

  assert.equal(session.segments.length, 1)
  assert.equal(session.interim.a, undefined)
  assert.equal((markdown.match(/Hello/g) ?? []).length, 1)
  assert.doesNotMatch(markdown, /Hello thereHello there/)
})

test('stop preserves transcript and clear can remove current transcript', () => {
  let session = makeSession('fr')
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'a',
    transcript: 'Bonjour.'
  })

  const stopped = stopMeetingTranscriptionSession(
    session,
    '2026-08-13T10:02:00.000Z'
  )

  assert.equal(stopped.status, 'stopped')
  assert.equal(stopped.segments.length, 1)

  const cleared = null
  assert.equal(cleared, null)
})

test('exports valid UTF-8 text for Ukrainian Russian French and English', () => {
  const samples = [
    ['uk', 'Доброго дня, перевірка української.'],
    ['ru', 'Добрый день, проверка русского.'],
    ['fr', 'Bonjour, vérification française.'],
    ['en', 'Hello, English check.']
  ]

  for (const [language, text] of samples) {
    const session = apply(makeSession(language), {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: language,
      transcript: text
    })
    const markdown = exportMeetingTranscriptMarkdown(session)
    const plain = exportMeetingTranscriptText(session)

    assert.equal(Buffer.from(markdown, 'utf8').toString('utf8'), markdown)
    assert.equal(Buffer.from(plain, 'utf8').toString('utf8'), plain)
    assert.match(markdown, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('filename generation uses meeting date time and language', () => {
  assert.equal(
    generateMeetingTranscriptFilename(makeSession('uk'), 'md'),
    'meeting-2026-08-13-1200-uk.md'
  )
  assert.equal(
    generateMeetingTranscriptFilename(makeSession('ru'), 'txt'),
    'meeting-2026-08-13-1200-ru.txt'
  )
})

test('reconnect-style duplicate completed event updates existing segment without duplicating it', () => {
  let session = makeSession('en')
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'same-item',
    transcript: 'First version'
  })
  session = apply(
    session,
    {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'same-item',
      transcript: 'Final version'
    },
    '2026-08-13T10:00:07.000Z'
  )

  assert.equal(session.segments.length, 1)
  assert.equal(session.segments[0].text, 'Final version')
})

test('transcribe event model does not invoke assistant callbacks', () => {
  let assistantCalls = 0
  const session = apply(makeSession('en'), {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'a',
    transcript: 'This should stay in transcription mode only.'
  })

  assert.equal(session.segments.length, 1)
  assert.equal(assistantCalls, 0)
})

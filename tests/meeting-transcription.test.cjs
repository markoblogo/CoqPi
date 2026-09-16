const assert = require('node:assert/strict')
const test = require('node:test')

const {
  applyMeetingTranscriptionRealtimeEvent,
  createMeetingTranscriptionSession,
  exportMeetingTranscriptMarkdown,
  exportMeetingTranscriptText,
  excludeMeetingTranscriptSegmentFromExport,
  generateMeetingTranscriptFilename,
  mergeMeetingTranscriptSegmentIntoPrevious,
  restoreMeetingTranscriptSegmentToExport,
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

test('stopped sessions retain an unfinalized interim segment for recovery', () => {
  let session = makeSession('fr')
  session = apply(session, {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'partial',
    delta: 'Bonjour, je voulais'
  })

  const stopped = stopMeetingTranscriptionSession(
    session,
    '2026-08-13T10:02:00.000Z'
  )

  assert.equal(stopped.interim.partial.text, 'Bonjour, je voulais')
  assert.match(exportMeetingTranscriptMarkdown(stopped), /Unfinalized audio/)
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
  const localNoonSession = (language) => ({
    ...makeSession(language),
    startedAt: '2026-08-13T12:00:00'
  })

  assert.equal(
    generateMeetingTranscriptFilename(localNoonSession('uk'), 'md'),
    'meeting-2026-08-13-1200-uk.md'
  )
  assert.equal(
    generateMeetingTranscriptFilename(localNoonSession('ru'), 'txt'),
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

test('recovered transcript segments are labeled and excluded from export when rejected', () => {
  const session = {
    ...makeSession('fr'),
    segments: [
      {
        id: 'recovered-1',
        startTime: '2026-08-13T10:00:04.000Z',
        endTime: '2026-08-13T10:00:10.000Z',
        text: 'Bonjour depuis le backup.',
        source: 'microphone',
        speaker: 'UNKNOWN',
        isFinal: true,
        sourceItemId: 'audio-recovery:microphone:hash:chunk:0:0-6000',
        recovery: {
          status: 'active',
          source: 'microphone',
          recoveredAt: '2026-08-13T10:03:00.000Z',
          chunkIndex: 0,
          startOffsetMs: 0,
          endOffsetMs: 6000
        }
      }
    ]
  }

  const markdown = exportMeetingTranscriptMarkdown(session)
  assert.match(markdown, /UNKNOWN \(recovered microphone, approx 00:00:04-00:00:10\)/)
  assert.match(markdown, /Bonjour depuis le backup\./)

  const excluded = excludeMeetingTranscriptSegmentFromExport(session, 'recovered-1')
  assert.equal(excluded.segments[0].recovery.status, 'excluded_from_export')
  assert.doesNotMatch(exportMeetingTranscriptMarkdown(excluded), /Bonjour depuis le backup/)
  assert.doesNotMatch(exportMeetingTranscriptText(excluded), /Bonjour depuis le backup/)
})

test('recovered transcript chunks can be merged into the previous segment before export', () => {
  const session = {
    ...makeSession('en'),
    segments: [
      {
        id: 'base',
        startTime: '2026-08-13T10:00:04.000Z',
        endTime: '2026-08-13T10:00:08.000Z',
        text: 'First recovered phrase.',
        source: 'microphone',
        speaker: 'UNKNOWN',
        isFinal: true,
        sourceItemId: 'audio-recovery:microphone:hash:chunk:0:0-4000',
        recovery: {
          status: 'active',
          source: 'microphone',
          recoveredAt: '2026-08-13T10:03:00.000Z',
          chunkIndex: 0,
          startOffsetMs: 0,
          endOffsetMs: 4000
        }
      },
      {
        id: 'next',
        startTime: '2026-08-13T10:00:08.000Z',
        endTime: '2026-08-13T10:00:12.000Z',
        text: 'Second recovered phrase.',
        source: 'microphone',
        speaker: 'UNKNOWN',
        isFinal: true,
        sourceItemId: 'audio-recovery:microphone:hash:chunk:1:4000-8000',
        recovery: {
          status: 'active',
          source: 'microphone',
          recoveredAt: '2026-08-13T10:03:01.000Z',
          chunkIndex: 1,
          startOffsetMs: 4000,
          endOffsetMs: 8000
        }
      }
    ]
  }

  const merged = mergeMeetingTranscriptSegmentIntoPrevious(session, 'next')
  assert.equal(merged.segments[0].text, 'First recovered phrase.\nSecond recovered phrase.')
  assert.equal(merged.segments[0].endTime, '2026-08-13T10:00:12.000Z')
  assert.equal(merged.segments[0].recovery.mergedSegmentIds.includes('next'), true)
  assert.equal(merged.segments[1].recovery.status, 'excluded_from_export')

  const markdown = exportMeetingTranscriptMarkdown(merged)
  assert.equal((markdown.match(/Second recovered phrase/g) ?? []).length, 1)
})

test('excluded recovered transcript segments can be restored to export', () => {
  const session = {
    ...makeSession('en'),
    segments: [
      {
        id: 'recovered-restore',
        startTime: '2026-08-13T10:00:04.000Z',
        endTime: '2026-08-13T10:00:08.000Z',
        text: 'Restored phrase.',
        source: 'microphone',
        speaker: 'UNKNOWN',
        isFinal: true,
        sourceItemId: 'audio-recovery:microphone:hash:chunk:0:0-4000',
        recovery: {
          status: 'excluded_from_export',
          source: 'microphone',
          recoveredAt: '2026-08-13T10:03:00.000Z',
          chunkIndex: 0,
          startOffsetMs: 0,
          endOffsetMs: 4000,
          reviewNote: 'excluded_in_review'
        }
      }
    ]
  }

  assert.doesNotMatch(exportMeetingTranscriptMarkdown(session), /Restored phrase/)

  const restored = restoreMeetingTranscriptSegmentToExport(session, 'recovered-restore')
  assert.equal(restored.segments[0].recovery.status, 'active')
  assert.equal(restored.segments[0].recovery.reviewNote, 'restored_in_review')
  assert.match(exportMeetingTranscriptMarkdown(restored), /Restored phrase\./)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { ManualSpeakerTracker } = require('../dist-electron/shared/manual-speaker.js')
const { createMeetingTranscriptionSession, applyMeetingTranscriptionRealtimeEvent, exportMeetingTranscriptMarkdown } = require('../dist-electron/shared/meeting-transcription.js')

test('released Space does not relabel a delayed final as OTHER', () => {
  const tracker = new ManualSpeakerTracker()
  tracker.setSpeaking(true)
  tracker.observe({type:'input_audio_buffer.speech_started',item_id:'me'})
  tracker.observe({type:'input_audio_buffer.speech_stopped',item_id:'me'})
  tracker.setSpeaking(false)
  assert.equal(tracker.observe({type:'conversation.item.input_audio_transcription.completed',item_id:'me'}),'self')
  assert.equal(tracker.observe({type:'input_audio_buffer.speech_started',item_id:'other'}),'other')
  assert.equal(tracker.observe({type:'conversation.item.input_audio_transcription.completed',item_id:'other'}),'other')
})

test('marking an active item excludes the whole mixed item conservatively', () => {
  const tracker = new ManualSpeakerTracker()
  tracker.observe({type:'input_audio_buffer.speech_started',item_id:'mixed'})
  assert.deepEqual(tracker.setSpeaking(true), ['mixed'])
  tracker.setSpeaking(false)
  assert.equal(tracker.observe({type:'conversation.item.input_audio_transcription.completed',item_id:'mixed'}),'self')
})

test('ME labels survive interim, final and exported transcript', () => {
  let session = createMeetingTranscriptionSession({id:'label-test',language:'fr',inputLabel:'Mic',now:'2026-09-07T10:00:00Z'})
  for (const event of [
    {type:'conversation.item.input_audio_transcription.delta',item_id:'mine',delta:'Je travaille',speaker:'ME'},
    {type:'conversation.item.input_audio_transcription.completed',item_id:'mine',transcript:'Je travaille ici.',speaker:'ME'}
  ]) {
    session=applyMeetingTranscriptionRealtimeEvent({session,event,now:'2026-09-07T10:00:01Z',createSegmentId:()=> 's1'}).session
    assert.equal(session.segments[0]?.speaker ?? session.interim.mine.speaker,'ME')
  }
  assert.match(exportMeetingTranscriptMarkdown(session), /ME\nJe travaille ici/)
})

test('late delta from a finished OTHER turn is not reassigned when owner starts speaking', () => {
  const tracker = new ManualSpeakerTracker()
  tracker.observe({type:'input_audio_buffer.speech_started',item_id:'previous'})
  tracker.observe({type:'input_audio_buffer.speech_stopped',item_id:'previous'})
  tracker.observe({type:'conversation.item.input_audio_transcription.delta',item_id:'previous'})
  assert.deepEqual(tracker.setSpeaking(true), [])
  assert.equal(tracker.observe({type:'conversation.item.input_audio_transcription.completed',item_id:'previous'}),'other')
})

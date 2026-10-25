# Virtual interview

## Use

1. Open Learning, select **Virtual interview**, then English or French.
2. Optionally expand **Microphone** and select your actual microphone. Use
   headphones to avoid speaker audio leaking into the microphone backup.
3. Press **Start**. Listen to the fictional interviewer; wait for **Your answer**.
4. Read or paraphrase the large Live-generated hint. Once your response is
   transcribed, press **Next**. After the fifth response press **Finish**.
5. **Stop** ends early and saves. Expand **Recording & timing** for the transcript,
   metrics, prior practice sessions and Markdown export.

This first pass uses a fixed fictional product-strategy scenario and five
questions. It intentionally does not use your CV, confirmed personal replies or
the context selected for a real employer. Submitted-CV rehearsal and adaptive
follow-ups are later passes. [Audio-backed review](INTERVIEW_AUDIO_REVIEW.md) is
available after Stop for newly recorded voice answers with saved time boundaries.

## Recording and failures

Local files remain under the configured session directory, normally
`~/Library/Application Support/CoqPi/data/sessions/`:

- `meeting-transcription-journal.ndjson`: incremental transcript snapshots/patches;
- `recordings/<session-hash>.json`: durable archive, assistant events and timings;
- `audio-backups/<session-hash>/microphone.wav`: independent microphone PCM backup.

STT or hint failures do not stop the microphone backup. Partial recognized text
is kept as interim, not falsely finalized. Stop flushes transcript writes and
closes the WAV header. A disk-write error remains visible and Stop can be retried.
No application can preserve audio that the operating system never delivered.
The microphone backup can contain acoustic speaker leakage on loudspeakers;
it is not diarization evidence.

## Timing interpretation

`First text` and `Full hint` start when the question is submitted to Live, in
parallel with question TTS. `Model` is the backend service timing. `STT after
speech` starts at the provider speech-stopped event, not an independently measured
acoustic endpoint; it is unavailable if that event is missing. Typed answers
cannot establish speech latency. This is not a substitute for real-call routing QA.

## Tests

- `tests/virtual-interview.test.cjs`: five-turn EN/FR loops, cancellation, failures,
  duplicate finals, partial text, restart and delayed microphone acquisition.
- `tests/analyze-recent-transcript.test.cjs`: actual Live service request isolation.
- `tests/meeting-transcription-service.test.cjs`: durable practice readback/export.
- `tests/recording-shutdown.test.cjs`: all recorder flushes before close acknowledgement.
- `scripts/acceptance/virtual-interview.cjs`: full App UI with synthetic providers.
- `scripts/acceptance/virtual-interview-real.cjs`: opt-in paid candidate-bundle
  test with BlackHole and synthetic EN/FR speech, separate temporary user data,
  bounded model/STT calls and a three-minute watchdog. Requires explicit budget.

No pronunciation score or automatic promotion into learning mistakes is performed.
Audio feedback is tentative and owner-reviewed. A recognizer's text alone cannot
establish a pronunciation error.

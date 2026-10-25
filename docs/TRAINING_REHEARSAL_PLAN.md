# Training and rehearsal: delivery contract

Owner scope, 2026-10-24. Pass 1 now has a bounded virtual interview implementation;
the other paths below remain planned. Rehearsal is an acceptance environment,
not proof that real meeting audio routing is reliable.

## Three practice paths

1. **Language tutor (EN or FR).** A short initial conversation estimates a
   provisional level, then alternates retrieval practice, new expressions,
   speaking and correction. Start subsequent lessons with previous weak items.
   Keep EN and FR progress separate. A suggested ten-minute lesson is not an
   automatic scheduled task or a claim of certified CEFR assessment.
2. **Virtual interview / project presentation.** An explicitly fictional
   interlocutor and company/project brief provide standard and follow-up
   questions. CoqPi shows a ready-to-say answer; the owner reads it or paraphrases.
   Review follows the answer, not during it. Fictional facts remain in this
   exercise and must never enter the owner profile, confirmed bank or real Live.
3. **Specific upcoming interview.** Bind the exercise to the exact submitted CV,
   vacancy, company information and additional selected material. The employer
   persona asks relevant standard, specific and challenging follow-ups. A link
   alone is not fetched evidence. Never claim company research was performed
   unless a source adapter actually retrieved it and the content was reviewed.

Use the current compact call surface for rehearsal: question/meaning smaller,
answer larger. Setup and review stay outside the active exchange. Ask one
question at a time; let the owner pause, repeat, skip or end. The assistant
must not hear its own question as the learner's response.

## Current implementation

- Learning -> Virtual interview opens a fictional Atelier Pilot interview:
  five explicit EN/FR questions, spoken by local system TTS. These are a bounded
  question set, not an adaptive AI employer or company-research claim.
- Each question calls the same `analyzeRecentTranscript` service and streaming
  interface as Live. `practiceScenario: atelier-pilot-v1` enforces backend-owned
  synthetic context and excludes real profile, selected packs, drafts, memory
  and the personal reply bank even if a caller supplies them.
- Question audio finishes before learner STT starts. The microphone has an
  independent local PCM WAV backup throughout the exercise. Final ME text and
  interim text are saved incrementally in the ordinary transcript journal.
  ME responses never trigger another hint or change the exercise language.
- Next is enabled after a finalized answer and disabled while partial text is
  pending. Stop cancels hints/TTS and saves available text, including interim
  text. Audio recovery remains available through the recording archive; stopping
  does not promise that an unfinished STT request will return a final segment.
- The compact view shows question, large hint, learner text and Next/Stop.
  Timing, archive selection, export and typed fallback are collapsed. Typed
  answers are marked as typed, never counted as microphone/STT measurements.
- Saved `practice.turns` records question audio end, request start, first text,
  full hint, model timing and speech-end-to-final-STT timing when available.
  First text is not certified useful/final text. Questions are generated locally,
  so this test does not measure incoming-call STT-to-hint latency.
- Transcript Markdown includes synthetic scenario labeling, timing and hints.
  Reopening saved practice restores text and measurements, not an active call.
- Shutdown acknowledgement waits for every active recording subscriber.

See [virtual interview runbook](VIRTUAL_INTERVIEW.md) for use and verification.

## Remaining tutor baseline

- `TrainingPanel.tsx` supports EN/FR, system TTS, realtime STT, text coaching and
  recent saved exercises. It does not yet implement a complete employer persona.
- Legacy language-lesson voice input is accumulated into a text field. Its history
  labels entries `manual` / `other`; this is not accurate source provenance for
  microphone answers and must be migrated in the rehearsal pass.
- Recent feedback is available, but there is no structured mistake curriculum,
  pronunciation evidence, spaced review or reliable level assessment.
- Coaching is text-only. The prompt now explicitly forbids diagnosing
  pronunciation from text; this is prompt guidance, not a semantic guarantee.

## Delivery order

### Pass 1: Virtual interview and measurable practice loop (implemented, bounded)

Create a bounded fictional scenario and explicit turns: interlocutor question,
hint, learner audio/text, review, follow-up. Fix source labels. Reuse the actual
Live question-to-suggestion service, latest-utterance semantics, cancellation,
selected-context handling and durable recording rather than a second hint engine.
Keep tutor/persona generation separate from answer generation and from grading.
Question TTS must finish before the learner microphone turn; support headphones
and controlled echo isolation. Preserve typed fallback without marking it audio.

Save wall-clock boundaries for question audio end, STT final, first useful hint,
complete hint and learner response. Report STT/model/total latency separately;
typed questions cannot count as audio latency tests. Review and persistence must
not block the next hint. Test Stop, late results, restart, language change and
network interruption with synthetic fixtures, then authorized real speech.

Acceptance: a five-question EN and FR session, recorded learner answers,
read-aloud and paraphrase cases, durable reopen, no self-triggering hint loop,
no fictional fact entering real owner context. Paid tests need an explicit budget.

### Pass 2: Audio-backed pronunciation review

Implemented as a manual, post-Stop [audio review](INTERVIEW_AUDIO_REVIEW.md) for
new virtual answers. It uses a bounded microphone WAV slice and saves tentative
findings and owner decisions separately. Short repeat capture and conservative
two-stage recommendation recheck/comparison are now implemented. Identical audio,
unconfirmed/unsupported advice and weak evidence cannot establish improvement.
Human pronunciation calibration and shared lesson transfer remain open.

Use an explicitly captured learner microphone clip, expected text when reading,
actual paraphrase when not, language and time range. The bounded implementation
uses OpenAI gpt-audio with manual consent and no retries. Do not treat word mismatch or STT normalization as phonetic
evidence. Poor/no audio yields `not assessed`, never a pronunciation score.

Each supported finding needs the clip/time range, target word or sound,
explanation, an audible correct example, confidence and repeat attempt. Accept
intelligible accents and valid paraphrases. Limit immediate review to 1-3 useful
corrections. Let the owner contest or confirm a finding before it enters recurring
practice. Do not change real-call hint behavior in this pass.

### Pass 3: Submitted-CV interview rehearsal

Snapshot exact material versions and hashes for one interview; show missing
information before starting. Company-specific submitted CV controls personal
claims for this interview; general profile may supplement only compatible facts.
Conflicts require clarification, not silent merging. Old confirmed bank answers
must still satisfy their existing context hash before reuse.

The persona probes the actual role, CV and prior answers without inventing
employer facts or outcomes. Each correction distinguishes language, pronunciation
and substance. Material changes invalidate the exercise's stale hint/review.
Acceptance: two different employer/CV combinations cannot leak into each other.

### Pass 4: Tutor continuity and shared practice backlog

Introduce reviewed mistake records: language, type, evidence reference, corrected
form, confidence, review state, attempts and next review. Import only reviewed
findings from rehearsals and selected post-call reviews. Dedupe repeated items;
allow dismiss/resolve/delete. Keep audio-derived pronunciation findings distinct
from text grammar/vocabulary corrections and failed STT.

Start with a short level exploration, repeat weak items, introduce a bounded
amount of new vocabulary, then test in a fresh conversational setting. Increase
difficulty based on demonstrated performance, not merely pressing a positive
feedback button. Retain an explicit owner override and a lightweight progress
history; no gamification or extra live-call dashboard is required.

## Acceptance boundary

A virtual interview can validate hint relevance, safe context, read-aloud flow,
microphone transcription, cancellation and measured latency. It cannot prove
Zoom/Meet/system-audio routing, real accents, interruptions or long-call stability.
After the rehearsal passes, still run one short controlled real call. No claim
of real-call readiness from text-only fixtures or synthesized clean audio alone.

# Virtual interview acceptance, 2026-10-24

## Delivered

Local CoqPi 0.3.8: Learning -> Virtual interview. Five fixed EN/FR interviewer
questions, local question TTS, the real streaming Live analysis service, learner
microphone STT, independent WAV backup, incremental transcript and saved timings.
The former selected-context text rehearsal remains a separate mode.

Synthetic scenario admission is enforced in the backend. Real profile, personal
reply bank, memory, drafts and packs are not consulted. This is a fictional
exercise, not preparation grounded in the owner's submitted CV.

## Automated evidence

- `pnpm check`: **395/395 tests passed**, typecheck/lint/build passed, audit found
  no known vulnerabilities.
- Full App UI: five EN and five FR turns, synthetic microphone completion events,
  real request shape, Stop persistence, 400/640px wide compact screenshots.
  Long hints remain scrollable while Next/Stop stay visible in the sticky toolbar.
- Regressions cover late model/STT results, duplicate finals, TTS-time input,
  delayed microphone acquisition, typed fallback, partial text, failed save retry,
  audio-close failure, restart and archival readback.
- Close acknowledgement waits for all recording subscribers. Navigating away
  keeps the shutdown barrier until the outstanding save finishes.

## Authorized real provider/audio probe

Two short turns, one per language, used real OpenAI STT and Live hints, macOS
synthetic speech routed through BlackHole, and isolated temporary user data.
No provider/IPC/audio mocks. Model override for this bounded probe: `gpt-4o-mini`.
These timings are not a claim about the application's other configured models.

| Measurement | EN | FR |
| --- | ---: | ---: |
| First hint text | 2.487 s | 1.127 s |
| Complete hint | 3.056 s | 1.671 s |
| Backend service | 2.994 s | 1.656 s |
| STT final after provider speech-stopped event | 1.121 s | 0.608 s |
| STT final after test speech playback ended | 3.448 s | 1.169 s |
| Normalized word error rate | 0% | 9.1% |
| Closed, non-silent microphone WAV | 2,342,956 bytes | 1,531,948 bytes |

Both question TTS completions were observed. Both learner answers, hints and
timings survived Stop and archive readback. French conditional/future endings
were not all recognized exactly; this is not evidence of a learner pronunciation
error. Incoming question text is known before TTS, so this probe does not measure
incoming-call audio -> STT -> hint latency. The test used two bounded model calls,
two STT sessions and a three-minute watchdog within the authorized $1 ceiling;
this is a bounded test, not a billing reconciliation.

## Installation

Installed `/Applications/CoqPi.app`, version **0.3.8**. All 101 packaged renderer
and backend files matched the final build. Installed ASAR SHA-256:
`c6a5e3495d6824577f3bc1be575b8a45f7374ca847026c284c925fee1c33f27b`.
Native launch showed Key/Profile/Session ready and the new Virtual interview screen.
No GitHub release was created by this pass.

Existing profile, settings, encrypted key, confirmed replies and recording content
were preserved. The legacy Stop path refreshed an already-stopped record's dates
during shutdown. Stop is now idempotent, covered by a regression test. The original
dates were restored from the private backup through the journal service; only the
append-only journal changed, retaining its original prefix. All other 14 original
files, including the current snapshot and recording archive, matched their hashes.
Closing the corrected installed application left those hashes and the journal's
624-byte correction suffix unchanged; no second timestamp refresh occurred.
Previous application and private data backups were retained locally.

## Still unproven / next work

- Human accent/noisy microphone quality and long practice sessions.
- Adaptive interviewer follow-ups and exact submitted-CV voice rehearsal.
- Audio-backed pronunciation review and confirmed-error transfer to lessons.
- Real Zoom/Meet routing. A successful virtual interview does not certify it.

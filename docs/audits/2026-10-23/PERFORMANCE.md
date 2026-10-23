# Performance audit

Source `b194f11`, 2026-10-23. No paid provider calls. Numerical results below are local storage measurements, not conversation latency.

## What was measured

Reproduce after `pnpm build:electron`:

```sh
node scripts/audit-recording-reliability.cjs
```

The script creates its own temporary directories, mocks Electron, rejects network access except a locally stubbed fetch function, writes synthetic data, kills a child process, and removes its data afterwards. It never opens the user's transcripts or credentials. Raw output: [recording-probes.json](evidence/recording-probes.json).

Environment: macOS arm64, Apple M4, Node 22.14.0, OS temporary filesystem. Per group: one initial write, then 30 sequential measured saves with one new final segment each. Saves include sanitization, journal append+sync and two atomic snapshot writes. Short synthetic utterances, no audio capture or GUI in this process. Concurrent audit/build work may influence tails. Storage under the user's chosen external volume was not benchmarked.

| Starting segments | Samples | Median / p95 / worst |
|---|---:|---|
| 10 | 30 | 10.12 / 12.09 / 12.37 ms |
| 100 | 30 | 11.06 / 12.11 / 14.19 ms |
| 1000 | 30 | 12.14 / 14.12 / 14.88 ms |

This establishes a reproducible local persistence baseline only. Peak RSS and CPU usage in the JSON belong to the short Node probe, not Electron, sustained recording, or total system use. They cannot certify call-time resource consumption.

## Missing end-to-end measurements

| Required metric | Current evidence | Missing instrumentation |
|---|---|---|
| Speech onset -> first useful transcript | Not measured; n=0 real audio | Capture monotonic timestamp + provider item start + first displayed meaningful delta |
| Speech end -> stable final | Not measured; n=0 | Audio/VAD end, final event receipt and display timestamps |
| Speech end -> translation | Not measured; n=0 | Model meaning-ready event and renderer commit/paint |
| Speech end -> first usable answer | Not measured; n=0 | Partial meaningful answer signal; currently only full result |
| Speech end -> final answer | Backend returns overall analysis latency, not full speech latency | Carry recording/utterance/request ID end to end |
| UI commit/paint | Visual correctness exercised; no calibrated timing | React commit + next animation frame marker; long-task observations |
| Network vs API compute | Not separable from current client metrics | Request/headers/first token/end; provider server timing if available |
| Sustained CPU/RAM/disk/queue | Short local Node baseline only | 15-30 minute synthetic-audio run and authorized real audio; IPC queue depth, dropped samples |

No median/p95/worst is asserted for those unavailable metrics. The UI harness's fixed 700ms response wait and fixture `latencyMs` are injected values, not benchmarks. Fifteen-minute transcript fixtures compress event timestamps into a short test; they are not sustained voice recordings.

## Deterministic latency contributors

- `realtime-transcription-service.ts:93`: server VAD silence duration **800ms**, prefix padding 300ms. Padding preserves audio, it is not an additional fixed post-speech delay. Endpointing setting is not a measured provider completion time.
- `live-loop.ts:7` and `:1216`: **900ms** scheduled debounce, plus remaining **5s** analysis cooldown from `App.tsx:475`, plus **1200ms** for rapid eligible follow-ups. These are additive when applicable. Delta-driven state updates can reschedule work; test starvation during fast dialogue.
- Idle-path configured silence+debounce is about **1.7s before context/model work**, if endpointing behaves as configured. This is not an end-to-end baseline or guaranteed floor for every event path.
- `assistant-service.ts:578-718`: profile, opportunity handoff, draft resolution (including repeated reads), manifest, retrieval, memory and target brief are assembled sequentially per request. Default Live uses this legacy path; the simpler Markdown route exists but is not selected by Live.
- `assistant-service.ts:197,249`: OpenAI full structured response / Ollama `stream:false`. Translation waits for the answer JSON; there is no independently useful partial answer/meaning event.
- `assistant-service.ts:58-94,789-841`: default 10s attempt timeout and 25s route budget; context assembly happens before route budget starts. Promise.race rejects locally but does not abort the underlying provider operation. SDK retries/network may outlive the UI timeout.
- `raw-audio-backup-recorder.ts:69-106`: ScriptProcessor blocks of 4096 samples, roughly 85ms at 48kHz, execute on renderer thread and enter an unbounded promise chain. This is a reliability/queue hypothesis, not a measured source of UI jank.
- `meeting-transcription-service.ts:264-283`: patch journal is efficient, but both full snapshots are rewritten every save. The current short-string benchmark does not establish behavior for hour-long rich transcripts or slow disks.

## Proposed instrumentation and optimization order

1. Preserve a single `recordingId / utteranceId / contextVersion / requestId` across capture, STT, scheduler, provider and render. Record monotonic durations and compact counters, never speech text/keys in timing logs.
2. Emit timestamps for onset, endpoint, first delta, final, scheduled, dispatched, prompt-ready, provider-start, first-useful-field, provider-end and UI paint. Report failures/cancellations as well as successes. Partial JSON tokens alone do not count as useful output.
3. Prepare one bounded reviewed context before Start. Remove Finder/Opportunity/Monitor/mail reads and schedulers from the three-mode product. Cache by explicit material hash; refresh between calls or on explicit review, not while an answer is in flight.
4. Benchmark narrow answer+meaning schema versus streaming. Adopt whichever reduces time-to-readable answer without unstable rewrites, broken structure or factual drift. Abort superseded work and measure timeout behavior.
5. Tune endpointing/debounce only after audio baseline: shortening pauses too far fragments questions and increases cost. Keep corrections/coaching/research off the primary answer's critical path.

## Acceptance protocol

Collect at least 30 utterances per EN and FR condition, using known audio and disclosed synthetic/authorized participants. Measure clean, fast exchange, code-switch, noise, and one controlled network interruption separately; retain sample count and failure rate. Use nearest-rank p95, max, median, device/network/provider/model/commit and warm/cold state. Include provider timeout runs rather than dropping them from the report.

Do not set a numerical end-to-end latency promise until that baseline exists. Set the usability gate now: the answer must arrive while still relevant to the current turn, remain readable while the user speaks, and never be replaced by an obsolete request. After baseline, agree and record separate p50/p95 targets for transcript, meaning and ready-to-read answer.

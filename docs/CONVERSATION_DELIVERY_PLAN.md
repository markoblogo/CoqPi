# Conversation delivery order

Updated: 2026-09-14. This plan supersedes transcript-first UI priorities and
EN/FR-only Live assumptions. Source and fixture verification do not establish
real microphone accuracy or provider latency.

## Audit findings driving this order

- A rejected save poisoned the serialized promise tail, so later valid writes
  could fail without reaching disk. Recovery now isolates each operation.
- The segment reducer accepted only `recording` status: final STT events after
  an error could be discarded. Error-state sessions now retain those events.
- Current-session storage lacked an independent user-visible archive, making
  Clear/new-session behavior risky. Each saved session now has its own file.
- Language routing and response density were built around EN/FR and multi-field
  diagnostics. Current-turn language and a brief primary answer are now explicit.
- Heavy web/mail runtimes were imported before window startup. They are now
  deferred to the first relevant action without changing approvals or providers.

## 1. Preserve conversations

Implemented: a failed disk write no longer poisons the serialized save queue;
snapshots and journal writes are synced; journal records carry changed segments
rather than repeating the entire growing transcript; interim checkpoints are
limited to one per second, final segments save immediately. A renderer-owned
latest snapshot is flushed before Electron closes or quits. A save failure
keeps the window open. Already received segments continue to persist after STT
errors. WebRTC transport interruptions have three bounded reconnect attempts.
The first Amanu-inspired foundation is also in place: per-session audio-backup
manifests are stored under a hash directory, and exclusive claim files prevent
duplicate recording/transcription/recovery workers from processing the same
session while allowing recovery from corrupt or dead-owner claims. Local
WAV/PCM writers are now represented as source-specific backup files
(`microphone.wav`, optional `system.wav`) under one manifest. The default
renderer path still starts microphone backup only, but the backend contract and
recovery path can already handle a separate `system` source. A manual recovery
command can take stopped backup WAV files, split them into speech-aware bounded
chunks when nearby low-energy pauses exist, run those chunks through STT, and
append hash-deduplicated recovered segments with approximate timestamps to the
local transcript journal.

Each recording has a local archive under `sessions/recordings/<sha256(id)>.json`.
Clear resets the current workspace and retains the archive. Transcribe exposes
saved conversations and export. Live suggestions, model and latency are stored
with their originating recording. No API keys or system prompts enter exports.

Limits: saved audio is not automatically retranscribed in the background.
System-audio backup requires a real routed system stream; CoqPi does not infer
or fake it from microphone input. Hardware failure/power loss and real
15-minute RU/UK sessions still need observed tests. No claim of zero loss
across network outages is made.

## 2. Follow language switches and keep answers short

Live and Recorder request original-language multilingual STT. A cheap local
heuristic updates language per finalized turn across EN/FR/RU/UK; ambiguous
short Latin acknowledgements retain the previous language. The latest language
controls the next assistant request, regardless of earlier turns. EN/FR receive
Russian meaning; RU/UK receive original-language assistance. Segment language
is saved. A single brief spoken answer is requested and returned in Live.
Economy mode no longer silently replaces the answer with keywords.

The selector is an initial hint; switches remain enabled. The existing EN/FR
Personal Knowledge Core permission is not broadened silently: native-language
calls use existing selected session/pack facts but skip that EN/FR-only source
retrieval route. The selected target constraints remain in the provider prompt.

Limits: language identification is heuristic, not calibrated or acoustic.
Shared Cyrillic vocabulary can be ambiguous. The incoming STT accuracy and
real provider p50/p95 latency still require measurement.

## 3. Make Live answer-first

Default Live displays the large current answer and a smaller incoming meaning,
with start/stop, language hint, save health and one details action. Diagnostics,
full transcript, secondary answer fields and configuration are behind details.
Stale answers leave the primary answer area. Training, opportunity, archive and
preparation screens load on demand. Crawlee and Google API runtimes load only
when their respective actions are invoked, not before the first window.

Verification: `scripts/verify-conversation-ui.cjs` drives the actual Electron
App with synthetic WebRTC events and mocked assistant IPC, checks FR -> EN ->
RU -> UK -> FR request languages, local segment/assistant persistence and screenshots at
860x540, 720x480 and 1100x700, and closing with an unfinished segment. It does
not contact OpenAI or use the microphone. A separate synthetic fifteen-minute
RU/UK sequence checks recovery after a torn journal tail and stale snapshot;
this is not a fifteen-minute voice test.

## 4. Practice, prepare, review

Training now offers a language lesson and interview rehearsal. A lesson accepts
voice or text, can read the question aloud through system speech synthesis,
returns a corrected answer, Russian explanation and next question, and uses
recent confirmed practice outcomes/corrections to guide subsequent exercises.
Every completed exercise saves before optional feedback. Feedback updates the
same entry; a local append-only training ledger retains changes.

Prepare can build a strategy from the selected company, role, goal and reviewed
packs, list likely questions/evidence limits, and explicitly adopt the reviewed
strategy into session notes. Practice this meeting opens rehearsal using the
existing selected session. Existing URL/document ingress remains the source of
job/company/CV facts; strategy generation does not claim new web research.
Saved recordings support an explicit assistant review after the conversation.
Review only uses the selected recorded text, not unrelated private context.
Language coaching also skips profile/retrieval assembly; meeting rehearsal
retains the selected meeting context.

For MN7R brokerage calls, Live now has an optional supervised bridge. Finalized
OTHER speech is debounced locally and sent through Electron main to a scoped
Monitor live-preview endpoint. The cockpit shows a temporary current BID/OFFER
and loose opposite-side market options. ME/partial/system lines are excluded;
preview persists nothing; one explicit button saves the current client-only
window to Monitor Draft Inbox. Synthetic tests cover filtering, limits and
stale responses; real microphone accuracy and end-to-end latency are not proven.

## 5. Validate the real working loop, then extend audio/research

Next acceptance: one mixed-language speakerphone call; a temporary network
interruption; Stop/restart and close/reopen; one lesson with corrected repeat;
one vacancy + submitted CV selected in Prepare -> rehearsal -> Live.
Measure speech-end to meaning and answer at p50/p95 before changing models or
debounce values. Target budgets must be set from actual device/network results.

Further work: make recovered chunk boundaries phrase-aware rather than only
energy-aware, connect a real system-audio route to the prepared backup source
contract, add automatic multi-source company research, and deepen longitudinal
language error mastery and spaced repetition. These are not represented as
completed by the current fixture tests.

## Commands

`pnpm test:conversation` runs focused backend/shared regressions after build.
`pnpm test:pre-smoke` exercises the broader existing flows.
`pnpm test:conversation-ui` requires Playwright resolvable in the environment
(for example the Codex bundled runtime via NODE_PATH), plus a built app.
`pnpm pack:mac` creates the local macOS bundle. Git push, local installation,
signed public distribution and a real-call test are separate release checks.

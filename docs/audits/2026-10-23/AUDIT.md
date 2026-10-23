# CoqPi product audit

Date: 2026-10-23 (Europe/Paris). Source: `b194f11d8608b4addc818b0fc9561aed2d45461b`, version 0.3.2.
This is an audit and remediation proposal, not an implementation or release.

## Product decision confirmed during this audit

Only three modes remain in the target product:

1. **Conversation:** hear the counterpart, show one short ready-to-read answer in their current language (especially EN/FR), with smaller Russian meaning. Keep the conversation recorded independently.
2. **Recorder:** record first, transcribe afterwards if requested, summarize on request. Live transcription may be optional.
3. **Lessons:** short EN/FR spoken practice, corrections, repeated-error practice, progressive difficulty and history.

Conversation includes a requested post-call review on two axes: (a) agreements, open questions, possible next developments and actions, with inference labeled; (b) the user's pronunciation/language errors, linked to ME audio, feeding later lessons. During a call, ONLY high-confidence meaning-changing errors may add "Sorry, I meant..." / "Pardon, je voulais dire..." directly to the next suggestion, followed by the normal answer. Do not interrupt with general pronunciation coaching or treat an intentional rephrase as an error.

Finder, outreach, Gmail, Calendar, CRM/Monitor and their workflows are to be **removed**, not merely hidden. Another project already supplies opportunities. Keep only document/link extraction needed to prepare a conversation. Existing unrelated user data must survive retirement of these modules.

Two context layers are required:

- Persistent owner context: reviewed facts from CVs, LinkedIn, Behance and personal website.
- Meeting context: the exact CV/deck already sent, vacancy/company links, counterpart facts, goals, permissible extra facts and claims to avoid.

Meeting-specific sent materials govern presentation. A more extensive master profile must not silently substitute for what this counterpart received. General knowledge can answer general questions; time-sensitive web claims need evidence. Neither web results nor model knowledge can establish personal achievements.

## Executive assessment

CoqPi has useful working components, but the main journey is not yet demonstrated end to end with actual speech and provider responses. Automated success is mostly contract success with synthetic events and stubbed model outputs. Preserve the journal, typed bridge, review boundaries and compact Live surface. Simplify context preparation and remove the unrelated execution paths before expanding capabilities.

The clearest blockers are audio routing, crash recovery, and delivery drift. The installed `/Applications/CoqPi.app` reports **0.1.0** in both Info.plist and its embedded package.json; the archive has no `meeting-recording-backup-service.js` or `meeting-transcription-recovery-service.js`. Source 0.3.2 behavior therefore cannot be assumed to exist in the installed application. The installed app was not replaced during this audit.

## Evidence and boundaries

| Evidence | Result | What it establishes |
|---|---|---|
| Isolated `pnpm check` | Typecheck/lint/build and **359/359 tests pass**; final dependency audit fails | Current code/test compatibility, not voice quality |
| Plain `pnpm check` | 352 pass, 7 fail | Six tests reach the sibling private Knowledge path; one local-server test is sandbox-blocked |
| `scripts/audit-recording-reliability.cjs` | Executed, synthetic data only | Process-kill survival, recovery defects, local save costs, language/retrieval probes |
| Renderer visual audit | See [UX review](UX-REVIEW.md) | Isolated synthetic UI behavior; not installed-binary/audio certification |
| Real STT/model calls | Not performed | No paid API authorization or real speech quality claim |
| Dependency audit | 24 advisories: 1 critical, 11 high, 9 moderate, 3 low | Dependency findings, not proven exploitability of packaged CoqPi |

The first unisolated test attempt was stopped by filesystem protection when trying to write the sibling manifest. Subsequent checks explicitly used temporary data/profile/session/knowledge/governance directories. A temporary audit-harness lint failure was corrected before the isolated successful code/test/build run; it is not a product defect.

## Function inventory against real user needs

Statuses: **verified** = executed locally at the stated boundary; **partial** = implementation exists but key acceptance is missing; **absent** = no connected user path found.

| Capability | Current implementation / quality | User-scenario fit / disposition |
|---|---|---|
| EN/FR question to short answer | Partial: Realtime microphone STT, heuristic language, final-event gating, structured assistant response | Core. Real audio/provider accuracy and latency unmeasured |
| Russian meaning | Partial: same full model response as answer | Core. No independent translation stream; original text can occupy meaning area while waiting |
| Language switching | Verified for simple fixtures; three of six adversarial text examples retain wrong language | Core. Short ordinary EN/FR questions can receive wrong-language response routing |
| ME vs OTHER | Manual Space/toggle, persisted labels; focused window required for Space | Core. Mixed speakerphone audio relies on user discipline; not automatic attribution |
| System audio | Virtual-input PCM backup only; no system track in realtime peer | Core gap for headphones: counterpart is recoverable later, not heard live by default |
| RU/UK assistance | Implemented original-language response path | Retain when needed; EN/FR source retrieval explicitly skipped for native-language path |
| Continuous text storage | Verified final-event saves, interim checkpoints, synced journal and atomic snapshots | Keep. Does not guarantee unreceived speech survives STT failure |
| Audio-first recorder | Absent as independent path: Start requires OpenAI key and STT setup | Required secondary-mode gap |
| Audio backup and recovery | Verified normal Stop, source manifests, speech-aware chunks, source/hash dedupe | Partial: killed process leaves unclosed file rejected by Recover; overlap duplication |
| Archive/export | Verified backend MD/TXT/archive contracts | Keep. Archive offers export/review, not archive-specific Recover |
| Recovery review | Exclude/restore/merge persisted | Merge then Restore repeats merged text; quality report transient |
| On-request summary | Archive Review calls assistant, displays result | Partial: uses all segments including excluded recovery text; prompt cuts tail at 30k chars; review is not durably saved |
| Negotiation outcome / next-step analysis | Generic review prompt distinguishes observations/inference, optional follow-up | Partial: no persisted evidence-linked agreements/actions/projection contract |
| Pronunciation review and meaning-changing repair | No audio pronunciation evaluation or automatic lesson handoff found | Absent. Requires ME audio evidence; text STT alone cannot establish how a word was pronounced |
| Language lessons | Voice/text, system TTS question, feedback/history, corrections | Partial: no daily lesson progression engine; raw voice answer not saved until analysis succeeds; default mic ignores Live input choice |
| Interview rehearsal | Uses selected session context and brief style | Partial: next-question/turn management is shallow; scenario preset is passed but legacy prompt does not use scenarioId |
| Meeting strategy | Selected target/goal -> strategy -> explicit save into notes | Keep purpose, simplify interface and input contract |
| CV/text extraction | Explicit file capture, local readable formats; MarkItDown optional for office/PDF | Keep bounded extractors. Parser execution on user's real files not attempted |
| Owner/counterpart links | Context stores pointers; Finder has separate public-page fetch/preview | Partial: saving a LinkedIn/site URL alone does not supply its contents to Live |
| Selected context retrieval | Deterministic lexical ranking + selected IDs + target brief/abstain | Partial: equivalent French question gets weak fallback against English facts; no semantic cross-language ranker |
| Exact sent-material version | Opportunity pack hashes exist, multiple profile/session routes coexist | Partial for simple meeting setup: no single authoritative submitted-CV handoff across all paths |
| General questions / web | Model general knowledge possible; no web tool in Live analysis | Current-information search absent in Live. Preserve generic answers, stage bounded cited research before the call |
| Simple Markdown path | Backend loader/prompt/model exists; active Live omits simple mode and Training explicitly uses legacy | Useful donor inside this repo, not active fast path. Historical plan overstates adoption |
| Finder/search/queue/mail/calendar | Large implementations, mocked tests, separate credentials and operational validation | Remove from target; keep any shared source-extraction primitives actually needed |
| Cortex / memory / Monitor | Selected-context and brokerage integrations implemented | Remove product-facing integrations; retain only necessary local evidence/storage helpers |
| Offline local STT | Absent; Ollama only optional text fallback | Do not require new STT stack for first repair batch. Local audio capture must work without cloud |

## Actual pipeline and concurrency

`one selected input -> getUserMedia -> WebRTC -> OpenAI Realtime -> delta/final -> React -> local journal`

`final OTHER -> language heuristic -> noise/dedupe filters -> 900ms debounce (+ cooldown/rapid-turn delay) -> IPC -> sequential context reads -> full JSON model result -> UI`

`cloned mic + optional second getUserMedia input -> ScriptProcessor PCM16 -> serialized IPC writes -> WAV -> Stop/header/hash -> manual recovery`

Audio backup is started by the realtime client's callback, not an independent recording lifecycle. At reconnect, a new clone is offered while the prior backup can continue; pending starts are not generation-guarded in the App backup orchestrator. App Stop clears source IDs before finishing, processes sources sequentially, and ignores backup errors. A system-stop error can prevent microphone stop. RawAudioBackupRecorder suppresses prior write errors and has no bounded queue or persistent failure indicator.

Realtime reconnect is bounded to three scheduled attempts (1/2/4 seconds); counter does not reset on successful reconnect. Generic provider transcription errors set UI error but do not themselves trigger transport reconnection. Assistant timeouts use Promise.race without aborting the underlying provider request. Prompt preparation precedes the route budget. UI-side in-flight freshness requires further scrutiny: result is applied without a request-generation/selected-context check; transcript-ID stale checks are not a complete context guard.

## Findings and reproducibility

| ID / priority | Trigger and evidence | Impact / likely cause | Correction / effort / verification |
|---|---|---|---|
| F01 P0 | Headphones; Mic physical + System backup virtual. Realtime client adds only mic tracks (`realtime-transcription-client.ts:139`); App starts system separately (`App.tsx:1403`) | Other side missing from live answers despite enabled backup | Separate verified source route; use routed OTHER for STT, retain ME capture. M/L; synthetic distinct source markers + authorized live loopback |
| F02 P0 | Kill child after 32,000 PCM bytes. Journal restores 1 segment, WAV header says 0, manifest open, Recover rejects | Backup exists but user cannot recover interrupted conversation | Repair orphan WAV/header from bytes, checkpoint/finalize safely; durable recovery per chunk. M; SIGKILL and second-source failure regressions |
| F03 P0 | Double-click installed app; embedded version 0.1.0, recovery modules absent | Source fixes unavailable to the actual user | Reproducible bundle/install/build-ID checks after fixes. S; compare installed artifact and launch metadata |
| F04 P0 | Visually reproduced: defer answer, Stop, Reset, resolve promise; old answer appears as current. `App.tsx:5449` unconditionally sets result | User may read an abandoned answer; transcript-only freshness incomplete | Request generation tied to session+utterance+language+context, invalidate on reset/change. M; delayed-provider actual App regression |
| F05 P1 | `Describe a challenging project.` after FR stays FR; `Quel budget faut-il ?` after EN stays EN | Incorrect reply language in ordinary interview questions | Calibrated language metadata/heuristic fallback plus easy live correction. M; mixed-language corpus and natural voice |
| F06 P1 | Same English CV fact: EN query strong; equivalent FR query weak fallback. Context links remain pointers (`context-source-service.ts:1323`) | User believes uploaded/linked facts support answer, but relevant evidence may be missing | One reviewed bilingual meeting brief with source refs; explicit link extraction state. M; EN/FR paraphrase + missing-fact fixtures |
| F07 P1 | VAD 800ms + scheduling 900ms, optional 1.2s and 5s cooldown; full JSON response only | Waiting for answer also withholds translation | Instrument then reduce avoidable delays; stream useful text or measure narrower schema. M; staged timings and answer stability tests |
| F08 P1 | Recover after live transcript duplicates same text (1 -> 3 segments); Merge/Restore exports repeated sentence | Unreliable retrospective archive | Gap/source-aware reconciliation; merge-aware Undo. M; compare export before/after repeated recovery and restore |
| F09 P1 | Successful mic recovery followed by corrupt system file: 1 successful STT call, 0 persisted recovered segments | Work lost on later-source error/crash | Persist each recovered chunk; isolate source errors, retain durable report. M; interruption after each chunk |
| F10 P1 | No API key -> Recorder Start blocked; Training voice answer lives in state until successful analysis | Core secondary modes depend on cloud availability | Independent local recorder lifecycle; durable lesson draft. M; no-key, offline, close/reopen |
| F11 P1 | Live context assembly always reads Opportunity store; tests touch sibling private path | Unneeded subsystems can block main task; test contamination risk | Retire Finder/mail/Monitor; isolate all test stores; precompile meeting brief. M; zero unwanted calls/files in core-mode tests |
| F12 P1 | Registry scan: 1 critical + 11 high dependency findings | Release gate fails; exploitability not established here | Remove retired dependencies, patch remaining reachable paths, rerun checks. M; clean audit and source/build regression |
| F13 P1 | Summary concatenates excluded segments; Training history lacks durable in-progress voice input | Review/lesson does not faithfully reflect user's editing and retention expectation | One exported/reviewed transcript view; persist requested summary and draft lesson. M; exclusion + close/reopen fixtures |
| F14 P2 | README defaults differ from backend; simple-mode plan claims active UI adoption; old broad roadmaps coexist | Setup and feature expectations diverge from executable product | Three-mode docs, effective model/build visible in settings, archive retired plans. S; clean-room walkthrough |

S = focused local change, M = multiple layers/regressions, L = audio/routing plus hardware validation. These are relative complexity, not delivery promises. F04 is reproduced for Stop/Reset; other context/language/session permutations remain required regressions. Additional executed UI defects, including clipped Lessons, are detailed in the UX report.

## Security and operational review

- Electron context isolation and disabled renderer Node integration are present. Secrets are backend-only and encrypted via safeStorage; receipt serializer is allowlisted. Existing privacy/governance tests pass.
- Local transcript/WAV files are plaintext, generally mode 0600 in recording paths; they are not encrypted archives. No automatic audio retention cleanup was found. Disk growth and retention need explicit settings, not silent deletion.
- OpenAI receives live audio even for manually marked ME; ME exclusion applies to assistant text analysis, not cloud STT. Backup recovery sends WAV chunks after explicit action. Summary/coaching sends the selected conversation/exercise text.
- This audit did not verify provider-side retention settings or credentials. No keys or real conversations were inspected. No external messages/events were created.
- Dependency advisories include dev-only `concurrently -> shell-quote` critical and runtime Crawlee/Google transitive paths. See [dependency evidence](evidence/dependency-audit.json). Counts are not an exploit demonstration. Removing mail/Finder reduces that surface but still needs verification.
- Initial test isolation and arbitrary link-to-context readiness are concrete operational issues. Broader Electron hardening is a follow-up review, not an asserted exploit.

## Smallest useful implementation batch

Repair the input/recording lifecycle, stale-result application and installed-build mismatch; expose a verified compact meeting brief to the existing answer-first view. Then remove unrelated modules from startup and the assistant path. Keep two actions during the call: Start/Stop and ME. Do not begin a new design system, vector service or agent framework.

Detailed ordered acceptance: [ROADMAP](ROADMAP.md). Measured vs unknown latency: [PERFORMANCE](PERFORMANCE.md). Reproducible scenarios: [TEST-SCENARIOS](TEST-SCENARIOS.md).

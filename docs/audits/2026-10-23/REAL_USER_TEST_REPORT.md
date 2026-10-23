# Real-user acceptance: 0.3.3

Historical acceptance log, not the current installed-build status. Current release
verification is in [v0.3.4](../../releases/v0.3.4.md); subsequent STT checks are in
[STT_LATENCY.md](STT_LATENCY.md). Older model/window/test counts below refer only
to their named candidates. The 12 advisories were resolved in the
[dependency maintenance pass](DEPENDENCY_SECURITY.md).

Full A-J professional-call acceptance: **NOT_READY**. Bounded update checks below
do not close the untested long-call, hardware and interruption scenarios.

## Compact candidate follow-up

### Streaming and low-height window follow-up

- Default window is now 640x320, minimum 400x260. Settings have five primary task sections and collapsed advanced tools. Headless screenshots cover settings at 400/640px and conversation at 400/520px; no horizontal overflow was observed.
- OpenAI brief responses emit parsed partial translation/answer text through a request-scoped preload subscription. The renderer rejects mismatched generation/stream IDs; Stop, Reset, new OTHER speech and context changes invalidate pending output. OpenAI calls receive cancellation; partial output is never stored as a completed assistant result.
- The incremental JSON parser is `partial-json`, not a regular-expression parser. Final response validation remains required. Partial text is provisional, not a validated final answer.
- 367/367 isolated automated tests passed; targeted lint and build passed. The compact UI regression exercised partial display, listener cleanup and ignored stale progress after Stop. This does not certify long-call latency.
- The real-audio driver now samples first translation, first answer fragment and final answer separately; a fragment must not be reported as a complete usable answer.
- First real streaming probe (`coqpi-acceptance-0hNMqN`) failed finalization: the SDK stream final response did not provide the `output_text` convenience property. The service now also reads typed `output[].content[].text` blocks. The failed candidate was not installed.
- Corrected real EN/FR probe `coqpi-acceptance-mFt8Qr`: ASAR `9b8ca7110941d0f35e2c95769d1e6f39642e385baa1be622aef0a61dd2b0e158`. English first translation 3,388 ms, first answer fragment 3,646 ms, final answer 4,428 ms after speech end (250 ms sampling). French final answer 11,825 ms: its finalized STT event arrived roughly nine seconds after speech ended. Provider durations were 2,126/2,018 ms. Streaming improves visibility but does not resolve STT tail latency; no stable end-to-end speed claim is made.
- Both real OTHER segments, separate audio backups and finalized suggestions survived Stop/reopen; Stop took 41 ms and no renderer errors occurred. Recording UI regression passed. A dedicated SDK SSE regression also passed. Full `pnpm check` passed code checks and 368 tests, then failed dependency audit on the existing 12 advisories (3 high, 6 moderate, 3 low).
- Installed the corrected `9b8ca711...` ASAR at `/Applications/CoqPi.app`; hash matches the tested candidate. Installed-binary preflight passed without renderer errors. User data remained untouched.

### Latency follow-up

The owner additionally prioritized end-to-end speed. Final accelerated candidate ASAR: `2d5cbedc312b3cc401d4b055d302aa59969b6226df82650ce4ae74ccf0d21aee`.
This pre-stream ASAR was installed at `/Applications/CoqPi.app`; its installed-app preflight passed without renderer errors or forced termination. User profile, keys and recordings were not replaced.

- Debounce reduced from 900 to 250 ms; cooldown and settling now overlap rather than add. Cooldown, rapid-follow-up guard and stale-response rejection remain enforced.
- OpenAI brief calls request only `meaningRu` and `answer`; validated output expands into the existing stored/UI contract. No model change: still gpt-4o-mini. No streaming implemented in this pass.
- Same EN -> FR input (`coqpi-acceptance-E6IuIs`): English 5,023 ms vs 7,055 ms before; French 3,378 ms vs 6,112 ms. Provider stage 2,037/1,524 ms vs 3,699/3,451 ms. First-answer sampling is 1 second; small samples are directional, not p95 guarantees.
- That French run lost words at STT, so it is not a clean quality pass. Repeat `coqpi-acceptance-T15sGy` recognized the complete French input and gave a usable response in 4,039 ms. Both sessions reopened with preserved segments. This does not eliminate occasional STT omissions or literal professional translations.
- 366/366 isolated tests passed; targeted lint, build, recording UI regression passed. No long-call, physical headset or live outage certification is added.
- Next performance work: incremental display with request-identity/Stop cancellation, phase timing, then measured model comparison. Do not sacrifice ME filtering, durability or context correctness for a lower timer value.

Initial compact build installed and launch-checked before the latency follow-up: ASAR `12cb8374093df39ffbe736497ae0535e2ada7b03cab14ae896b786208894e4fa`. Real EN -> FR rerun (`coqpi-acceptance-a341qC`) preserved the question conditions, returned no client-name placeholder, persisted two OTHER/system segments, reopened unchanged and stopped in 42 ms. FR answer arrived 6,112 ms after speech ended. Installed preflight returned no renderer errors. Previous bundle retained at `/private/tmp/CoqPi-before-compact-20261023.app`; user data untouched. This closes the compact-update smoke gate only. Professional terminology can still be translated too literally (Delivery Lead), and latency remains a priority.

The owner subsequently authorized finishing the compact candidate's audio smoke and installing it after successful checks. This is a bounded update gate, not completion of the full A-J acceptance matrix below.

- Candidate `31fa080d451a2edbd4c2757ae956154ab502f54101cb84f922222121d00fabff`: real no-key BlackHole recording, Stop in 28 ms, valid WAV, close/reopen preserved session (`coqpi-acceptance-rpDpat`).
- Real French dual-input run: system speech stored as OTHER, French answer and Russian meaning, microphone and system WAVs, Stop in 43 ms, close/reopen preserved segments (`coqpi-acceptance-ZovLrx`).
- Real EN -> FR switch in one session: both source=system/OTHER segments persisted, response language switched, Stop in 70 ms, close/reopen preserved both segments (`coqpi-acceptance-ksg0Qw`).
- Quality findings: meaning omitted important setup details; a French answer included a bracketed client-name placeholder. Backend instructions now require preserved conditions/numbers/deadlines and prohibit read-aloud placeholders. A captured-provider-prompt regression covers both requirements.
- Full isolated automated suite after the prompt change: 364/364 passed. Compact UI and recording reliability headless regressions passed. One sandbox-only localhost restriction was resolved by rerunning with localhost permission, not by changing application behavior.

No physical headphone acoustics, long-duration session, induced live network outage or real-audio crash recovery is certified by these short probes. The original A-J results below remain the baseline, not a claim that all scenarios have since passed.

## Tested identity and boundaries

- Actual installed `/Applications/CoqPi.app`, version 0.3.3.
- ASAR SHA-256: `8a7cf28e6c299288251783b6fbc8b01ba29978a439ebf50b3d1c8618e9c2c5c5`.
- Separate app user-data, profile, session and knowledge directories; no owner recordings or facts used.
- Microphone permission already granted. Actual BlackHole 2ch and built-in microphone are present.
- Default output is built-in speakers, not BlackHole; no connected headphone device was observed. No system routing defaults were changed.
- macOS `say -a 'BlackHole 2ch'` supplies real synthesized speech to a real virtual audio input. This is not a physical microphone/headphone test.
- Screenshots show the actual rendered application. No audio, IPC, WebRTC or provider replacements in the installed-app probe.
- User authorized up to USD 1 of OpenAI testing. Only one short cloud conversation turn was run in this baseline; no invoice-level spend measurement is available. No billing total is asserted.
- Encrypted credential was copied into the isolated test profile only and removed after the run. No plaintext credential is captured in evidence.
- No Mercor assessment was entered. All interview content was synthetic.

## Observed results

1. Real no-key recording: successful local capture through BlackHole. WAV has 1,310,720 PCM bytes, 44.1 kHz, 232,470 nonzero samples, RMS 0.1401. Stop became available for restart after 28 ms; stopped metadata and valid WAV header were saved. Reopen/recovery were not part of this probe.
2. Real English speech -> real STT -> real assistant -> visible answer -> Stop/archive: one successful turn. All 38 reference words recognized (normalized word error rate 0/38). This is not a general accuracy score.
3. Question-end to first visible usable answer: **7,061 ms**, sampled once per second. Median/p95/worst are all 7,061 ms with **n=1**; these are not reliable distribution estimates. Streaming first-token timing was not measured. First and final usable answer appeared in the same observation.
4. Stored assistant model was **gpt-4o-mini**, provider-call latency 3,375 ms. This differs from the simple-assistant default and must not be reported as a test of that other model.
5. Russian meaning appeared, but compressed the situation and omitted team size/deadline. Translation completeness and naturalness are not accepted from this one sample.
6. Agent B returned exactly the visible answer. It did not play a spoken response in this run; no bidirectional interview is certified.

Agent A and B used separate contexts with `fork_context=false`. Agent A held the future scripts privately. Agent B used the actual UI driver and only the resulting visible answer to formulate its response. The coordinator did not send scripted answers to B or CoqPi. This is a single-turn baseline, not the requested complete two-agent conversation.

## Scenario matrix

| ID | Result | Evidence / missing verification |
|---|---|---|
| A English interview | NOT_TESTED | One real input/output turn passed; spoken B reply, follow-ups and interruption not executed. |
| B French interview | NOT_TESTED | Private reference/audio prepared; no provider run yet. |
| C Mixed language | NOT_TESTED | Earlier mocked regressions are not real-audio acceptance. |
| D Headphone call | BLOCKED | No connected headphone route observed; virtual BlackHole capture alone does not establish an acoustic headphone call. |
| E ME/OTHER | NOT_TESTED | Dual-source mock regression passed; two independent live audio participants not yet tested. |
| F Stop/Reset pending | NOT_TESTED | Synthetic pending-response regression passed; not reproduced with a pending real provider request. |
| G Network interruption | NOT_TESTED | No live network fault injected. |
| H Crash/recovery | NOT_TESTED | Existing synthetic SIGKILL tests do not certify actual recorded speech recovery. |
| I No-key recorder | NOT_TESTED | Real capture/Stop/WAV subtest passed; reopen/recovery availability still to verify. |
| J Long conversation | NOT_TESTED | No long run performed. |

## Evidence and reproducibility

- Definitions: `scripts/acceptance/scenarios.json`.
- Driver: `scripts/acceptance/installed-app-probe.cjs`; default `preflight`, modes `offline` and `live`.
- Use an installed Playwright module via `COQPI_PLAYWRIGHT_MODULE`. Live additionally requires `COQPI_ACCEPTANCE_PAID=1` and a private Agent A reference path as the next argument. This flag is not authorization; operator must have the owner's explicit budget approval.
- Local evidence (ignored, not public): `tmp/real-user-acceptance/coqpi-acceptance-oNIz8c/` (no key) and `tmp/real-user-acceptance/coqpi-acceptance-eShKGy/` (English). Each has screenshots, result JSON and actual isolated recordings.
- Question reference/audio: ignored `tmp/real-user-acceptance/agent-a/`; not supplied to B.
- Initial harness attempts failed on hidden option/label selectors; these were harness errors, not application failures.
- An initial recording on the external workspace disk took materially longer to stop and the quit path hit its save timeout. The test was moved to internal temporary storage to match normal app placement. Slow-storage quit remains an open robustness concern, not silently counted as a pass.

## Owner-directed UI revision during acceptance

The owner rejected the visible Transcribe screen and clarified the product flow:
choose Conversation / Recorder / Learning, then choose headphones+mic or loudspeaker before a conversation. The active conversation must contain only small Russian meaning, large answer, Stop, and a manual ME control only for a single-source loudspeaker conversation.

Source changes implement that flow with a 520x420 default window (400x320 minimum). Finder/navigation/branding/timers are absent from the active conversation. Headphone mode uses the existing separate-input routing; Space cannot suppress analysis in that mode. Source and real-device recording semantics are not replaced by voice identification. Raw foreign text is no longer mislabeled as a Russian translation while a result is pending.

Synthetic compact UI checks and recording regression passed. They are explicitly separate from real-user acceptance. Full check: 364 tests passed, typecheck/lint/renderer build passed; dependency audit still reports 12 advisories (3 high). The installed app has not been replaced by these source changes.

Next acceptance work must target the tested compact candidate and rerun the remaining scenarios. Hardware action, only when needed: connect the actual headset and make its call output available to BlackHole. No owner interview test is recommended at this stage.

# CoqPi UX review: executed visual audit

Date: 2026-10-23. Source HEAD: `b194f11` (verified during execution).

## Decision summary

Preserve the current focused Live answer surface. It already displays a short answer prominently and the meaning below it, including at 720 x 480. Do not redesign the application around more dashboards.

The final owner scope is exactly three modes:

1. **Call**: priority EN/FR negotiation assistance. Hear OTHER; show one ready-to-read answer in the interlocutor's language, using confirmed owner and counterparty facts. General questions may use model knowledge or explicitly authorized web lookup when needed.
2. **Record**: record locally first; transcribe later; summarize only on request.
3. **Lessons**: daily EN/FR conversation and error coaching.

Remove Finder, outreach/mail/calendar, Monitor, and Cortex-facing navigation/features from the proposed product surface. Fold a small preparation step into Call rather than retaining separate Prepare and engineering-oriented Knowledge surfaces. Removal is a future implementation proposal, not an action taken here. Preserve existing records, profiles, transcripts, context, receipts, and exportability in a separately reviewed migration; do not delete stored data as part of simplifying navigation.

Highest-impact work: fix late-response invalidation; make Call preparation/readiness comprehensible; repair Lessons layout and its EN/FR defaults. Record-first is a separate behavioral change, not a relabeling of Transcribe.

## Execution and boundaries

- Actual React renderer served from the checkout by Vite, headless Playwright Chromium, fresh browser context for each run. No visible Electron launch or desktop interaction.
- Reused the event model, language cases, ME handling, and compact viewport approach from `scripts/verify-conversation-ui.cjs`. Replaced Electron IPC with an explicit mocked `window.coqpi` bridge. This is visual renderer execution, not full Electron/provider acceptance.
- Synthetic empty profile/session/settings and synthetic CV metadata only. Media acquisition, Web Audio, WebRTC, assistant responses, and persistence were mocked. The CV path was an invented fixture; no CV file was opened. No camera/microphone capture, paid API, external write, real user data, or actual web lookup.
- Browser network allowlist: only `http://127.0.0.1:5189`; external requests aborted. Successful runs recorded no blocked external requests and no page exceptions. Vite's local development websocket is not an external service.
- Viewports: all seven existing screens at 1100 x 700 and 720 x 480, plus focused English/French answer states at compact size. No horizontal document overflow in those snapshots. This does not imply all content is vertically reachable.
- Screenshots were actually opened and visually inspected, not merely generated. Local screenshots and adjacent JSON evidence are in `tmp/audit-2026-10-23/` (ignored, not committed).
- The visual subtask was delegated to Astra. Headless Chromium was the reproducible visual execution path. Lazyweb supplied permission/input/recording reference descriptions; they are comparative research, not proof of CoqPi usability.

Tool limitations: initial sandbox launch failed with loopback `listen EPERM 127.0.0.1:5189` and Chromium `bootstrap_check_in ... Permission denied (1100)`. A bundled node-repl attempt also failed to resolve `@rollup/rollup-darwin-arm64`. Approved command execution outside that sandbox successfully ran the headless harness. Every successful run closed Chromium and Vite in `finally`.

Initial Finder/history bridge methods were deliberately unsupported. Therefore `02-finder-*` loading states and the history error in `11-saved-conversation.png` are **not backend defects**. Finder was rerun with a valid empty store (`16-finder-empty-valid.png`). A transient missing `sendApprovals` field in an intermediate fixture was corrected; its page exception is excluded from product findings. Audit scripts were moved from `.tmp` to ignored `tmp` at the parent's request to avoid lint inclusion.

## Coverage against the three required modes

| Journey | Executed result | Not established |
| --- | --- | --- |
| First launch -> Start without key | Enabled Start; switches to Settings with error badge and missing-key fields | Human first-use success rate; macOS permissions |
| Call: English OTHER -> answer | Realtime completion event triggered a brief English request and visible large English fixture answer | Speech recognition, truth, model quality, actual latency |
| Call: ME then French OTHER | Space-marked ME did not add an assistant request; following French event produced French request/answer | Mixed audio attribution, accents, overlapping speakers |
| Call: stop/reset with pending answer | Old answer returned after conversation reset; reproduced below | Other concurrency permutations, reconnect/restart |
| Call preparation | Synthetic CV picker -> staged -> classified result displayed; company link staged; company/role saved through UI | Real parsing, retrieval relevance, end-to-end grounded answer, link fetching |
| Record | Transcribe controls inspected; no-key Start redirects to Settings; synthetic Live transcript displayed after Stop | Offline recording, actual WAV, later STT, durable disk/export/recovery |
| Lessons | Scenario/language changes, typed answer, mock review, feedback, error and retry, compact wheel/keyboard behavior | Pronunciation/coaching quality, voice/TTS, daily progression, real history persistence |
| Secondary screens | Prepare, Finder, Knowledge, Settings rendered and inspected; Defaults/Profile/Test/Monitor visited | Discovery, mail/calendar, Monitor, Cortex operations; unnecessary for final scope |

## Findings

### UX-01 / P0: a completed old request resurrects an answer after reset

Reproduction (`flows.cjs`): start synthetic Live; receive EN/FR answers; send another OTHER question with a deferred assistant promise; Stop; expand details; Reset conversation; collapse details; resolve the deferred promise.

Expected: reset invalidates old output. Actual: the cleared, stopped screen displays **Your answer** and `OLD SESSION ANSWER SHOULD NOT RETURN`. No stale warning appears. The new result is not just a hidden history item.

Evidence: [pending](../../../tmp/audit-2026-10-23/08-race-pending.png), [cleared](../../../tmp/audit-2026-10-23/09-race-reset.png), [late answer](evidence/10-race-late-result.png). Corresponding JSON records retain mock request inputs. In the retained screenshot, status at the top says stopped, but the large active answer reads OLD SESSION ANSWER SHOULD NOT RETURN.

Cause: `src/renderer/App.tsx:5437` awaits the request and `:5449` applies `setAssistantResult` without checking a request/session/context generation. The `:5451` session-ID guard protects transcript history, not the displayed answer. Reset clears freshness state, making the late response appear current.

Impact: a user can read an answer belonging to an abandoned negotiation/context. Proposed correction: invalidate requests on reset, session/context changes, and superseding utterances; apply only current-generation output, with optional cancellation. Complexity: medium. Verify with delayed promises across reset/new session/context/language changes and assert old text is never promoted to the active answer.

### UX-02 / P1: Lessons clips its answer and feedback at compact sizes

Reproduction: open Training at 720 x 480, submit a synthetic answer, then wheel down over the main content. Actual: the result remains below the viewport. Training bounds stayed `y=52, height=742.5` before and after a 650-pixel wheel action. Four Tabs from the textarea reach feedback, but scroll the clipped ancestor and remove the top navigation from view.

Evidence: [wheel has no effect](evidence/21-training-wheel-no-scroll.png), [keyboard shifts page](../../../tmp/audit-2026-10-23/22-training-keyboard-focus.png), [desktop controls](../../../tmp/audit-2026-10-23/02-training-1100.png). The retained compact screenshot cuts off immediately after Say this; the answer and feedback are below the inaccessible edge.

Cause: `src/renderer/TrainingPanel.tsx:204` uses `training-layout`, `panel`, and related classes without corresponding layout rules in the loaded CSS. `src/renderer/styles.css:40` and `:105` constrain the root/app shell to a hidden-overflow viewport. Native inline controls also concatenate Scenario/Working language/Your answer instead of forming clear fields.

Impact: the user cannot comfortably complete a daily lesson with the mouse. Proposed correction: use the existing scroll-section/form primitives, bounded flexible content, explicit label spacing, and compact headings. Keep navigation stable. Complexity: small. Verify wheel and keyboard access to answer, feedback, history, and navigation at 720 x 480 and 1100 x 700, including a long correction.

### UX-03 / P1: first launch claims readiness before required setup

Reproduction: fresh bridge with no API key -> Live -> Start. Actual: initial screen says `Ready when you are`; Start is enabled. Clicking it switches to Settings, with an `error` badge but without the explanatory message at the destination. Settings exposes `Stored`, `Env`, and `Effective` key statuses instead of the user's immediate task.

Evidence: [first launch](../../../tmp/audit-2026-10-23/01-first-launch.png), [after Start](../../../tmp/audit-2026-10-23/04-missing-key-start.png).

Cause: `src/renderer/App.tsx:5768` gates Start by connection state only. `:4645` stores the missing-key error and changes tabs, while `:11950` displays settings-specific errors/notices. Focused Live hides status/nav labels (`src/renderer/conversation.css:7`).

Proposed correction: keep the minimalist Call screen, but show a truthful one-line setup gate and one direct setup action before first use. Retain actionable error text when navigating. Configure audio and confirmed owner/target context in a compact pre-call area, collapsed during listening. Complexity: small/medium. Verify a fresh user can identify and resolve the missing prerequisite without docs and return to Call without losing preparation.

### UX-04 / P1: CV/target setup does not form one clear path to a grounded call

Executed path: find Knowledge icon -> Choose files -> staged notice saying contents were not read -> Capture & classify -> synthetic extracted facts -> separate Create pack draft / Context Packs workflow. Prepare additionally exposes outreach relationships, payload character counts, dropped packs, Cortex loading, and raw fields. At 720 x 480 no editable preparation field is in the initial viewport; at 1100 x 700 only the first fields appear near the bottom.

Staging a company link displays `pending` and offers only Remove, not Capture. The label promises a company/respondent source, but does not clearly say at entry that the URL will not be fetched. The fixture's repeated CV label on the link is a mock naming artifact, not a product finding.

Evidence: [compact Prepare](../../../tmp/audit-2026-10-23/03-prepare-720.png), [CV classified](../../../tmp/audit-2026-10-23/13-cv-classified.png), [target link pending](../../../tmp/audit-2026-10-23/14-target-link.png), [saved preparation](../../../tmp/audit-2026-10-23/15-prep-saved.png).

Code: `src/renderer/App.tsx:4215` stages selected files without reading; `:4342` captures explicitly; `:8427` starts the preparation surface; `:11230` limits capture to file kinds. `src/shared/knowledge-ingestion-quality.ts:127` describes non-file sources as pointer-only. This is an actual source capability boundary, not a reason to pretend a pasted LinkedIn/company URL was ingested.

Proposed correction for the final scope: replace these standalone product surfaces with one small Call preparation area: confirmed owner facts, selected counterpart, and ready/not-ready state. Hide implementation metadata; remove Finder/Cortex handoffs from the user journey. Reuse ingestion/selection validation internally. A dedicated local folder is an option, not a mandate or an already-supported ingestion shortcut: current folder pointers are not automatic scanning. A thin file/fact form can serve the same contract. Either must expose what facts are actually used, what failed, and how to refresh them. Explicit public-link fetching is separate from saving a reference, and needs its own authorization/feedback.

Complexity: medium for UI consolidation; link ingestion and backend context unification require separate scoped assessment. Verify one synthetic owner fact and one target fact reach an inspected outgoing request through the chosen route; a missing fact produces clarification, never an invented claim. Real answer grounding remains unverified in this visual pass.

### UX-05 / P1: Transcribe is not the requested record-first mode

Reproduction: fresh no-key state -> Transcribe -> Start. Actual: redirects to API-key Settings. There is no distinct record-only action on the inspected screen.

Evidence: [Transcribe](../../../tmp/audit-2026-10-23/03-transcribe-720.png), [Start requires key](../../../tmp/audit-2026-10-23/25-record-requires-key.png). Code: `src/renderer/App.tsx:4792` rejects missing key; `:4849` starts realtime transcription. The System backup path at `:1402` records the selected secondary stream; it does not replace the selected microphone sent into realtime STT at `:4711`.

Impact: the user cannot record first without configuring online transcription, and may mistake System backup for the live OTHER/STT source. Proposed correction: explicit local Record/Stop lifecycle independent of key/network; later Transcribe action; later Summarize action only on request. Name primary live input separately from backup routing. Complexity: medium/large; backend and interruption safety need dedicated verification. Verify no provider request during recording, durable audio after stop/restart, explicit later STT, and no summary before request. No actual microphone or disk-audio claim is made here.

### UX-06 / P2: selecting an English lesson leaves French active

Reproduction: initial French lesson -> choose `International / English job interview`. Actual: working language stays French and the question remains `Parlez-moi de votre parcours professionnel.` A separate language change is required.

Evidence: [English scenario/French language](../../../tmp/audit-2026-10-23/17-training-english-scenario.png). Cause: `src/renderer/TrainingPanel.tsx:23` defines defaults only for French cases, and `:225` updates language only when such a mapping exists; it does not update the question on scenario change.

Proposed correction: the simplified Lessons mode should expose a clear EN/FR choice with a matching initial question, removing unnecessary scenario taxonomy. Complexity: small. Verify switching both ways synchronizes question and request language without stale results.

### UX-07 / P2: untranslated speech is labeled as Russian meaning while waiting

Reproduction: delay the assistant response to an English OTHER question. Actual: original English text is displayed beneath `Meaning in Russian`. This makes a pending translation indistinguishable from an incorrect translation.

Evidence: [pending answer](../../../tmp/audit-2026-10-23/08-race-pending.png). Cause: `src/renderer/CallFocusPanel.tsx:59` labels by detected language but falls back to raw heard text while not fresh.

Proposed correction: use `Heard` until a translation exists, then `Meaning`; preserve the large-answer/smaller-meaning hierarchy. Complexity: small. Verify pending, stale, error, fresh EN, and fresh FR states have truthful labels. Do not add a permanently competing third large panel.

### UX-08 / P2: unreviewed lesson history is presented as negative feedback

After a mock review but before feedback, Recent practice displays `False`. Code creates entries with `feedback: null` (`src/renderer/TrainingPanel.tsx:122`) but renders every non-`true` value as `False` (`:330`); export similarly converts it to `BAD` (`:176`).

Evidence: [ungraded history reached by keyboard](../../../tmp/audit-2026-10-23/22-training-keyboard-focus.png). Proposed correction: preserve unreviewed/good/needs-practice as three states and use human labels. Complexity: small. Verify a fresh result is neither a failure nor a success until reviewed, including export.

## What to retain, remove, and simplify

Final clarification from the owner: remove Finder/mail/Calendar/CRM execution, not only their navigation. Opportunity discovery already works better elsewhere. CoqPi receives the exact CV or deck sent to this counterpart, vacancy/company links, plus a separate persistent profile derived from LinkedIn/Behance/personal website. Meeting-specific materials govern the presentation; the full master profile must not silently replace them.

Reference lookup: [Lazyweb input/readiness examples](https://www.lazyweb.com/agentic-search/f85ef03a-588d-45bd-bf7b-0331b7f2dc6f). A browser handoff was queued; authenticated reference rendering was not verified. Keep the audit findings grounded in the locally inspected CoqPi screenshots.

| Retain | Simplify or remove from product surface |
| --- | --- |
| Existing focused Live typography and short answer placement | Rename/group into three modes, not seven top-level tabs |
| Start/Stop, ME toggle and focused Space handling | Pre-call input/context/language settings collapse during listening |
| Explicit distinctions between source, transcript, suggestion, and action | Remove Finder, mail/calendar, Monitor, Cortex-facing operations from product navigation |
| Selected-source validation and truthful local persistence status | Replace Prepare/Knowledge engineering surfaces with minimal preparation within Call |
| Existing lesson request/result/feedback plumbing | EN/FR conversation coaching, clear correction, one next-turn action |

Current Live uses 30px answer text and 17px meaning at the tested 720px width (`conversation.css:31` and `:33`). Preserve this working hierarchy. Copy/details may remain secondary utilities; avoid more toolbar settings competing with Start/Stop/ME. Keep general knowledge answers possible without invented owner facts. Web lookup was not tested and must not be implied by a generic assistant answer or by a saved URL. Do not force a network search on every utterance; reserve it for explicit/current-information needs with visible provenance and a separately measured latency cost.

The successful mock EN and FR responses and ME exclusion show that the basic presentation loop is viable. The response delay is fixed by the harness (700 ms, or manually released); it is **not a measured model/audio performance baseline**. No median/p95/end-to-end claims can be made from these fixtures. Prioritize correct current-turn output before shaving render milliseconds. Provider streaming, transcript-finalization delay, buffering, and real-call latency belong to the parent's performance audit.

## Acceptance and smallest implementation batches

1. **Correctness first:** generation-bound answer application; pending-text label; tests proving reset/context/new-session races cannot display abandoned results. No UI redesign required.
2. **Three-mode surface:** Call/Record/Lessons only. Minimal preparation inside Call; remove secondary operational features from the product surface while preserving stored data and migration/export access. Returning prepared user reaches listening with one Start action; live primary actions are Start/Stop and ME.
3. **Lessons repair:** scrollable bounded layout, stable navigation, EN/FR defaults, explicit unreviewed feedback. All answer/feedback controls mouse- and keyboard-reachable at both tested viewports.
4. **Record-first behavior:** provider-free local capture, explicit later transcription and on-request summary. This needs separate implementation approval and real-device evidence, not cosmetic changes.
5. **Grounding and speed gate:** approved synthetic owner/target facts visible in the actual provider input, generic factual questions handled without fabricated biography, and an EN/FR audio baseline with sample counts before setting numerical latency goals.

## Reproduce and evidence

From repository root, with the existing dependencies and the audit harness present:

```sh
node tmp/audit-2026-10-23/run.cjs
node tmp/audit-2026-10-23/flows.cjs
node tmp/audit-2026-10-23/setup-training.cjs
node tmp/audit-2026-10-23/compact.cjs
node tmp/audit-2026-10-23/record.cjs
```

Run serially; each uses port 5189 with strict-port checking and closes its own browser/server. The harness references the installed bundled Playwright path. It throws on unsupported bridge methods instead of silently simulating success. Generated screenshot JSON includes visible text, viewport width, overflow checks, mock bridge call names, and assistant requests. Synthetic screenshot labels such as `Saved locally` or `Secure OpenAI API key saved locally` validate UI handling only, not actual disk encryption/persistence.

`pnpm check` is owned by the parent audit and is not claimed as passed by this visual subtask. No product files changed, no commits, no native app launch. Remaining untested: real audio/devices, permission dialogs, recognition/translation/coaching quality, actual CV/office-document parsing, provider/web requests, grounding correctness, export files, encrypted secrets, disk recovery/restart, microphone disconnection, sustained load, accessibility screen-reader operation, and full Electron integration.

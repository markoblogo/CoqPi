# CoqPi Architecture

## UX modes

- `Live Call`: default cockpit for active calls. It keeps only critical information visible by default.
- `Prepare`: session prep, selected-pack review, outreach-draft handoff, and payload inspection.
- `Finder`: local pipeline for candidate intake, preview, queue review, drafts, and session handoff.
- `Context`: local knowledge ingress, extraction preview, pack assembly, and lifecycle review.
- `Settings / Debug`: local configuration, secure key handling, and collapsed diagnostics.

## Main layers

- **Electron main process**: owns the desktop window, loads backend-only environment variables, registers IPC, and coordinates local services.
- **Preload / IPC bridge**: exposes a narrow `window.coqpi` API with safe renderer access to config, profile, settings, secrets, assistant analysis, and realtime SDP exchange.
- **React renderer**: renders the three UX modes, manages local transcript state, runs microphone selection and audio metering, and drives manual user actions.
- **Backend services**: hold config validation, profile file handling, assistant analysis, realtime backend exchange, secure secret storage, and user settings persistence.
- **Shared layer**: contains cross-process types plus transcript and cost estimation helpers.

## Privacy and secret model

- `.env` is loaded only in Electron main/backend.
- The renderer never receives the real OpenAI API key.
- Key resolution order is:
  1. secure stored key from Electron `safeStorage`
  2. `OPENAI_API_KEY` from `.env`
- Secure stored secrets are written under `app.getPath("userData")`.

## Current renderer-side data flow

### Audio diagnostics

`selected audio input -> MediaStream -> AudioContext / AnalyserNode -> local level meter UI`

### Mock transcript path

`mock lines -> transcript state -> 900 ms debounce -> assistant analysis -> cockpit panels`

### Realtime transcription path

`selected microphone -> RTCPeerConnection -> backend SDP exchange -> OpenAI Realtime events -> transcript state -> completed utterance -> local EN/FR auto-analysis guard -> 900 ms debounce -> assistant analysis -> cockpit panels`

### Assistant analysis path

`completed utterance or manual analysis click -> recent transcript selector -> optional profile and session context -> backend assistant service -> structured result -> cockpit panels`

Only one automatic analysis request may run at a time. Manual controls remain an override.

The local auto-analysis guard is deliberately cheap and does not add an LLM or provider round trip in the audio hot path. It allows explicit EN/FR transcript language, allows unknown-language Latin text in Auto mode, and blocks obvious non-EN/FR background speech, too-short transcript noise, and low-signal acknowledgement noise before the assistant provider is called.

Current boundary hardening also includes:

- rapid near-duplicate final utterance suppression;
- additional delay for fast consecutive eligible finals that likely belong to one thought;
- eligible transcript-window construction from filtered final utterances only.

The renderer exposes the same route state through a compact live test cockpit: realtime listening filter, ignored auto-analysis lines, eligible automatic transcript window size, selected pack context, and assistant freshness. It is diagnostic UI only and does not change provider routing.

## Cost guardrail layer

The cost guardrail layer is intentionally approximate and local-only.

- Automatic analysis after finalized utterances, plus manual override actions
- Analysis debounce and cooldown to prevent accidental repeated requests
- Session counters for:
  - realtime listening duration
  - assistant request count
  - keywords-only request count
  - transcript characters sent
  - profile context characters sent
  - session context characters sent
- Local warning thresholds
- Assistant cost mode selection:
  - `economy`
  - `balanced`
  - `quality`

Shared cost constants live in:

- [src/shared/cost-estimator.ts](/Users/antonbiletskiy-volokh/Downloads/Projects/CoqPi/src/shared/cost-estimator.ts)

## Local persistence

- **Profile context**: `data/profile/profile_context.md`
- **Current session context**: `data/sessions/current-session.json`
- **Session payload inspector**: shared Prepare/Live model that explains which selected packs and outreach draft will enter the assistant request, which selected items are dropped, and why. It uses compact labels, source IDs, and eligibility reasons only; raw source contents stay outside the inspector.
- **Live communication quality guard**: every assistant prompt with selected session packs now carries a compact target-specific guard. It tells the model to keep EN/FR answers short and spoken, use selected Finder/session context only when directly relevant, avoid broad owner-biography dumps and unselected counterpart context, and abstain with a clarifying question when selected evidence is weak or unrelated.
- **Shared-RAG ingress manifest**: `data/context-sources/manifest.json` (canonical),
  plus `coqpi-context-pack.manifest.md` and `coqpi-context-pack.history.jsonl` in the same directory for review and change audit.
- **Counterparty/context packs**: compact partner and role-specific records from Finder or manually curated intake are stored in the same local manifest under `manifest.counterpartyPacks` with explicit provenance, selection flag, retention, and a compact hash.
- **Finder outreach drafts**: local append-only Finder drafts can be attached to `current-session.json` by draft ID. Drafts support a local-only execution-prep status (`draft` or `ready_for_contact`) plus queue-lane actions such as copy, attach-to-session, and batch-ready marking. The assistant receives only the compact selected draft summary, never an outbound send action.
- **Finder -> session handoff**: queue decisions and outreach-draft status changes can immediately alter `selectedCounterpartyPackIds` and `selectedFinderOutreachDraftId`, so Prepare, Live, and the next assistant request stay aligned without reload/save workarounds. `import_now` still passes through a local admission check: weak, duplicate, not-ready, or not-recommended candidates are skipped from session handoff and reported in the session effect instead of silently entering the live assistant payload.
- **Finder runner**: `manual_mock` is the only runnable adapter in this phase. It creates deterministic local placeholder candidates from a selected job so the review/scoring/import path can be exercised without web search, scraping, external APIs, scheduling, or outreach.
- **Finder source adapter v1 + parser pack set v1**: CoqPi now has three bounded ingress modes for a selected Finder job. `owner_paste_v0` normalizes owner-pasted URLs, vacancy/export text, LinkedIn-style job snippets, accelerator/program snippets, investor/fund lists, partner exports, and CSV-like candidate exports into a no-write preview. `public_page_v1` fetches exactly one explicit public `http(s)` URL, extracts a compact title/description/heading/excerpt view, then routes that through the same deterministic preview/import flow. `manual_complex_page_v1` is the supervised escape hatch for difficult pages: the same public URL plus owner-reviewed notes/markdown are normalized locally into one reviewed preview, without browser automation. All three modes enrich compact local fields such as company/partner, role/opportunity, location, contact, deadline, relevance, stage/ticket/thesis, decision maker, current status, interview process, pilot budget, implementation timeline where available, and missing information. Each preview candidate is tagged with one parser pack from `job_page_v1 | investor_fund_v1 | accelerator_program_v1 | company_profile_v1` so downstream review/import/session logic can reason over a stable scenario label rather than raw source shape. For thin deterministic `public_page_v1` previews only, CoqPi may optionally ask a local Crawl4AI markdown adapter for one richer markdown pass and keep it only if the candidate quality actually improves; if the adapter is absent or fails, the deterministic preview remains the result. The owner can select and edit candidates before the reviewed draft is appended. No scheduler, batch crawl, browser automation, auth session, or outbound action is introduced in this phase.
- **Finder candidate scoring**: preview candidates get deterministic scenario-aware `fitScore`, `missingInfo`, and `nextAction` for `job`, `partner`, `investor`, `accelerator`, and `other`. The UI explains score strength, readiness reason, positive signals, and missing improvements before outreach or session handoff. Owner-provided review fields override generated defaults.
- **Knowledge source adapters**: context ingress distinguishes owner profile/CV files, counterparty material files, public profile links, company/respondent links, local folder pointers, and legacy source kinds. Only explicitly selected readable file adapters can be captured; links and folders remain provenance-only and are never fetched or scanned.
- **Knowledge extraction v1 + parser pack inference**: captured `.md`, `.txt`, `.json`, and `.csv` files still use the direct readable-text path, while explicit `pdf`, `docx`, `pptx`, `xlsx`, `xls`, and `html` files now go through a local `markitdown_v1` adapter before producing the same compact preview fields for manifest review: owner facts, role/respondent facts, links, dates, and missing fields. The same extraction now also infers a parser pack from the same bounded set `job_page_v1 | investor_fund_v1 | accelerator_program_v1 | company_profile_v1`, which keeps Knowledge-derived pack assembly aligned with Finder-derived pack assembly. Extraction does not call an LLM, fetch URLs, scan folders, or upload raw content.
- **Knowledge pack assembly/review/lifecycle**: reviewed extraction fields can populate an unselected local context pack draft. A review surface shows summary, context, links, weak fields, retrieval state, local lifecycle events, and filters for status, selected/unselected visibility, assistant-ready entries, weak fields, and stale events. Saved weak-free packs can be handed off into active session prep by setting retrieval selection and persisting the pack ID in `selectedCounterpartyPackIds`. `assembled`, `reviewed`, and `saved` entries are appended to the Personal Knowledge Core manifest without making raw source content assistant-visible.
- **Local memory core**: CoqPi now derives a compact memory layer from existing append-only ledgers instead of trusting transient UI state. The current pass builds typed `fact`, `interaction`, `summary`, and `relationship_state` records from selected readable sources, stored counterparty packs, knowledge-pack lifecycle events, and Finder outreach state. The assistant sees only the strict selected-pack / selected-draft subset of those records; dropped memory records are explained locally and remain available for future review/retrieval passes.
- **Structured relationship memory**: owner-confirmed session summaries now append to the Personal Knowledge Core as local records for a specific target/source ID. They are not transcripts and do not claim outbound actions; they capture confirmed outcomes, follow-ups, risks, and session labels. Local memory derivation merges the latest summary back into target relationship continuity so the next call can stay aligned with what was already discussed.
- **Knowledge retrieval quality**: assistant-side retrieval now ranks only inside the strict selected set and may combine compact evidence from selected packs, the selected Finder draft, owner-confirmed session summaries, and readable owner facts. If no strong selected-context match exists, the prompt carries an explicit abstain instruction instead of inventing continuity.
- **Knowledge ingestion quality**: shared readiness and extraction-preview helpers summarize pending/hash-only/retrieval-ready sources, pointer-only boundaries, missing fields, retention expiry, selected pack quality, and whether the current strict candidate set is clean enough for a future vector adapter.
- **Vector-ready retrieval v0**: `future_vector` is a contract guard over the existing scorer. It creates a metadata-only strict candidate set from selected, session-eligible counterparty packs and prevents captured sources or unselected packs from expanding a selected session context. No vector index, embedding model, external fetch, or raw-content handoff is introduced in this phase.
- **User settings**: JSON under `app.getPath("userData")`
- **Stored encrypted API key**: file under `app.getPath("userData")/secrets/`
- **Governance receipts**: `data/governance/receipts.jsonl`

Transcript persistence is still not enabled by default.

## Cortex Context Boundary

The `Context` screen is the owner-controlled ingress UI for a future shared Cortex/CoqPi RAG. It creates explicitly selected, CoqPi-only pending records with provenance, pending classification, retention/TTL, retrieval scope, and an explicit-audit promotion boundary. It does not scan, parse, upload, watch, fetch, retrieve, or expose any source.

An explicit file-only capture action may locally hash and classify supported plaintext sources for the `coqpi_interview_en_fr` retrieval scope. This retrieval runs only during assistant analysis, never in the realtime audio path.

Promotion to Cortex personal context, cross-tenant retrieval, public-surface exposure, and external actions are denied by default. A compact personal context pack remains a possible later scoped export, not the only ingress. See [docs/CORTEX_CONTEXT_CONTRACT.md](/Volumes/Work/Work/CoqPi/docs/CORTEX_CONTEXT_CONTRACT.md).

For synchronous handoff workflows, CoqPi can emit an immutable snapshot of this contract state with:
`pnpm dump-manifest -- --dump-manifest [--sign]`.
The snapshot uses only local manifest/history artifacts and can be signed for Cortex intake validation.

## Local Governance Receipts

CoqPi uses a narrow, ODS-inspired policy-and-receipt contract around external provider calls. It is not an agent runtime or a local AI appliance.

- `assistant_analysis` and the Realtime SDP request write an append-only preflight receipt before their external OpenAI call, then a completion receipt with measured provider latency.
- Receipt writes are best-effort: a local filesystem failure never blocks a known provider route or the live voice loop.
- Default mode is `shadow`: policy outcomes are recorded but do not change known provider routing. `COQPI_GOVERNANCE_MODE=enforce` blocks only future tool-route actions that are `deny` or `require_approval`.
- Receipts contain correlation ID, action kind/fingerprint, decision, short operational reason, provider/model, latency, and token count when the provider exposes it.
- `assistant_analysis` receives explicit routing metadata in receipts: `routeIndex`, `routeCount`, `routeLabel`, `providerTimeoutMs`, and `providerBudgetMs`.
- Receipt serialization is allowlisted. It excludes transcript text, profile/session context, PII, API keys, raw provider errors, prompts, and hidden reasoning.
- `local_stt_transcription` is explicitly outside the receipt path: no policy LLM, filesystem I/O, or extra round trip in the audio hot path.

There are no tool routes in the current product. The contract reserves `read_only -> allow`, `external_write -> require_approval`, and `system_write -> deny` for a future explicitly scoped feature.

## Packaging path

Local macOS packaging uses `electron-builder`.

- `productName`: `CoqPi`
- `appId`: `local.coqpi.app`
- output directory: `dist-packages/`
- unsigned local `.app` and `.dmg` only

`.env` files are excluded from packaged output.

## Future pipeline

The intended longer-term pipeline remains:

`audio input -> transcription -> transcript manager -> assistant analysis -> suggested answers`

### Provider direction

1. Keep OpenAI Realtime as the v1 transcription path.
2. ✅ Implemented: OpenAI primary text assistant analysis with configurable Ollama fallback. Failover is policy-gated by error class and provider count.
3. Add local STT as a later, separate provider layer. Candidate engines are Apple Speech for a low-friction macOS fallback, then Whisper-family engines for offline EN/FR. Evaluate latency on the target Mac before choosing a default model.

The governance layer deliberately remains local and file-based. ODS's full Docker stack, agent policy service, observability tools, RAG, and workflow runtime would add startup and maintenance cost without improving the live voice loop.

`altic-dev/FluidVoice` is a product and architecture reference for local-first transcription UX: provider selection, model management, privacy messaging, and low-latency live feedback. It is not a CoqPi dependency and its code, assets, and prompts must not be copied or imported: FluidVoice is GPL-3.0. Any future integration requires a separate license review.

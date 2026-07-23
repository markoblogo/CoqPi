# CoqPi Architecture

## UX modes

- `Live Call`: default cockpit for active calls. It keeps only critical information visible by default.
- `Prepare`: local rehearsal and transcript testing mode.
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

The local auto-analysis guard is deliberately cheap and does not add an LLM or provider round trip in the audio hot path. It allows explicit EN/FR transcript language, allows unknown-language Latin text in Auto mode, and blocks obvious non-EN/FR background speech or too-short transcript noise before the assistant provider is called. Automatic assistant requests also build their transcript window only from eligible utterances; manual actions remain the override path.

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
- **Shared-RAG ingress manifest**: `data/context-sources/manifest.json` (canonical),
  plus `coqpi-context-pack.manifest.md` and `coqpi-context-pack.history.jsonl` in the same directory for review and change audit.
- **Counterparty/context packs**: compact partner and role-specific records from Finder or manually curated intake are stored in the same local manifest under `manifest.counterpartyPacks` with explicit provenance, selection flag, retention, and a compact hash.
- **Finder outreach drafts**: local append-only Finder drafts can be attached to `current-session.json` by draft ID. The assistant receives only the compact selected draft summary, never an outbound send action.
- **Finder runner**: `manual_mock` is the only runnable adapter in this phase. It creates deterministic local placeholder candidates from a selected job so the review/scoring/import path can be exercised without web search, scraping, external APIs, scheduling, or outreach.
- **Finder source adapter v1**: `owner_paste_v0` normalizes owner-pasted URLs, vacancy/export text, LinkedIn-style job snippets, accelerator/program snippets, investor/fund lists, and CSV-like candidate exports for a selected job into a no-write preview. It extracts common local fields such as company/partner, role/opportunity, location, contact, deadline, relevance, and missing information. The owner can select and edit candidates before the reviewed draft is appended. URLs are stored as provenance links only; CoqPi does not fetch them in this phase.
- **Finder candidate scoring**: preview candidates get deterministic scenario-aware `fitScore`, `missingInfo`, and `nextAction` for `job`, `partner`, `investor`, `accelerator`, and `other`. The UI explains score strength, positive signals, and missing improvements. Owner-provided review fields override generated defaults.
- **Knowledge source adapters**: context ingress distinguishes owner profile/CV files, counterparty material files, public profile links, company/respondent links, local folder pointers, and legacy source kinds. Only explicitly selected readable file adapters can be captured; links and folders remain provenance-only and are never fetched or scanned.
- **Knowledge extraction v1**: captured `.md`, `.txt`, `.json`, and `.csv` files produce deterministic local compact fields for preview and manifest review: owner facts, role/respondent facts, links, dates, and missing fields. Extraction does not call an LLM, fetch URLs, scan folders, or upload raw content.
- **Knowledge pack assembly/review/lifecycle**: reviewed extraction fields can populate an unselected local context pack draft. A review surface shows summary, context, links, weak fields, retrieval state, local lifecycle events, and filters for status, selected/unselected visibility, assistant-ready entries, weak fields, and stale events. Saved weak-free packs can be handed off into active session prep by setting retrieval selection and persisting the pack ID in `selectedCounterpartyPackIds`. `assembled`, `reviewed`, and `saved` entries are appended to the Personal Knowledge Core manifest without making raw source content assistant-visible.
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

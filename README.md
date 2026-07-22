# CoqPi

<div align="center">
  <img
    src="assets/coqpi-logo-dark-bg-transparent.png"
    alt="CoqPi logo"
    width="260"
    style="display:block; margin-left:auto; margin-right:auto;"
  />
</div>

CoqPi is a private local desktop application for stressful interview and professional call situations in English and French. It runs as an Electron + React + TypeScript app, keeps API access in the Electron backend, and is designed to stay readable under pressure.

## Current scope

- Realtime transcription v0 over OpenAI Realtime
- Automatic assistant analysis after each completed utterance, with manual override
- Local auto-analysis guard for EN/FR live-loop input: explicit Russian/Cyrillic background speech and too-short noise are ignored before provider analysis and excluded from the automatic transcript window.
- Live test cockpit showing what is being listened to, what was ignored, what can be sent to assistant, active pack context, and answer freshness.
- Live smoke checklist in the Test panel for one-step-at-a-time manual readiness checks.
- Live smoke readiness pack summarizing setup, selected context, mock path, assistant freshness, and pending real mic smoke.
- Mock Transcript Mode for local UI testing, with job interview, investor call, partner call, French interview, and mixed EN/FR scenarios.
- Local profile and per-call session context
- Counterparty pack quality diagnostics showing strong/usable/weak/blocked context and concrete fixes before a call.
- Manual prep preview card summarizing company/role/goal, selected pack quality, assistant payload size, and weak fields.
- Assistant output quality fixtures for EN/FR interview-style prompts without using the microphone.
- Finder payload ingestion for counterparty packs (single + batch), with duplicate-safe import and preview error reporting
- Finder Search foundation: local search jobs, candidate results, statuses (`draft`, `ready`, `imported`, `rejected`), append-only backend history, and one-click candidate import into selected context packs.
- Finder Runner payload ingress: paste/mock JSON from a future search module, soft-accept valid candidate results, show item errors, and import candidates locally before turning them into context packs.
- Finder candidate review fields: `fitScore`, `whyRelevant`, `missingInfo`, and `nextAction` help filter candidates before outreach and are carried into the context pack on import.
- Audio input selection and local level meter
- Secure local API key storage via Electron `safeStorage` when available
- Cost guardrails and session counters
- Local append-only receipts for external provider decisions and latency

Additional session-aware behavior:

- EN/FR assistant retrieval can be restricted to selected counterparty pack kinds (`job`, `partner`, `investor`, `accelerator`, `other`) based on session context.
- Session prep now lets you pin specific counterparty/job/investor packs to the active call session (`selectedCounterpartyPackIds`) so assistant retrieval can target only those packs.
- Counterparty packs show the same session eligibility diagnostics used by the assistant route, so blocked context is visible before a call.
- Counterparty packs also show quality score and fix hints for summary/context/link completeness.
- Prepare view summarizes the current draft before saving, so missing fields and weak selected packs are visible before a call.
- Retrieval filtering has an explicit strict allowlist contract: when pack IDs are provided, only those packs are candidates.
- Selected pack IDs are revalidated in UI state, session save/load, and assistant analysis, so disabled, removed, duplicate, missing, or non-retrieval-ready packs are pruned before use.
- Assistant quality fixtures inspect the actual provider prompt and verify that selected packs are included while unselected packs stay out of the answer path.
- Batch finder import supports partial success (malformed entries are returned as errors without aborting valid ones).
- Finder search jobs/results are local-only source-truth records persisted under the Personal Knowledge Core `finder/` directory with append-only events, content hashes, provenance, and status history; this step does not scrape sites, call search APIs, or run scheduled outbound monitoring.
- Finder runner payload import is manual/mock only. CoqPi accepts JSON results but does not execute searches or browse the web from this path.
- Finder candidate review is evidence/curation metadata, not an automatic outreach decision; imported review context remains private and session-scoped through selected packs.

Prompt/skill improvement is governed by an optional local skill-quality pipeline in [`docs/SKILL_QUALITY_PIPELINE.md`](docs/SKILL_QUALITY_PIPELINE.md). It is for synthetic or explicitly recorded mock transcript evidence only: bounded candidate edits, held-out validation, rejected-edit memory, and owner acceptance before any `best_skill.md` export.

External AI-engineering examples are tracked in [`docs/AI_ENGINEERING_REFERENCE_INDEX.md`](docs/AI_ENGINEERING_REFERENCE_INDEX.md) as references only. They do not install code, change realtime behavior, add providers, or authorize use on live calls.

No phone system integration, voice output, system audio routing, vector DB, or new AI capabilities are implemented in this step.

## Local installation

1. Install [pnpm](https://pnpm.io/).
2. Run `pnpm install`.
3. Copy `.env.example` to `.env`.
4. Optionally set `OPENAI_API_KEY` in `.env` for development.

## Run in development

- `pnpm dev`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm format`

## API key setup

CoqPi resolves the OpenAI API key in this order:

1. Secure stored key saved from the app Settings screen
2. `OPENAI_API_KEY` from local `.env`

The renderer never receives the real key value. It can only read safe status booleans.

### In-app key setup

1. Open `Settings / Debug`.
2. Enter the key in `Save secure local key`.
3. Click `Save Stored Key`.

You can also delete the stored key from the same screen. If `safeStorage` is unavailable, CoqPi shows a clear local error and `.env` remains the fallback for development.

## Environment variables

```env
OPENAI_API_KEY=
OPENAI_ASSISTANT_MODEL=gpt-4o-mini
OPENAI_ASSISTANT_MODEL_ECONOMY=
OPENAI_ASSISTANT_MODEL_BALANCED=
OPENAI_ASSISTANT_MODEL_QUALITY=
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-realtime-whisper
OPENAI_REALTIME_TRANSCRIPTION_DELAY=low
OPENAI_SAFETY_IDENTIFIER=coqpi-local-user
COQPI_GOVERNANCE_DIR=./data/governance
COQPI_GOVERNANCE_MODE=shadow
COQPI_ASSISTANT_PROVIDER_PROFILE=openai:0,ollama:50
COQPI_ASSISTANT_FAILOVER_MODE=ordered
COQPI_PERSONAL_KNOWLEDGE_CORE_DIR=./data/context-sources
COQPI_CONTEXT_PACK_SIGNING_KEY=<shared-hmac-key>  # optional, for signed snapshot export
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_ASSISTANT_MODEL=llama3.1
COQPI_ASSISTANT_PROVIDER_TIMEOUT_MS=10000
COQPI_ASSISTANT_REQUEST_BUDGET_MS=25000
```

`COQPI_ASSISTANT_PROVIDER_PROFILE` defines the local provider order (priority numbers) for assistant analysis. CoqPi now tries providers in this order for text analysis and falls back when a provider fails (OpenAI → Ollama by default).

Retry behavior for provider fallback:

- Retry happens only for operational/provider transport errors (network/API errors, temporary failures).
- Non-retryable cases: non-retryable provider failures (for example explicit config/authorization failures, schema/contract errors, and non-operational provider errors), plus malformed model responses.
- Timeout and budget behavior:
  - `COQPI_ASSISTANT_PROVIDER_TIMEOUT_MS` caps a single provider attempt.
  - `COQPI_ASSISTANT_REQUEST_BUDGET_MS` caps total analysis routing time across all attempts.
- When route metadata is available, receipts include `routeIndex`, `routeCount`, `routeLabel`, and attempt budget/timeout values.
- Fallback is attempted only when more than one enabled provider is configured. If there is only one provider (for example `COQPI_ASSISTANT_FAILOVER_MODE=none`), there is no second attempt.

- `OPENAI_ASSISTANT_MODEL` remains the fallback assistant model.
- Cost mode overrides can be set with:
  - `OPENAI_ASSISTANT_MODEL_ECONOMY`
  - `OPENAI_ASSISTANT_MODEL_BALANCED`
  - `OPENAI_ASSISTANT_MODEL_QUALITY`

`.env` is local-only and must never be committed.

## Local Governance

External assistant and realtime-provider calls create local JSONL receipts in `data/governance/receipts.jsonl`. They contain only safe operational metadata: correlation ID, action fingerprint, decision, latency, provider/model, and tokens when returned by the provider. Transcripts, context, secrets, prompts, raw errors, and hidden reasoning are excluded.

Receipt writes are best-effort so a local disk failure cannot interrupt a live call.

`shadow` is the default and preserves existing routes. `enforce` is reserved for future tool routes; it can block system writes or require approval for external writes. Local STT/audio has no governance I/O or policy round trip.

## UX modes

- `Live Call`: primary cockpit with realtime health, transcript, Russian meaning, suggested answers, and keywords.
- `Prepare`: mock transcript controls, manual analysis actions, cost counters, and collapsible profile context.
- `Settings / Debug`: secure API key handling, defaults, audio advanced controls, realtime diagnostics, and privacy info.
- Live diagnostics in the `Assist` path now show concise status reasons for timeout/budget/manual errors and direct next-action hints, with a one-click `Reset conversation` action available from the transcript card.
- The `Live` screen includes a compact test cockpit for smoke testing: listening filter, ignored transcript count, automatic transcript window, selected pack context, and fresh/stale assistant state.

## Mock Transcript Mode

Mock mode is for UI testing only.

- It does not use the microphone.
- It does not send audio.
- It follows the same transcript-to-analysis path as a live completed utterance. Analysis therefore calls the configured assistant provider when auto-analysis or a manual action is enabled.
- The scenario selector covers default EN/FR, job interview, investor call, partner call, French interview, and mixed EN/FR prompts.
- The live smoke readiness pack gives one compact status before a call: setup, selected context, mock transcript path, assistant freshness, and real mic readiness.
- The minimal real-test script stays at 5 actions: prep ready, mock probe, assistant probe, mic probe, final check.
- `Reset for test` clears transcript, assistant result/errors, mock playback, checklist marks, cost notice, counters, and realtime timer while preserving profile, session context, selected packs, key, and audio device.
- `Save smoke note` records what worked, what broke, and the next fix to a local `smoke-notes.jsonl` file under the sessions directory; it does not store transcript text.
- The post-smoke fix queue derives the next local fixes from saved smoke notes, deduplicates repeated `Next fix` items, and keeps the first pending fix visible without creating an external tracker.
- `Copy report` turns the latest smoke note and first queued fix into a short markdown summary for pasting into Codex; it does not include transcript text.
- The live smoke checklist keeps local Done/Blocker marks and shows the next active step from current app readiness.

Use it from the `Prepare` tab to populate transcript state and test manual assistant actions safely.

Minimal real-test script when ready:

1. Prep ready — Test panel says ready for mock assistant smoke; otherwise fix Setup or Context gate.
2. Mock probe — enable Mock Transcript Mode and add one EN/FR line; transcript should get a final other-speaker line.
3. Assistant probe — run Analyze 2m or wait for auto-analysis; Assist/Answers should show a fresh answer using the selected pack.
4. Mic probe — start realtime and say one short EN/FR sentence; realtime should listen and transcript should update.
5. Final check — stop realtime and check the latest assistant answer; it should be fresh, short, and tied to the selected pack.

### Test commands

- `pnpm test:governance` — governance + context pack + failover policy tests (includes assistant retry-policy checks).
- `pnpm test:session-pack-selection` — selected counterparty pack cleanup and auto-add rules.
- `pnpm test:live-loop-ui` and `pnpm test:analyze-recent-transcript` — live-loop selected-pack scheduling and assistant routing regressions.
- `pnpm test:pre-smoke` — one-command non-microphone pre-smoke set: mock scenarios, selected packs, live-loop UI, and assistant routing.

### Verified local flow

On 2026-07-20, the local flow was manually verified with a selected plaintext CV source:

1. The source was explicitly captured and classified as private for `coqpi_interview_en_fr`.
2. Mock English interview questions followed the normal transcript-to-analysis path.
3. The assistant used the scoped CV evidence in its English response suggestions.

This does not validate unsupported document formats, links, folders, or live-call transcript accuracy.

## Profile context

The profile context lives in:

- [data/profile/profile_context.md](/Users/antonbiletskiy-volokh/Downloads/Projects/CoqPi/data/profile/profile_context.md)

Edit that file manually in your editor, then use `Reload Profile` inside the app. The profile text can optionally be included in assistant requests, and the current setting is controlled from `Settings / Debug`.

Context source governance is also available in the local Personal Knowledge Core folder:

- `data/context-sources/manifest.json`
- `data/context-sources/coqpi-context-pack.manifest.md`
- `data/context-sources/coqpi-context-pack.history.jsonl`

### Handoff snapshot to Cortex (no UI required)

- `pnpm dump-manifest -- --dump-manifest`
- `pnpm dump-manifest -- --dump-manifest --manifest-dir ./data/context-sources --output ./handoff.snapshot.json`
- `COQPI_CONTEXT_PACK_SIGNING_KEY=... pnpm dump-manifest -- --dump-manifest --sign`
- `pnpm dump-manifest -- --validate --manifest-dir ./data/context-sources`  
  (fails on invalid `manifest.json` / chain mismatch)
- `pnpm dump-manifest -- --handoff`  
  (runs validate + writes `handoff.validation.json`, then writes `handoff.snapshot.json`; aborts snapshot on validation fail)
- `pnpm dump-manifest -- --handoff --validate-output ./handoff.validation.json --snapshot-output ./handoff.snapshot.json`  
  (explicit output paths)

Shortcuts:

- `pnpm handoff`
- `pnpm handoff:signed`
- `pnpm handoff:with-dates`
- `pnpm handoff:with-dates:signed`
- `pnpm handoff:with-dates:reject-partial`

Snapshot output includes:

- canonical `manifest.json` state,
- optional `history` entries,
- `manifestHash` for integrity,
- optional HMAC `signature` if `--sign` is set.

## Realtime smoke test

Manual realtime verification steps are documented in:

- [docs/REALTIME_SMOKE_TEST.md](/Users/antonbiletskiy-volokh/Downloads/Projects/CoqPi/docs/REALTIME_SMOKE_TEST.md)

## Local macOS packaging

Build unsigned local artifacts with:

- `pnpm pack:mac`
- `pnpm dist:mac`

Output goes to:

- `dist-packages/`

Notes:

- Packaging excludes `.env` files.
- No code signing or notarization is configured.
- No GitHub release flow is configured.
- On macOS, an unsigned app may require right-click -> `Open`.

## Project structure

```text
src/
  main/       Electron main process and preload
  renderer/   React UI, tabs, realtime client, audio UI
  backend/    Local backend services
  shared/     Shared types and cost/transcript helpers
data/
  profile/    Local profile context markdown
  sessions/   Future local session artifacts
  context-sources/
             Ingress manifest + markdown + local change history
  governance/ Append-only safe provider receipts
docs/
  ARCHITECTURE.md
  REALTIME_SMOKE_TEST.md
  UX_PRINCIPLES.md
```

## Next planned steps

1. Test the live loop with a microphone and real calls; tune turn segmentation and transcript quality. The app now locally ignores obvious non-EN/FR background speech before auto-analysis, but real noisy-call tuning still needs manual smoke testing.
2. ✅ Added OpenAI-to-Ollama runtime fallback for text assistant analysis with governance and retry-policy checks; next iteration will refine model-specific routing policies.
3. ✅ Added batch-friendly finder/context integration: single and batch counterparty pack ingest, preview/import UX, and retrieval-kind gating for interview/founder modes.
4. ✅ Added Finder Search foundation: local search job/result contracts, backend source-truth storage, and UI, with candidate import into selected context packs.
5. ✅ Added Finder Runner contract: manual/mock runner JSON can create local search jobs/results without outbound monitoring.
6. ✅ Added Finder candidate review/scoring: fit score, relevance reason, missing info, and next action are stored and carried into imported packs.
7. ✅ Pass 7/8 completion: finder batch import now flows through session context into selected pack IDs used by `analyzeRecentTranscript`/retrieval.
8. ✅ Pass 9 hardening: timeout/budget/retry UX now has cooldown-aware hints and dedicated regression checks.
9. ✅ Pass 10 hardening: provider retryability is policy-driven (`isRetryableProviderError`), non-retryable errors are surfaced as `provider_not_retryable`, and UI distinguishes retry-blocked state.
10. ✅ Pass 11 communication slice: assistant status now includes explicit blocked/recovery diagnostics and manual-recovery checks for retry-blocked flow.
11. ✅ Selected pack source-of-truth pass: counterparty packs are versioned/redacted at storage, selected pack IDs are cleaned through UI/session/analyze paths, and stale packs are blocked before assistant retrieval.
12. Research local STT behind a provider interface, without changing the proven OpenAI Realtime path yet.
13. Add training mode using the same profile, session-context, and assistant-provider layers.

The local STT reference and licensing boundary are recorded in [docs/ARCHITECTURE.md](/Volumes/Work/Work/CoqPi/docs/ARCHITECTURE.md).

## Agent operations

Named agents, long-running work, memory scopes, and provider capability claims follow the local [Agent Operations Contract](docs/AGENT_OPERATIONS_CONTRACT.md). It is descriptive and fail-closed: schedules and provider configuration never grant external-action authority.

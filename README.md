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
- Mock Transcript Mode for local UI testing
- Local profile and per-call session context
- Finder payload ingestion for counterparty packs (single + batch), with duplicate-safe import and preview error reporting
- Audio input selection and local level meter
- Secure local API key storage via Electron `safeStorage` when available
- Cost guardrails and session counters
- Local append-only receipts for external provider decisions and latency

Additional session-aware behavior:

- EN/FR assistant retrieval can be restricted to selected counterparty pack kinds (`job`, `partner`, `investor`, `accelerator`, `other`) based on session context.
- Session prep now lets you pin specific counterparty/job/investor packs to the active call session (`selectedCounterpartyPackIds`) so assistant retrieval can target only those packs.
- Batch finder import supports partial success (malformed entries are returned as errors without aborting valid ones).

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
- Non-retryable cases: JSON schema/contract errors and explicit config/authorization failures (for example `OPENAI_API_KEY` missing, invalid structured response).
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

## Mock Transcript Mode

Mock mode is for UI testing only.

- It does not use the microphone.
- It does not send audio.
- It follows the same transcript-to-analysis path as a live completed utterance. Analysis therefore calls the configured assistant provider when auto-analysis or a manual action is enabled.

Use it from the `Prepare` tab to populate transcript state and test manual assistant actions safely.

### Test commands

- `pnpm test:governance` — governance + context pack + failover policy tests (includes assistant retry-policy checks).

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

1. Test the live loop with a microphone and real calls; tune turn segmentation and transcript quality.
2. ✅ Added OpenAI-to-Ollama runtime fallback for text assistant analysis with governance and retry-policy checks; next iteration will refine model-specific routing policies.
3. ✅ Added batch-friendly finder/context integration: single and batch counterparty pack ingest, preview/import UX, and retrieval-kind gating for interview/founder modes.
4. Research local STT behind a provider interface, without changing the proven OpenAI Realtime path yet.
5. Add training mode using the same profile, session-context, and assistant-provider layers.

The local STT reference and licensing boundary are recorded in [docs/ARCHITECTURE.md](/Volumes/Work/Work/CoqPi/docs/ARCHITECTURE.md).

## Agent operations

Named agents, long-running work, memory scopes, and provider capability claims follow the local [Agent Operations Contract](docs/AGENT_OPERATIONS_CONTRACT.md). It is descriptive and fail-closed: schedules and provider configuration never grant external-action authority.

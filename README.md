# CoqPi

<div align="center">
  <img
    src="assets/coqpi-logo-dark-bg-transparent.png"
    alt="CoqPi logo"
    width="260"
  />
</div>

CoqPi is a local Electron app for two connected jobs:

1. help during real English/French calls with fast Russian support;
2. prepare and route the right counterparty context into that call;
3. accumulate private owner/context knowledge without sending raw source material into the assistant path.

OpenAI Realtime is the primary live transcription path. OpenAI text analysis is primary for assistant replies. Ollama is available only as controlled text fallback.

## Current product status

### 1) Communicator: live assistant / translator

Status: MVP is real and fairly stable.

What works now:
- mic input -> realtime transcript -> assistant answer loop;
- EN/FR -> RU meaning, detected question, short answer options in EN/FR, answer meaning, keywords;
- auto-analysis after final `other` utterances with manual override;
- stale/retry/timeout/budget diagnostics;
- selected pack + selected outreach draft flow into assistant payload;
- live cockpit shows what is listened to, what is ignored, what was sent, and what context actually went into the last analyze;
- real-smoke execution diagnostics now show:
  - first failed stage,
  - compact realtime/transcript trace,
  - one-click capture into a local smoke note.

Still not done:
- real-call quality tuning under noisy live conditions is not finished;
- no system-audio capture;
- no offline/local realtime STT.

### 2) Finder: jobs / investors / accelerators / partners

Status: strong local foundation, but not autonomous search yet.

What works now:
- local Finder jobs and candidate pipeline;
- manual/mock runner contract;
- source adapter preview for pasted URL/text/export inputs;
- deterministic parsers for vacancy/job, accelerator, investor/fund, partner, CSV-like inputs;
- quality tiering before import: `ready / usable / weak`;
- queue review, hold/reject/import decisions;
- outreach prep and local outreach drafts;
- draft -> session handoff.

Still not done:
- no live web search engine, scraper, scheduler, or outbound sender;
- no automatic outreach.

### 3) Knowledge / RAG-like layer

Status: practical selected-context layer exists; heavy RAG stack does not.

What works now:
- local profile context;
- local context sources with provenance, hash, classification, retention;
- extraction preview from explicitly selected readable files;
- reviewed pack assembly and lifecycle states;
- selected-pack retrieval boundary;
- strict payload audit for what is included vs dropped;
- vector-ready contract exists, but retrieval still runs inside a strict selected candidate set without a vector DB.

Still not done:
- no full vector retrieval infrastructure;
- no broad automatic ingestion from links/folders/web.

## Architecture

```mermaid
flowchart LR
  U["User"]
  UI["Prepare / Live / Finder / Settings"]
  IPC["Electron main + IPC"]
  RT["OpenAI Realtime transcription"]
  AS["Assistant analysis"]
  OL["Ollama text fallback"]
  PK["Personal Knowledge Core"]
  FD["Finder jobs / drafts / queue"]
  GOV["Local governance receipts"]

  U --> UI
  UI --> IPC
  IPC --> RT
  IPC --> AS
  AS -. "operational fallback only" .-> OL
  PK --> IPC
  FD --> IPC
  IPC --> GOV
  PK -. "selected context only" .-> AS
  FD -. "selected draft only" .-> AS
```

## Safety boundaries

- raw files are not pushed directly into assistant requests;
- assistant retrieval is limited to selected eligible packs;
- governance receipts store only operational metadata;
- smoke notes do not store transcript text;
- Finder/outreach remains local-only and does not send anything externally.

## Local setup

1. Install `pnpm`.
2. Run `pnpm install`.
3. If `pnpm` asks for ignored builds, run:
   - `pnpm approve-builds`
4. Copy `.env.example` to `.env`.
5. Set `OPENAI_API_KEY`.

Useful env vars:

```env
OPENAI_API_KEY=
OPENAI_ASSISTANT_MODEL=gpt-4o-mini
OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-realtime-whisper
OPENAI_REALTIME_TRANSCRIPTION_DELAY=low
COQPI_ASSISTANT_PROVIDER_PROFILE=openai:0,ollama:50
COQPI_ASSISTANT_FAILOVER_MODE=ordered
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_ASSISTANT_MODEL=llama3.1
COQPI_PERSONAL_KNOWLEDGE_CORE_DIR=./data/context-sources
COQPI_GOVERNANCE_DIR=./data/governance
```

## Run

- `pnpm dev`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

## Recommended test commands

- `pnpm test:live-loop-ui`
- `pnpm test:analyze-recent-transcript`
- `pnpm test:assistant-output-quality`
- `pnpm test:finder-ui-state`
- `pnpm test:finder-prepare-live-ui`
- `pnpm test:governance`
- `pnpm test:pre-smoke`

There is a `test:manual-prep-preview` script in `package.json`, but there is no separate product surface named `pnpm test:manual-prep-preview`; treat it as a focused contract test, not a standalone workflow.

## Real smoke path

Use the `Test` tab.

The current recommended order:

1. Confirm the readiness card is at least ready for mock.
2. Run one mock EN/FR utterance and confirm a fresh assistant answer.
3. Check the execution diagnostics card:
   - first failure, if any;
   - latest realtime/event trace;
   - `Capture current state` if you want to save the current failure into the smoke note draft.
4. Start a short realtime probe with one clear EN or FR sentence.
5. Save a smoke note only after the probe, not before.

Detailed version: [docs/REALTIME_SMOKE_TEST.md](docs/REALTIME_SMOKE_TEST.md)

## Important local docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/REALTIME_SMOKE_TEST.md](docs/REALTIME_SMOKE_TEST.md)
- [docs/CORTEX_CONTEXT_CONTRACT.md](docs/CORTEX_CONTEXT_CONTRACT.md)
- [docs/SELECTED_CONTEXT_TIERS_CONTRACT.md](docs/SELECTED_CONTEXT_TIERS_CONTRACT.md)
- [docs/SESSION_MEMORY_BOUNDARY.md](docs/SESSION_MEMORY_BOUNDARY.md)
- [docs/CONTINUOUS_REVIEW_BOUNDARY.md](docs/CONTINUOUS_REVIEW_BOUNDARY.md)

`docs/CONTINUOUS_REVIEW_BOUNDARY.md` also defines the optional local
`Open Code Review` (`ocr`) pass used as a second reviewer on diffs before
push/PR. It is advisory only and does not replace smoke/governance checks.

## Not in scope yet

- outbound email or message sending;
- autonomous Finder crawling/searching at scale;
- training mode;
- full local/offline voice stack;
- broad RAG appliance or separate vector infrastructure.

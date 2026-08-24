# CoqPi Simple Assistant Migration Plan

Date: 2026-08-24
Current baseline commit: `8ffa6e5`
Scope: audit first, low-risk migration second

Implementation status: phase-1 parallel path started. The repository now contains
the simple markdown loader, seven scenario presets, simple model routing, a
training UI, and a local training journal. Legacy live analysis remains the
default until training feedback validates the switch.

## Goal

Shift CoqPi from the current mixed live-assistant + Finder + knowledge-pack architecture toward a much simpler low-latency assistant for short EN/FR answers:

- freeze vector-style / selected-pack RAG evolution for phase 1;
- use one shared markdown user profile plus scenario-specific markdown context;
- switch assistant analysis to a faster current OpenAI text model;
- add a training interface with:
  - one short suggested answer,
  - true/false feedback,
  - saved transcript/session for later review;
- then reduce the real-call UI to the smallest useful surface;
- preserve working speech-to-text, transcript handling, and meeting transcription unless they directly hurt latency.

This document is intentionally migration-first, not rewrite-first.

## Audit Summary

### What already matches the target direction

- Live speech-to-text is already separate from assistant text analysis.
  - `src/backend/services/realtime-transcription-service.ts`
- The app already has a local markdown profile file.
  - `data/profile/profile_context.md`
  - `src/backend/services/profile-service.ts`
- Session state is already local JSON and small enough to keep.
  - `data/sessions/current-session.json`
  - `src/backend/services/session-context-service.ts`
- Meeting transcription already has local autosave/export and is isolated from assistant calls.
  - `src/backend/services/meeting-transcription-service.ts`
- Assistant analysis already uses structured JSON output and a short answer schema.
  - `src/backend/services/assistant-service.ts`
  - `src/backend/prompts/interview-assistant-prompt.ts`
- Transcript preprocessing and auto-analysis guards already exist and should be kept.
  - `src/shared/transcript-processing.ts`
  - `src/shared/live-loop.ts`

### What currently increases latency and complexity

- One assistant request currently pulls from too many optional context systems:
  - markdown profile,
  - session context,
  - opportunity handoff,
  - selected outreach draft,
  - pre-call preparation packet,
  - selected target guidance,
  - personal retrieval from context sources,
  - local memory-core retrieval,
  - knowledge-to-target brief.
- This assembly happens inside `buildUserPrompt()` in:
  - `src/backend/services/assistant-service.ts`
- Retrieval/context contracts are split across several parallel abstractions:
  - context sources / capture,
  - counterparty packs,
  - selected pack retrieval,
  - local memory core,
  - Finder session handoff,
  - opportunity-to-call handoff,
  - ABVX preparation context.
- The renderer is carrying too many product surfaces for the new target:
  - Live,
  - Prepare,
  - Finder,
  - Context,
  - Transcribe,
  - Settings,
  - plus diagnostics and review sub-panels,
  all inside one very large `src/renderer/App.tsx`.

### Current model and provider routing

- Assistant text defaults to `gpt-4o-mini`.
  - `src/backend/prompts/interview-assistant-prompt.ts`
  - `src/backend/services/assistant-provider-profile.ts`
- Realtime transcription defaults to `gpt-4o-transcribe`.
  - `src/backend/services/realtime-transcription-service.ts`
- Assistant provider routing supports OpenAI first, optional Ollama fallback.
  - `src/backend/services/assistant-provider-profile.ts`
- For the new phase-1 target, Ollama fallback is extra complexity unless there is a proven latency or offline requirement.

### Current storage map

- User profile markdown:
  - `data/profile/profile_context.md`
- Session JSON:
  - `data/sessions/current-session.json`
- Meeting transcription autosave:
  - `data/sessions/meeting-transcription-current.json`
- Knowledge/context manifest and event log:
  - `data/context-sources/*`
- Governance receipts:
  - `data/governance/receipts.jsonl`

The simplest target architecture should keep the first three and stop depending on the knowledge/context manifest for the primary live assistant path.

## Target Phase-1 Architecture

### Core idea

The assistant should answer from:

1. transcript window;
2. one shared user profile markdown file;
3. one selected scenario markdown file;
4. one small live session note block;
5. optional saved prior training/session transcript summary for the same scenario.

No selected-pack retrieval, no vector-ready contract, no Finder-derived guidance, no ABVX preparation fetch in the hot path.

### Phase-1 modules to keep

- `realtime-transcription-service.ts`
- `meeting-transcription-service.ts`
- `session-context-service.ts`
- `profile-service.ts`
- `transcript-processing.ts`
- `live-loop.ts`
- secret storage and basic settings

### Phase-1 modules to remove from the hot path

- `context-source-service.ts` retrieval path
- `local-memory-core-service.ts` assistant retrieval path
- Finder draft/session handoff inside assistant prompt assembly
- opportunity-to-call handoff inside assistant prompt assembly
- ABVX preparation context for primary live/training loop

These can remain in the repo temporarily, but the new simple assistant mode should not depend on them.

## Proposed Markdown Context Layout

Add a simple scenario-based context directory:

- `data/simple-assistant/profile.md`
- `data/simple-assistant/scenarios/free-mode.md`
- `data/simple-assistant/scenarios/france-job-interview.md`
- `data/simple-assistant/scenarios/international-job-interview.md`
- `data/simple-assistant/scenarios/ai-product-role.md`
- `data/simple-assistant/scenarios/agro-business.md`
- `data/simple-assistant/scenarios/client-consulting.md`
- `data/simple-assistant/scenarios/networking.md`

Suggested scenario file shape:

```md
# Scenario

## Purpose

## What I usually want to say

## What to avoid

## Typical questions

## Short answer style

## Vocabulary
```

The phase-1 assistant should read exactly one scenario file at a time.

## Target UX Simplification

### Training mode

Primary new mode for iteration and latency tuning.

Input:

- short mock or real transcript line;
- selected scenario;
- optional short session note.

Output:

- one short answer only;
- optional short Russian meaning;
- true/false feedback buttons;
- save transcript + answer + feedback + scenario + timestamp.

### Real-call mode

Reduce to the minimum useful surface:

- transcript;
- latest short answer;
- latest RU meaning;
- status / retry;
- scenario selector;
- minimal session note.

### Modes to deprioritize in phase 1

- Finder
- Context packs
- Prepare review panes
- knowledge review/filter surfaces
- large debug surfaces

These should not be deleted first. They should be isolated behind a legacy/advanced boundary until the simple mode proves itself.

## Migration Strategy

### Phase 0: audit and safety rails

Do first:

- keep current STT and meeting transcription untouched;
- keep current assistant path as fallback;
- add a new explicit simple-assistant mode instead of rewriting the existing mode in place;
- keep storage additive at first.

### Phase 1: introduce simple context path

Low-risk steps:

1. Add `simple-assistant` markdown storage and loader service.
2. Add scenario definitions and a selected scenario value in settings/session state.
3. Add a new prompt builder for simple mode.
4. Keep existing `analyzeRecentTranscript()` entrypoint, but route by mode:
   - `legacy`
   - `simple`
5. In `simple` mode, stop calling:
   - selected pack retrieval,
   - local memory retrieval,
   - opportunity handoff,
   - outreach draft compaction,
   - ABVX preparation context.

Expected result:

- same STT path,
- much smaller assistant prompt,
- lower latency without touching realtime transport.

### Phase 2: introduce training mode

Low-risk steps:

1. Add a new renderer mode/panel for training.
2. Start with manual text or mock transcript input before binding to live microphone events.
3. Return one answer instead of three suggestion variants in simple mode.
4. Add `true` / `false` feedback buttons.
5. Persist training session records locally.

Suggested local storage:

- `data/sessions/training-sessions.jsonl`

Each entry:

- timestamp,
- scenario id,
- transcript input,
- model output,
- RU meaning,
- feedback,
- session note,
- model name,
- latency if available.

### Phase 3: connect training feedback to retrospective review

Low-risk steps:

1. Add a local session browser for recent training runs.
2. Filter by scenario and feedback.
3. Allow copy/export to markdown.
4. Optionally derive a compact scenario tuning note manually.

Important:

- phase 1 should store feedback;
- phase 3 should review it;
- do not auto-train or auto-rewrite prompts from feedback in this phase.

### Phase 4: minimize live UI

Only after the simple path works:

1. hide legacy panels behind an advanced toggle or separate mode;
2. extract a `SimpleLivePanel`;
3. extract a `TrainingPanel`;
4. leave Finder/Context/Prepare in legacy mode until explicitly retired.

## Recommended Code Changes Order

### Step A

Add new shared types:

- `SimpleAssistantScenario`
- `SimpleAssistantMode`
- `TrainingFeedback`
- `TrainingSessionRecord`

Probable files:

- `src/shared/app-types.ts`

### Step B

Add simple markdown context service:

- load profile md,
- load scenario md list,
- load selected scenario content.

Probable new file:

- `src/backend/services/simple-assistant-context-service.ts`

### Step C

Split assistant prompt construction:

- `buildLegacyUserPrompt()`
- `buildSimpleUserPrompt()`

Refactor target:

- `src/backend/services/assistant-service.ts`

This is the most important low-risk refactor because it removes hot-path complexity without changing STT.

### Step D

Add simple assistant model setting.

Keep realtime transcription model separate from assistant model.

Suggested default direction:

- realtime STT remains current transcription model;
- assistant text uses one fast current model only;
- disable multi-provider fallback in simple mode unless there is a proven need.

### Step E

Add training session storage service.

Probable new file:

- `src/backend/services/training-session-service.ts`

### Step F

Extract renderer panels instead of extending the monolith further.

Suggested first extractions:

- `src/renderer/TrainingPanel.tsx`
- `src/renderer/SimpleLivePanel.tsx`

Do not start by rewriting the full `App.tsx`. Add isolated panels first and then move code.

## Risks

### Low risk

- adding simple markdown files;
- adding a parallel simple prompt path;
- adding a training record ledger;
- adding a simple scenario selector.

### Medium risk

- changing the assistant output contract from three suggestions to one;
- changing default model selection;
- modifying session state shape;
- reworking `App.tsx` mode structure.

### High risk

- deleting Finder/Context/Knowledge code immediately;
- changing realtime STT while also changing assistant routing;
- removing governance/secret plumbing during the same pass;
- mixing UI minimization, storage migration, and prompt rewrite in one commit.

## Recommended First Implementation Slice

Implement this first:

1. new simple markdown context service;
2. new simple scenario files;
3. simple prompt builder;
4. assistant mode switch between legacy and simple;
5. one basic training panel with:
   - transcript input,
   - scenario selector,
   - one short answer,
   - true/false feedback,
   - local save.

Do not do in the first slice:

- Finder removal,
- context-source deletion,
- vector-ready removal,
- ABVX bridge removal,
- realtime audio transport changes.

## Acceptance Criteria For Phase 1

- Realtime transcription still starts and returns transcript events.
- Meeting transcription still autosaves and exports.
- Simple mode can answer from:
  - transcript,
  - profile markdown,
  - selected scenario markdown,
  - short session note.
- Simple mode does not require:
  - selectedCounterpartyPackIds,
  - selectedFinderOutreachDraftId,
  - context-source retrieval,
  - local memory retrieval,
  - opportunity handoff.
- Training mode stores reviewable local records.
- Real-call UI can be shown in a reduced surface without removing legacy mode.

## Implementation Notes

- The right first cut is additive and parallel, not destructive.
- The biggest latency win is likely prompt simplification, not STT replacement.
- The current codebase already has enough local storage patterns to support the markdown/scenario/training design without new infrastructure.
- The current retrieval and Finder layers should be treated as legacy optional surfaces during phase 1, not as the foundation of the new assistant path.

# Donor pattern adaptation

CoqPi borrows small, local contracts from the reviewed donor examples. The
donor runtimes are not installed and do not become part of the call loop.

## Implemented

- **Pre-call preparation packet** (`src/shared/meeting-workflow.ts`): a bounded
  packet with agenda, participant context, owner focus, selected pack IDs and
  missing context. It is built from the current session and selected packs and
  is included in the assistant prompt.
- **Transcript processing** (`src/shared/transcript-processing.ts`): a local,
  synchronous cleanup of bracketed noise markers plus an EN/FR/auto language
  hint. It does not call an LLM and does not add a round trip to realtime STT.
- **Post-call recap shape**: existing append-only owner-confirmed session
  summaries now carry a compact optional agenda and retain outcomes, follow-ups
  and risks. `buildPostCallRecapDraft` provides the shared shape for future UI
  capture.
- **Privacy gate** (`src/shared/privacy-sanitizer.ts`): immediately before an
  external assistant provider call, email, formatted phone numbers and tracking
  URLs are redacted. Secret-like values such as API keys and bearer tokens fail
  closed and block the request.

## Deliberate boundaries

- No CrewAI, AutoGen, Whisper agent, or TrustBoost dependency is added.
- No raw file contents are copied into telemetry or persisted by these
  contracts.
- The privacy gate is for the external assistant prompt boundary; local STT
  remains latency-sensitive and unchanged.
- Redaction is conservative. A blocked request must be reviewed locally rather
  than silently sent through another provider.

## Verification

Run `pnpm test:donor-patterns` for the focused contract tests. The suite covers
PII redaction and secret blocking, local transcript cleanup/language handling,
selected-pack preparation, and recap agenda assembly.

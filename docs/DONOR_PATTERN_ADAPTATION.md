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

## Planned donor references

- **Provider-neutral mail layer**: `Wh1isper/mcp-email-server`
  (https://github.com/Wh1isper/mcp-email-server) is recorded as the donor
  reference for a future `MailProvider` abstraction after the current Gmail
  path passes a real send-to-self and linked-reply test. CoqPi should borrow
  the narrow safety and interoperability patterns, not install or wrap the MCP
  runtime:
  - explicit account capabilities such as receive/send availability;
  - recipient and sender allowlists before any outbound provider call;
  - provider-neutral RFC threading fields (`Message-ID`, `In-Reply-To`,
    `References`) for future non-Gmail providers;
  - unknown delivery outcomes that require owner review instead of silent retry;
  - metadata-first linked-thread sync and redacted provider diagnostics.

  Gmail remains the primary v1 implementation. Optional IMAP/SMTP is deferred
  until there is a real non-Gmail account requirement and must use CoqPi's
  existing local store, approval, receipt, and privacy boundaries.

## Deliberate boundaries

- No CrewAI, AutoGen, Whisper agent, or TrustBoost dependency is added.
- No `mcp-email-server` dependency or second mail database/credential authority
  is added in the current Gmail-first path.
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

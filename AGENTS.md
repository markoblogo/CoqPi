# CoqPi contributor context

CoqPi is a local-first Electron/React/TypeScript communication assistant. Preserve the separation between transcription, selected context, model suggestions, stored artifacts, and external actions.

## Start here

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/CORTEX_CONTEXT_CONTRACT.md`
4. the task-specific runbook

## Boundaries

- Never commit runtime files under `data/`, `.env` files, transcripts, profiles, credentials, OAuth tokens, or real user/counterparty content.
- Keep renderer access behind the typed preload bridge; secrets and provider calls stay in Electron main/backend.
- `ME` speech remains locally recorded but excluded from assistant analysis and language switching.
- Preserve explicit review and hash-bound approval before Gmail or Calendar writes.
- CortexABV import/export is compact, admission-backed, source-scoped, and must exclude raw transcripts.
- Use synthetic fixtures in tests.

## Verification

Run `pnpm check`. UI automation may disrupt the desktop, so run `pnpm test:conversation-ui` only when its graphical session is explicitly appropriate. Real microphone quality and latency require a separate human smoke test.

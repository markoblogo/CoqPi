# Contributing

1. Fork the repository and create a focused branch.
2. Install with `pnpm install`.
3. Use synthetic fixtures only; do not include real profiles, transcripts, credentials, counterparties, or application material.
4. Run `pnpm check`.
5. Open a pull request describing the behavior, privacy impact, and verification.

Changes to Electron IPC, secret storage, provider calls, transcript persistence, or external-write approvals need explicit regression coverage.

# Release security scope

CoqPi is a local single-user Electron app. Assets: audio/transcripts, selected
personal context, API/OAuth secrets and outbound approvals. Renderer content is
untrusted relative to main-process filesystem, provider and secret access.

- Spoofing/elevation: keep typed preload access, context isolation, sender-scoped
  stream cancellation and explicit review before external writes.
- Tampering: preserve selected-context guards, validated final output, durable
  journals and immutable approval hashes. Never execute transcript/model text.
- Repudiation: keep compact receipts separate from raw transcript storage.
- Disclosure: secrets stay in main/safeStorage; do not publish runtime data or
  send ME/unselected context to assistant analysis.
- Denial of service: bounded provider budgets, bounded stream text, cancellation,
  local recording independent of provider failures, patched dependency graph.

This release checks changed boundaries and dependency advisories; it is not a
whole-product penetration test or proof of zero vulnerabilities.

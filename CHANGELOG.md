# Changelog

## Unreleased

- Monitor Live market options now show whether a hint is matched by Client Preferences or is only a market-similar option.

## 0.3.1 — 2026-09-14

- Added the optional MN7R Monitor Live bridge: client-card setup handoff, normal Monitor sign-in with secure token storage, finalized-`OTHER`-only live previews, temporary BID/OFFER drafts, scrollable opposite-side market options, stale-response protection, and explicit save to Monitor Draft Inbox.
- Live previews remain read-only and unpersisted; no client message or operational BID/OFFER/TRADE is created automatically.

## 0.3.0 — 2026-09-13

- Added reproducible CI covering TypeScript, lint, 300+ deterministic tests, builds, repository privacy boundary, and dependency audit.
- Updated Electron and Crawlee and resolved known dependency advisories through reviewed lockfile overrides.
- Removed the tracked runtime profile and replaced the first-run profile with a neutral scaffold while preserving existing local profiles.
- Made Simple Assistant and local-memory tests independent of ignored personal runtime data and wall-clock expiry.
- Rebuilt the README around installation, privacy, the first useful test, current limits, and product architecture.
- Added contributor, security, changelog, and compact agent-context documentation.

## 0.2.0 — 2026-09-07

- Added conversation-first Live, manual `ME` speaker controls, durable transcript labels, multilingual routing, and the Apple Silicon release bundle.

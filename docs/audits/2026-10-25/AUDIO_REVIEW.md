# Audio-backed virtual answer review

## Scope

Post-Stop, explicit per-answer microphone review only. No real-call corrections,
automatic lessons, pronunciation scores, or private CV retrieval. The archive is
not mutated by feedback. See [runbook](../../INTERVIEW_AUDIO_REVIEW.md).

## Evidence

- Full `pnpm check`: 399/399 tests, typecheck, lint, renderer build passed;
  dependency audit: no known vulnerabilities. Tests use isolated local data.
- Four new audio-review tests cover WAV slicing/framing, unsafe bounds, silence,
  structured evidence validation, actual audio provider payload, explicit consent,
  stopped-only admission, durable owner decisions/cache, changed-audio invalidation
  and failure without transcript mutation. Existing recording regressions now
  also assert persisted answer boundaries and expected text.
- Full App UI: five EN and five FR turns, review, Dismiss and 400/640px layouts
  passed with synthetic providers. Screenshots manually checked at 400px.
- Real OpenAI `gpt-audio`, two synthetic macOS speech files: EN 1.708 s (zero
  findings); FR 2.012 s (one tentative finding). Both persisted and read back.
  This used compiled backend source loaded in an installed Electron runtime with
  isolated user data, not a claim about the final packaged artifact's audio QA.
- Repeated on the final packaged 0.3.9 backend: EN 1.951 s (one tentative finding),
  FR 0.864 s (zero findings), both durable on readback. The audio hashes were the
  same in both runs but proposed findings differed. This is explicit evidence
  of nondeterministic feedback, not validated pronunciation accuracy.
- Paid probe constrained to two short clips (<15 s each), 1,200 output tokens per
  call, no automatic retries, endpoint/call cap, three-minute watchdog. Authorized
ceiling $1 across both two-clip runs; no claim of reconciled provider invoice. Temporary copied encrypted
  credentials removed after testing. No personal recordings/CVs were uploaded.

## Limitations

The French finding on clean synthesized speech is unverified and illustrates
possible false positives. Model confidence is not calibrated acoustic certainty.
Human accent/noise calibration and repeat-attempt comparison remain untested.
Only new virtual answers with reliable saved boundaries are eligible; older
sessions, typed answers and >90-second answers are not guessed or silently cut.
Feedback stays separate from Markdown transcript export and recurring lessons.

## Delivery

Local 0.3.9 installed after owner approval, launched with Key/Profile/Session ready.
All 104 packaged renderer/backend files matched the checked source build.
Installed ASAR SHA-256:
`2563755ee94847cc8e84a1f70866ab820efb33ef7bba1db57f3404e7e93d1a24`.
All 15 original data/secret files retained their hashes after installation and
startup. Prior application and private data backups remain locally available.
No commit, push,
GitHub tag or public release requested in this pass.

UI evidence: [Lazyweb reference selection](https://www.lazyweb.com/agentic-search/1cc48c27-d6a8-499e-9ed5-d81aa77ce28d).

# Personal EN/FR reply bank

## Use

Before the call, open Prepare and expand `Мои готовые ответы · EN / FR`.
Choose a draft, review its question variants, answer and supporting profile
quotes. Edit as needed and explicitly confirm the facts and answer.
Saving as a draft revokes confirmation. No additional controls appear in Live.

Answers are local, owner-reviewed material, not independently verified facts.
CV-derived drafts must not be automatically approved. Evidence quotes must occur
in the current owner profile; the reviewer must also check their meaning and
that the answer does not exaggerate responsibilities, results or commitments.

## Matching and invalidation

The brief selected-context assistant matches only the newest explicit incoming
utterance, EN/FR language and an exact approved alias (case, whitespace, curly
apostrophes and terminal question punctuation are normalized). No fuzzy or
semantic match is used. Constraints, extra clauses, different language, missing
latest utterance and conflicting approvals fall back to ordinary analysis.
High-risk commitment/legal questions retain the existing safety gate.

Approval is bound to the answer, aliases, evidence and a SHA-256 snapshot of
the full owner profile, session, selected IDs, selected pack records and the
canonical prepared prompt. Changes require reload and explicit review again.
The separate simple-context mode and language training do not use this bank.
Confirmed hits use model label `reviewed-personal-reply`, provider `local`.
They avoid generation latency, not STT latency or live-loop settling.

## Storage and privacy

`<sessionsDirectory>/personal-replies.json` is a version-1 JSON document with
`entries`: id, language, questions, answer, evidence, scopeHash, approvedHash.
The installed app normally uses `~/Library/Application Support/CoqPi/data/sessions`.
Writes are serialized, written to a private temporary file, synced and atomically
renamed. Missing files mean an empty bank. Corrupt storage fails closed for Live;
Prepare reports the error. No credentials, CVs or real drafts belong in Git.
Recording, audio backup and assistant cancellation remain separate.

## Verification

- `pnpm check`: includes synthetic store and actual analyze-service regressions.
- `node scripts/acceptance/personal-reply-bank.cjs`: isolated headless UI approval,
  editing, revocation and compact layout (requires Playwright).
- Store tests cover reopen, concurrent writes, corruption, changed evidence,
  stale context, altered answers, language mismatch and compound constraints.
- No paid model requests are needed to validate this deterministic path.

Validation on 2026-10-24: full `pnpm check` passed (382 tests, typecheck,
lint, renderer build and dependency audit). The final editor passed with a
20-entry synthetic bank at 400/640 px; existing compact Live/Stop regression
passed separately at 400/520 px. Final selector changes were rechecked with
typecheck, lint and renderer build. No paid API or new physical-audio test was
performed for this pass. Version 0.3.7 is a local app update, not a GitHub release.

Exact aliases intentionally trade coverage for safety. A confirmed answer is
not guaranteed appropriate to every conversational implication; expand aliases
only after review, not automatically from similar questions.

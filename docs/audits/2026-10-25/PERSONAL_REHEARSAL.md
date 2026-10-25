# Personal interview rehearsal acceptance — 2026-10-25

## Delivered

Local build 0.3.11 adds reviewed immutable submitted-CV/vacancy/company snapshots,
adaptive EN/FR questions, the actual Live hint path, microphone answers, independent
WAV backup, incremental transcript, timing and manual post-Stop review. No real
personal materials were used in external acceptance requests. Delivery scope:
source commit/push and local installation, without a new GitHub Release artifact.

## Verification

- `pnpm check`: 411/411 tests, typecheck, lint, renderer/backend build and dependency
  audit passed; no known vulnerabilities. The pre-existing >500 kB bundle warning
  remains a performance concern, not a failed build.
- Targeted backend/Live tests: 39/39. Coverage includes two CV scopes, forged
  profile/pack overrides, stale question/Stop, provider failure, exact evidence,
  privacy-safe schema enums, snapshot tampering and hash-bound review caching.
- Synthetic UI acceptance passed with 400/640px widths: two companies, three voice
  transcript events each, Next/Finish, retry, review, archive selection and no
  duplicate review blocks. No real microphone/provider claims for this suite.
- Real candidate acceptance: synthetic EN/FR voice through BlackHole, two turns
  per language, actual OpenAI interviewer/Live hints/STT/review, four saved ME
  answers, non-silent valid WAVs, stopped archive readback and cached review reads.
  Final run: 10 text responses, four STT negotiations, no question retries.
  Private evidence directory: `coqpi-personal-paid-bf7br2` in macOS temporary storage.
  Test-only copied encrypted keys were removed after every run.

Final clean-input measurements:

| Measure | English | French |
| --- | --- | --- |
| First streamed hint | 1.326–1.864 s | 0.768–1.478 s |
| Complete hint | 1.607–2.316 s | 1.148–1.901 s |
| STT after speech stop | 0.693–0.722 s | 0.764–0.794 s |
| Final review | 7.764 s | 4.999 s |
| Microphone WAV | 3,956,780 bytes | 3,465,260 bytes |

Hint timings begin after persona question generation, not at the previous answer
or incoming-call audio. They are not end-to-end real-call latency guarantees.
Real checks stayed within the authorized small bounded test scope; the final text
test reserved about $0.0205 using its input/output cap estimate, not a provider
billing statement. Earlier failed probes also made real calls; no exact total
invoice is claimed.

## Findings fixed during acceptance

- Duplicate React keys for audio review and personal report created repeated
  blocks and unstable clicks. Distinct identities and non-shrinking scroll
  children fixed the compact-window path; assertions guard single instances.
- Early model hints invented plausible past details absent from the synthetic CV.
  Personal Live instructions now explicitly distinguish responsibilities from
  documented events/results and require a conditional approach for missing
  specifics. Final probes used conditional responses instead of invented stories.
- Free-form generated citations could differ from source text and were rejected.
  The provider schema now restricts evidence to safe verbatim source snippets;
  backend exact-source validation remains mandatory. Contacts redacted from the
  prompt cannot re-enter via schema enums.
- An asynchronous test wait could advance before the second STT result. Explicit
  Node-side polling and per-turn archived-answer assertions replaced that wait.
  Earlier missing-second-answer probes are failures, not successful audio evidence.

## Installation and preserved data

Installed `/Applications/CoqPi.app` version 0.3.11. Compared all 111 compiled
renderer/backend files against source build: no differences. Packaged MarkItDown
adapter script exists in `app.asar.unpacked/scripts/`.

Installed and tested ASAR SHA-256:
`526b9a234c189fcd9fed1af6d0a7f56a5f07c11f29ee18ca357c688a32121760`.

Private rollback backup: `/private/tmp/coqpi-before-personal-0311`, including the
previous 0.3.10 application and 15 data/secret files. Key/profile were available,
three existing recordings remained available and no synthetic rehearsal snapshots
entered user storage. Fourteen files were byte-identical after startup/close;
the journal preserved its entire old prefix and appended one 312-byte stopped
checkpoint. No pre-existing archive/profile/settings/key content changed.
Native installed-app launch reached Personal interview setup without starting a
recording or model call.

## Remaining limits

- Reports are draft coaching, not certified assessments. The final probes still
  showed generic language advice, overinterpretation of conditional answers and
  occasional English rather than Russian commentary. Exact citations prove
  provenance, not semantic correctness. Reports must not automatically update
  profile, verified answer bank or lesson backlog.
- No human accent/noise/long-session acceptance or real employer interview was
  performed. Four synthetic voice turns are a short functional probe only.
- PDF/Office extraction needs a configured local MarkItDown/Python runtime; the
  adapter script is bundled, not Python. Reviewed text/paste is the fallback.
- URL loading is a bounded public excerpt, not authenticated/exhaustive research.
- Pronunciation remains the separate consented experimental audio review;
  adaptive tutor continuity and shared mistake practice are not delivered here.

UI evidence reference: [Lazyweb research](https://www.lazyweb.com/agentic-search/8d4e6424-d9ec-4c8a-b37b-5b565b515efb),
used for separate post-session feedback and collapsed evidence, not a copied layout.

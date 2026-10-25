# Personal interview rehearsal

## Use

1. Open Learning, choose **Personal interview**, then English or French.
2. Set company, role and goal. Add the **exact CV sent to this employer**, the
   vacancy and company information. Paste reviewed text or choose one explicit
   file. A public vacancy/company URL can load a bounded excerpt; review it.
3. Choose 3, 5, 8 or 10 questions (default 8), confirm the submitted CV and
   OpenAI processing, then **Freeze reviewed materials** and **Start rehearsal**.
4. Select the microphone if needed. Start, listen to the question, read or
   paraphrase the large Live hint, and answer aloud. **Next** waits for a saved
   final answer; **Retry question** retries a failed follow-up. Stop saves early.
5. After Stop, **Review interview** requests the final substance/language review.
   **Recording & timing** exposes archive selection, transcript export and timings.
   Optional **Voice answer review** analyses a selected audio clip separately.

Use headphones to avoid the interviewer question leaking back into the microphone.
This is a rehearsal, not a real employer or a hiring-outcome prediction.

## Context and persistence

The snapshot records normalized reviewed texts, material hashes, company, role,
goal, language and question limit. Backend validation rechecks the snapshot hash.
Submitted CV is the only owner-fact source. Vacancy/company text describes the
employer, not the candidate. Personal hints bypass global profile, memory, other
selected packs and the confirmed reply bank, and use the real Live analysis path.
ME speech is recorded but does not generate hints or switch the rehearsal language.

Private artifacts live under `<sessionsDirectory>/interview-rehearsals/`:
`materials/<id>.json`, `questions/<hash>.json`, `reports/<hash>.json`.
These contain private material and must never be committed. Questions and reports
are immutable atomic artifacts; reports are keyed by snapshot, session and actual
transcript hash. Reopening an unchanged review is a local read, not another model call.

The ordinary incremental session journal retains questions, ME speech, Live hints,
scope hashes and timing. An independent microphone WAV backup continues through
model failures. Stop cancels pending hints; stale question results are rejected.
Archive selection restores that archive's snapshot/report, not the current company.
Markdown exports transcript and rehearsal metadata, not the raw CV or secrets.

## Boundaries

- EN/FR is fixed for one rehearsal. For another language or CV, create a new one.
- Text/Markdown files work without a converter. PDF/Office files require a local
  Python/MarkItDown runtime; only the adapter script is packaged. If unavailable,
  paste the extracted reviewed text. No folder scan or background collection.
- Public URL loading reuses the SSRF-protected bounded fetcher and returns an
  excerpt, not exhaustive research. Authenticated pages are not supported.
- Limits: CV 80–30,000 characters; vacancy 80–12,000; company 40–8,000; one file
  up to 10 MB. Over-limit inputs are rejected, not silently cropped.
- Adaptive questions use bounded previous answers (up to 2,000 characters per
  segment). The complete journal remains intact. Final review rejects interviews
  exceeding its 30,000-character question/answer budget.
- Questions/reviews select quotes from a bounded schema-listed set of source
  snippets (first/last ten sentences per source, up to 200 characters each).
  Snippets changed or blocked by the privacy gate are excluded from the schema;
  the complete prompt also passes through that gate. Exact source validation
  remains mandatory after generation. This improves traceability, but
  cannot prove every model inference is correct. Review advice before relying on it.
- Text review cannot diagnose pronunciation or assign CEFR/hiring scores.
  Audio feedback is experimental and requires separate explicit consent.
- Automatic transfer into lessons, longitudinal curriculum and human accent/noise
  calibration remain separate work. Clean synthetic audio is not a real-call guarantee.

## Verification

`pnpm check` covers backend contracts and the real Live prompt boundary.
`node scripts/acceptance/personal-rehearsal.cjs` runs the isolated synthetic UI
path including retry, two companies, archive restore and 400/640px layouts.
The separate `personal-rehearsal-real.cjs` requires explicit paid authorization,
a candidate app and BlackHole. It uses synthetic materials/voice, isolated storage,
provider-call caps and a watchdog; it is never part of automatic tests.

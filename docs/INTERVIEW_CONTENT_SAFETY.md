# Interview content safety

## Behavior

- Both assistant prompts explicitly distinguish owner evidence from interviewer
  assertions, scenario instructions and hypothetical stories. Missing facts do
  not imply either yes or no.
- A local, deterministic EN/FR boundary recognizes a bounded set of high-risk
  questions. It returns a neutral clarification without a model call. These
  answers are marked `local-safety-clarification`, not attributed to OpenAI.
- The boundary is intentionally conservative: even a supplied CV does not
  automatically authorize accepting a salary, start date or relocation. Known
  behavioral-example patterns currently clarify rather than fabricate a story.
- Typical introduction, motivation, behavioral, weakness, terms and closing
  question structures are guidance only. Latest-turn constraints take precedence.
- Waiting phrases appear after 1.8 seconds without answer text, rotate EN/FR,
  and remain renderer-only. Streaming, Stop, errors, ME and language/question
  changes invalidate them. Recording is unchanged.

## Evaluation

`src/shared/interview-safety-scenarios.ts` contains 30 synthetic questions, 15 per
language. Personal data and generated personalized answers are excluded from Git.
`scripts/acceptance/interview-safety.cjs` requires explicit paid authorization,
uses an isolated copy of selected local context and the real backend service,
and saves a private report. Its per-run conservative reservation limit is $0.50;
the operator must additionally enforce the approved cumulative task budget.
No automatic semantic pass is inferred from HTTP success.

On 2026-10-24, two 24-question real-model runs demonstrated that stronger prompts
alone still invented past achievements and negative legal-status claims. These
were failures, not successful safety evaluations. After adding the local
boundary, a 30-case run contained 20 local clarifications and 10 real model
answers; reviewed outputs no longer contained those concrete fabrications.
This is bounded text evidence, not proof for every paraphrase or a new audio test.

The final 30-case run was repeated with the owner's expanded CV context, with
the same 20-local/10-model split. The 10 generated answers were reviewed against
the supplied profile; no unsupported concrete employer, achievement or accepted
commitment was found in that run. Four runs used 68 real model requests in total,
with approximately $0.0404 estimated from returned token usage at the checked
gpt-4o-mini rates (not a billing statement). Local clarification service latency
was 0-22 ms in the final run; this excludes audio recognition and UI scheduling.

The compact headless UI regression also covers delayed phrase visibility and
Stop invalidation at 400/520 px. A new physical-audio acceptance test was not run.
Compatible undici updates (6.29.1 / 7.30.1) removed the newly reported dependency
advisories; the dependency audit reported no known vulnerabilities afterwards.

## Local delivery

Full `pnpm check`: 379 tests passed, typecheck/lint/renderer build passed; dependency
audit clean. Compact UI regression passed separately. The 0.3.6 macOS app was
installed and launched from `/Applications/CoqPi.app`; startup showed key, profile
and session ready. Installed ASAR matches the packaged build. Fourteen existing
data/secret files were compared: only the intentionally expanded owner profile
changed; recording and key files were unchanged. The prior app and profile were
retained locally for rollback. No GitHub release or release tag was created.

## Limits and next work

The gate uses patterns, not a semantic verifier. Unrecognized paraphrases and
free-form model output can still be wrong; streamed text is not independently
fact-checked. Clarifications can be overly conservative. A follow-up question
must not be treated as evidence of a missing personal fact.

A reviewed, context-hash-bound [personal answer bank](PERSONAL_REPLY_BANK.md)
now provides a separate local path. Only explicit approvals with matching
question aliases, language and context can bypass generation. Compound questions
with new constraints do not match. Human approval remains necessary: an exact
supporting quote proves source presence, not semantic entailment of the answer.

## Research basis

These sources informed question categories and answer structures, not copied
personal answers:

- [Harvard career services: interviewing](https://careerservices.fas.harvard.edu/resources/interviewing/): relevant examples and behavioral interview preparation.
- [France Travail: interview preparation](https://www.francetravail.fr/candidat/vos-recherches/preparer-votre-candidature/entretien/des-entretiens-dembauche-100---r.html): concise, role-related explanations.
- [French public-service interview questions](https://choisirleservicepublic.gouv.fr/conseils/decryptage-de-10-questions-frequentes-en-entretien/): introduction, motivation and closing questions.
- [Harvard negotiation preparation](https://www.pon.harvard.edu/daily/negotiation-skills-daily/negotiation-preparation-checklist/): goals, alternatives, constraints and authority to commit.

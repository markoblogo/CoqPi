# Executed tests and remaining acceptance

Date 2026-10-23; source `b194f11`. Only synthetic content. No microphone recording, paid model/STT, real interview, outbound mail or Calendar action.

## Reproducible local checks

```sh
pnpm build:electron
node scripts/audit-recording-reliability.cjs
```

For the complete check, set these environment variables to fresh temporary subdirectories before `pnpm check`: `COQPI_DATA_DIR`, `COQPI_SESSIONS_DIR`, `COQPI_PROFILE_DIR`, `COQPI_GOVERNANCE_DIR`, `COQPI_PERSONAL_KNOWLEDGE_CORE_DIR`. Do not use working user storage. A test uses a localhost server; sandbox permissions may prevent it. Tests must eventually enforce isolation themselves (F11).

Observed: public boundary, TypeScript, lint, **359/359 tests**, renderer build passed in the isolated run. `pnpm check` exits nonzero at dependency audit: 24 advisories, including 1 critical and 11 high. Initial plain run: 352/359, six private-path EPERM errors and one localhost EPERM. Logs locally: `/private/tmp/coqpi-audit-isolated-check.log`, `/private/tmp/coqpi-audit-check.log`.

Visual repro harnesses and 39 screenshots are under `tmp/audit-2026-10-23/`, listed in [UX-REVIEW](UX-REVIEW.md). Chromium is headless, renderer is actual App, IPC/media/providers are mocked, outbound browser traffic is blocked. Native Electron permissions and hardware are not covered. Three selected screenshots are retained in `evidence/`.

## Three required conversation scenarios

| Scenario | Actions/reference | Expected | Executed result | Completion boundary |
|---|---|---|---|---|
| A: English rehearsal | Synthetic OTHER question about experience; delay fixture answer; mark a ME reply with Space | English ready-to-read answer, Russian meaning, ME not analyzed | Actual renderer displayed English fixture response; ME added no assistant request | UI/event simulation passed; real English STT, accent, grounding, grammar untested |
| B: French rehearsal | French OTHER after ME; question about professional experience; bilingual selected-CV retrieval probe | French answer using relevant reviewed owner facts | French fixture response displayed; language canonical cases pass; equivalent French retrieval query falls back weakly | UI language routing passed; cross-language relevance gap reproduced; real French quality untested |
| C: Multilingual/general | EN/FR events + ME; existing FR->EN->RU->UK->FR fixture; delayed response followed by Stop/Reset | Current language, no own-speech suggestions, no late old answer | Canonical switches pass; old deferred answer visibly returns after Reset | Failed current-answer lifecycle; no actual overlaps/noise/network quality claim |

For all three: expected answer text was supplied by the harness. This is not a model translation/answer-quality score. No WER/CER, semantic correctness or p95 real latency can be derived from it.

## Executed reliability and quality probes

| Probe | Actual result | Evidence |
|---|---|---|
| Process SIGKILL after final transcript+system PCM append | Final text survives; 32,044-byte file remains; data header 0, manifest open; Recover rejects | `recording-probes.json:crash` |
| Merge two recovered lines then Restore second | Second sentence appears both within merged first and as restored second | `mergeRestore` |
| Recovery after same utterance saved live, mic+system fixture return same text | 1 -> 3 segments, one unique text | `liveRecoveryOverlap`; demonstrates dedupe scope, not universal real-audio similarity |
| Good microphone recovery then corrupt system hash | 1 mocked STT success, exception on system file, 0 persisted recovered segments | `partialRecovery` |
| Six adversarial language strings | Three expected, three wrong retained languages | `languageHeuristic`; selected diagnostic set, not population accuracy |
| Same owner fact, EN vs FR question | EN strong lexical match; FR weak selected fallback | `bilingualRetrieval` |
| Snapshot/journal writes | 30 samples at each of 10/100/1000 initial segments | `persistence`; local storage only |
| Existing service regressions | Torn journal tail, stale snapshot, failed-write recovery, review state, source/hash repeated-recovery tests pass | 359-test suite |
| Lessons compact flow | Correction/feedback below clipped viewport; wheel does not reveal | UX-02 screenshot |
| No-key Record Start | Redirects to key settings | UX-05 screenshot; no independent offline recorder |

## Known-reference quality corpus to run with authorized API use

Synthetic owner facts: Alex led three customer interviews, ran one pricing experiment, and collaborated with a five-person team. No claimed degree, employer name, revenue or executive title. Target: Example Robotics, product discovery role. Submitted CV contains interviews and experiment; a separate master-profile hobby is explicitly irrelevant.

EN questions: "Describe a challenging project."; "What did the pricing experiment establish?"; "How large was the team?"; "Which university awarded your doctorate?"; "What does product-market fit mean?"

FR questions: "Quel budget faut-il ?"; "Parlez-moi de vos recherches clients."; "Combien de personnes dans l'equipe ?"; "Quel doctorat avez-vous obtenu ?"; "Comment definiriez-vous l'adequation produit-marche ?"

Expected: exact supplied personal facts only, clarification for absent degree/budget, generic conceptual answer for product-market fit without inventing personal success. Same reviewed fact should be accessible in both languages. Add long questions, accented known recordings, pauses, corrections, overlap/noise, EN<->FR mid-call switches, changed target, removed CV and unplug/replug. For each capture raw reference, recognized text, expected fact IDs, displayed answer, model/config, timing stages and human review.

Measure WER/CER against audio references, terminology/name preservation, correct response language, unsupported personal claims, relevance and speakability. A multilingual reviewer must assess meaning and pronunciation; text equality alone is insufficient. Proposed hard gate: zero invented owner achievements across the acceptance corpus; any failed item blocks acceptance, regardless of average score. Other numerical quality/latency thresholds must be agreed after baseline.

## Recording, summary and lessons acceptance still required

- Local-only recording with no key/network; captured bytes continue through STT errors. Stop, close, SIGKILL, restart, device loss and disk-write failure must expose saved coverage and gaps.
- Later transcription operates on archive-selected session, checkpoints each chunk and does not duplicate existing live speech. Exclude/Restore/Merge/export/summary agree.
- On-request post-call review separates observed agreements, unresolved points, inferred next-step possibilities and recommended actions. It preserves who said what, and labels uncertainty.
- Pronunciation review uses actual ME audio linked to time ranges and, where available, the shown suggestion. Rephrasing is allowed; difference from suggestion is not an error. STT transcript alone is not pronunciation evidence.
- Only high-confidence meaning-changing errors may prepend a repair sentence to the next normal EN/FR suggestion. Other issues are deferred. Test false positives, homophones, names, accent variation, intended rephrasing, and insufficient audio.
- Confirmed errors enter the next EN/FR lesson; user can dismiss a false detection. Repeat practice must demonstrate improvement before marking mastery. Unknown/unreviewed feedback is neither success nor failure.

Real platform interviews are excluded from testing. Use synthetic/authorized rehearsals. Before real evaluative use, review platform assistance rules. There is no claim that current CoqPi enforces such rules automatically.

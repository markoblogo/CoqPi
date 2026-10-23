# Three-mode remediation plan

Decision baseline: 2026-10-23, source `b194f11`. Owner clarified scope during audit. This plan supersedes the old Opportunity-to-Call and broader Finder/CRM roadmap for the target product. Audit only: no product removal/refactor has been executed yet.

## Product contract

**Call is primary.** The user listens to an EN/FR counterpart and reads a short, natural answer in that language. Russian meaning is smaller and secondary. During native RU/UK speech, retain transcription and optional original-language assistance. All conversations preserve an independent local recording.

**Record is secondary.** Record locally without requiring STT or a key, then optionally transcribe and summarize. Already transcribed conversations use the same archive; no automatic summary.

**Lessons are secondary.** Short daily English/French practice, spoken questions/answers, corrections, repeat-error exercises and durable progress. Daily means a usable recurring learning workflow, not a background notification scheduler.

No Finder, queue, outreach, mail, Calendar, CRM/Monitor or Cortex product workflows. Opportunities are supplied by the user's other project. Delete their runtime/UI paths and unnecessary dependencies, after retaining existing data and identifying extraction helpers still needed. Do not rebuild them inside preparation.

## Context and answer policy

| Input | Authority | Treatment |
|---|---|---|
| Exact CV/deck sent to current counterpart | Primary meeting presentation | Version/hash fixed at preparation; selected explicitly |
| Persistent owner profile, LinkedIn, Behance, website | Supplemental reviewed personal facts | May supply relevant supporting facts; distinguish them from already-disclosed material |
| Vacancy/company/counterpart sources | Counterpart evidence | Extract before call where possible; retain URL/date and unresolved fields |
| User's goals and constraints | Negotiation instructions | Compact, explicit; do not infer unprovided commitments |
| Model general knowledge | Generic explanation only | Never invent user credentials, experience, numbers or counterpart-specific claims |
| Fresh public web evidence | Current factual questions | Bounded search, source/date visible in details; run only when needed, never block every answer |

Uncertain fact: clarify or offer a neutral answer. Strong model confidence is not evidence of personal biography. A website URL marked pending is not extracted knowledge. Do not replace authorized sent materials with the full master biography.

## Simplest preparation option

Recommended: **one local workspace, one active meeting, one Prepare action**, reusing existing local document extractors. A small picker/summary lives inside Call; it is not a separate Knowledge dashboard.

Example layout, to be created only during implementation:

```text
CoqPi Workspace/
  profile/                 # permanent reviewed owner materials
    links.txt
  meetings/
    example-company/
      sent-cv.pdf          # or sent-deck.pdf
      brief.md             # goal, counterpart, constraints
      links.txt            # vacancy/company URLs
```

| Option | User effort / complexity | Decision |
|---|---|---|
| Folder + one preparation action | Familiar file operations; extraction errors still need a small status | Preferred default to evaluate with owner |
| Multi-step upload/classify/assemble/select UI | Many concepts and repeated actions | Retire as product workflow |
| Plain Markdown only | Fastest code path, but requires manually rewriting CV/PDF | Keep internally as compiled context, not a mandatory user burden |

Choose workspace once; choose meeting; Prepare reads only designated files and public links, displays a concise facts/unknowns review, then freezes a bounded brief for Start. Existing PDF/office adapter can stay if reliable. LinkedIn requiring login may remain unresolved or use an explicit export; never label an unread link ready. Refresh occurs before Start or explicitly, not through background folder-wide scans during a call. These folder conventions are proposed, not currently implemented.

## Pass 1: trustworthy current answer and recording (P0)

Implementation update: the owner approved this batch after the audit. Version
0.3.3 implements result invalidation, independent local capture, explicit
system-input Live routing, interrupted-WAV repair and per-chunk recovery
persistence. See [implementation and verification](../../RECORDING_RELIABILITY_033.md).
This does not close the whole pass: real routed audio acceptance and recovery
overlap/merge reconciliation remain open. Findings in AUDIT.md describe the
pre-change baseline, not the installed update.

Resolve F01-F04 first, plus backup error visibility from F02/F09.

1. Give local recording its own lifecycle, independent of STT/assistant. Explicit mic and OTHER route, confirmed by source meters/preflight; both write durable audio. Do not label arbitrary selected hardware as OTHER without a verified route. Pending start/stop must be generation-safe; one failed source must not prevent the other from closing.
2. Bind each suggestion to session, turn, language and context version. Reset/Stop/new context invalidates obsolete responses. Abort provider work where supported; never promote delayed results into a new state.
3. Recover interrupted/open WAVs safely; persist each recovered chunk and source outcome. Reconcile recovery with live time/source coverage; preserve originals and report uncertainty instead of merging by text alone. Fix Merge/Restore semantics.
4. Build and verify the actual installed app against tested source. Keep user data. No whole-app redesign.

Acceptance: repeatable delayed-answer reset regression; closed/reopened/SIGKILL recordings retain written data and expose recoverable gaps; no-key record works; system-only synthetic signal reaches OTHER STT route; old app cannot masquerade as new build. Autotests first, then one authorized short real routed conversation. Complexity M/L, with hardware acceptance required.

## Pass 2: three-mode product and one meeting brief (P1)

Resolve F06/F11/F14 and UX-03/04. Remove retired systems, not just menu buttons.

1. Reduce navigation to Call / Record / Lessons and one small settings entry. Remove opportunity scheduler, mail/Calendar/Monitor IPC/UI, related prompt reads and unused dependencies. Retain a safe one-time path to existing data/export; no deletion of user artifacts.
2. Assemble constant owner + exact sent material + counterpart + goal into one reviewed, versioned brief. Reuse extraction; prepare bilingual terminology/fact aliases before call. Store provenance and known unknowns internally, not as live cockpit clutter.
3. Eliminate global Finder/knowledge-store traversal per utterance. Explicitly refresh context version only after review. Retain strict scoping and abstain behavior.
4. Fix first-launch gate and effective config/build visibility. Do not create a comprehensive onboarding wizard.

Acceptance: a user supplies sent CV/deck and target links, reviews one brief, then Start. One EN/FR paraphrase retrieves the same authorized fact; unrelated master-profile material stays out; missing facts produce clarification. Tests assert no Finder/mail/Monitor calls or schedulers in any of the three modes. Complexity M.

## Pass 3: measured fast EN/FR conversation (P1)

Resolve F05/F07; retain current answer-first layout and fix truthful pending labels (UX-07).

1. Add bounded timing stages and gather the audio baseline described in PERFORMANCE.md. Measure actual first-useful answer, not JSON completion alone.
2. Reduce output to ready-to-say answer + meaning plus compact internal source/uncertainty metadata. Evaluate streaming and context-cache gains; tune VAD/debounce against real pauses, not guessed latency targets.
3. Improve language switching and permit quick correction when detection is uncertain. Preserve ME exclusion and existing answer while user reads it; superseding counterpart speech invalidates it appropriately.
4. For stable generic questions, use model knowledge without personal embellishment. For freshness-sensitive facts, support one bounded optional research path from the retained source adapter. Show pending research unobtrusively; avoid unsupported confident current claims. All source content is untrusted data, not instructions.

Acceptance: EN/FR corpus with actual authorized audio/provider runs, reported n/p50/p95/worst and failure rate; baseline then agreed latency budget; no unsupported personal claim, no stale answer, no forced web request for ordinary turns. Compact 720x480 and default 860x540 remain readable with one answer and smaller meaning. Complexity M, provider budget required for acceptance.

## Pass 4: useful post-call review (P1)

Resolve F08/F09/F13 and finish Record's archive workflow.

1. One archive-selected recording can be transcribed/recovered later with progress, retry and durable results. Export and review respect exclusions/merges consistently.
2. Requested business review: observed agreements, evidence-linked open questions, next actions, and possible next developments. Label predictions as hypotheses, not outcomes; never invent commitments.
3. Requested language review: analyze the user's actual ME audio for pronunciation and wording. Preserve timestamp, heard evidence, intended meaning when available, correction and uncertainty. A different paraphrase of the displayed suggestion is not itself an error. STT text alone supports wording/grammar review, not pronunciation scoring.
4. Save reviewed findings and let the user accept/dismiss items for Lessons. Avoid a separate analytics dashboard.

Acceptance: summary matches supplied transcript facts and review state; opening/middle/closing agreements survive long-call handling (no silent 30k-tail omission); pronunciation judgments validated against authorized audio; unknown attribution stays unknown. No summary until requested. Complexity M/L for reliable audio assessment, M for summary/archive.

## Pass 5: daily practice and selective live repair (P1/P2)

Fix UX-02/06/08 and complete the error-to-lesson loop.

1. Lessons: EN/FR choice, one question, one spoken/text answer, short correction, retry/next. Use existing TTS and analysis where suitable; persist in-progress work before provider completion.
2. Maintain confirmed error items, last practice, attempts and evidence of improvement. Start a daily lesson from recurring errors and post-call accepted items; increase difficulty based on demonstrated success. Unreviewed is not failed. No notification system required.
3. Live correction is ONLY for sufficiently certain meaning-changing mistakes. Insert a brief repair directly into the next suggestion in the counterpart's language: "Sorry, I meant..." / "Pardon, je voulais dire...", then answer normally. Never add a competing correction panel. Suppress when intended meaning or own-speaker audio is uncertain; defer ordinary accent/fluency issues until afterwards.
4. Run pronunciation assessment asynchronously with bounded resources; it must not delay normal answers or cause repeated apologies for the same error. Roll it out only after post-call audio evaluation is validated.

Acceptance: five accepted errors survive restart and enter next practice; correction feedback stays ternary; all lesson controls accessible by mouse/keyboard at compact sizes; pronunciation false positives/intentional paraphrases do not cause live apology; a validated meaning-changing example produces exactly one repair prefix. Complexity M/L. Real speech evaluation cannot be certified by text fixtures.

## Release gates across all passes

- `pnpm check` with enforced isolated synthetic stores; resolve dependency findings (F12), then repeat build and packaging checks. Current baseline is not clean at audit stage.
- Keep raw data/secrets outside Git and timing logs. Archive raw audio locally with explicit retention controls; do not silently delete it.
- Verify installed build/version and launch separately from source tests. Do not stop a user's active recording for installation.
- Use permitted rehearsals and authorized audio. Do not covertly assist a prohibited evaluative assessment. No automatic external correspondence or calendar writes remain in target scope.
- No claimed accuracy/latency percentage until measured against a known reference. No advanced diarization, heavy vector platform, agent orchestration or new CRM in these passes.

The owner approved the initial reliability/routing implementation batch after
this audit. The removal direction remains the accepted target scope; the
initial batch has not deleted retired product code or user data.

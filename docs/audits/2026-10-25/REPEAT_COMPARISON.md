# Repeat capture and recommendation quality

## Delivered scope

Local microphone repeats (20-second auto-stop), replay, saved attempt history,
explicit paired-audio consent, a skeptical original-word recheck, and conservative
comparison. Owner confirmation, consistent original-word hearing and acoustic
evidence are required before even a tentative improvement result. Original
interview files remain unchanged; no automatic lesson/mistake promotion.

## Automated checks

- Full `pnpm check`: **403/403** tests passed, typecheck/lint/build passed,
  dependency audit found no known vulnerabilities.
- New behavioral coverage: Stop during delayed microphone permission, single
  flush, capture failure, invalid/missing evidence, consent and closed-audio gates,
  hashes, source/owner-state invalidation, durable cache/history, unchanged advice,
  unsupported and contradictory assessments, identical PCM with sub-2ms boundary
  rounding, silence, provider failure and explicit retry.
- App UI regression: five EN + five FR turns, explicit repeat recording, manual
  EN Stop, real 20-second FR auto-stop, saved attempt selection, comparison and
  Dismiss. No page errors; 400/640px screenshots passed; 400px reviewed manually.
- UI-only providers are mocked. The separate real probes below exercise actual
  OpenAI and the local WAV/metadata services with synthetic speech.

## Real provider probes

Tests used temporary isolated data and synthetic macOS voices, not owner speech,
CVs or real conversations. Explicit total budget ceiling: $1. Endpoint/call/input/
output caps and a watchdog bound each run; no claim of reconciled billing.
Temporary encrypted credential copies are removed after each run.

1. An initial audio reply ignored the requested JSON format. JSON response mode
   was rejected by the provider. The final implementation uses supported forced
   function calling with one fixed data-only function and runtime validation.
   No provider-returned tool can execute an external action.
2. A repeated identical WAV initially differed at the final fraction of a
   millisecond because stored timestamps round to milliseconds. A deterministic
   PCM guard now recognizes identical frames with only a sub-2ms tail difference.
3. Clean EN/FR speech with deliberately false, pending recommendations: original
   recheck returned `unsupported`, comparison `not_assessed`; identical repeat
   returned `same_audio`. EN 1.347 s, FR 1.585 s; durable readback passed.
4. Known synthetic EN `tree / three` pair exercised the real two-audio API branch.
   An earlier result contradicted the original-word recheck and incorrectly
   described the sound direction. Added an explicit consistency gate. Final
   probe: `uncertain`, 3.598 s; identical control `same_audio`; readback passed.
   This is not a successful phonetic accuracy benchmark or proof of improvement.
5. Final packaged-backend safety repeat: EN `unsupported` (1.709 s), FR `uncertain`
   (1.417 s); both `not_assessed`, identical controls `same_audio`, persisted
   results restored. Variation from the earlier FR result remains evidence that
   this model must not be treated as a calibrated phonetic judge.

## Remaining limits

The same general audio model performs both stages; they are separate calls, not
independent expert validation. Model false positives, false negatives and clip
ordering confusion remain possible. Owner confirmation is not calibration.
Strict heard-word consistency can abstain on different spellings of the same
sound. Human-accent/noise calibration, phonetic alignment and teacher-reviewed
EN/FR benchmark data remain open. No claim of certified pronunciation assessment.

## Installation

Installed local **0.3.10** after owner approval. Native startup showed
Key/Profile/Session ready and the virtual interview setup. All 107 packaged
renderer/backend files matched the checked build. Installed ASAR SHA-256:
`aee2a1b29ded3d64e4f7983e46560c87d2d33410c7624404fe085fe56130aac8`.
All 15 original data/secret files retained their hashes after installation and
startup; previous application and private backups are retained locally.
No GitHub release, commit or push requested in this pass.

## References

- [OpenAI audio model capabilities](https://developers.openai.com/api/docs/models/gpt-audio)
- [UI replay/compare reference](https://www.lazyweb.com/agentic-search/56123e93-0ad6-4f40-8231-e7905adf9af3)

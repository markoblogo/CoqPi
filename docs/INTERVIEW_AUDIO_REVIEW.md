# Voice answer review

After a virtual interview, press Finish/Stop and open **Voice answer review**.
Select the answer, choose **Read the hint** or **My own wording**, then use
**My recording** to replay the local clip. **Send clip to OpenAI for review**
explicitly sends only that microphone range, language, question, saved hint when
reading, and its background ASR text. It does not send the owner's CV, packs,
other turns or the complete microphone recording.

Feedback contains at most three tentative audible issues, clip-relative time
ranges and a correct example that can be spoken locally. Confirm/Dismiss saves
the owner's decision; neither choice changes the original transcript/audio or
automatically adds an item to lessons. There is no pronunciation/CEFR score.

## Repeat and compare

For a non-dismissed finding, open **Repeat & compare**, choose your microphone,
and press **Record repeat**. Read the correct example or repeat the target phrase.
**Stop repeat** saves a separate local WAV; capture also stops automatically after
20 seconds. You can replay each saved attempt and explicitly **Send both clips to
OpenAI**. Neither recording nor comparison runs automatically during real calls.

The first audio-model pass rechecks the original word without the prior diagnosis
being supplied. Only supported, sufficiently confident acoustic evidence admits
the second pass comparing original and repeat. Unsupported or uncertain advice
produces no improvement claim. An `improved` result additionally requires explicit
owner confirmation of the original finding and evidence from both clips; the UI
still calls it **Possibly clearer**, never a verified assessment. Confirmation is
not certification. The recheck and paired comparison must also agree on the heard
original target word; disagreement forces **Not enough evidence**, for positive
and negative verdicts alike. Exact word matching is deliberately conservative:
different spellings/transcriptions may cause abstention even for similar sounds.
Identical PCM, including sub-2ms tail rounding, is handled
locally and cannot count as improvement. Silence/gaps/incomplete audio abstain.

Recheck is another model opinion, not independent human phonetic validation.
Good accents, missing target words and different wording must not be punished.
There are no pronunciation scores, automatic error promotion or claims of
measurable learning progress. The owner may dismiss the original recommendation.

Repeat metadata and comparison evidence are stored atomically under
`<sessionsDirectory>/practice-repeats/<uuid>.json`; PCM remains in the existing
`audio-backups/<hash-of-practice-repeat-id>/microphone.wav` format. Records bind
parent session/turn/finding, source/target hashes, expected example, capture state,
owner confirmation, model, timings and conservative verdicts. Original interview
files are unchanged. Reopen restores attempts and cached results. Source changes,
new owner decisions or changed repeat audio invalidate stale comparisons. A known
capture failure cannot be cleared by a later successful-looking Stop. Closing or
changing screens awaits local capture flush, including delayed mic permission.

An explicit comparison sends only the saved answer clip, repeat clip, target word,
language and bounded exercise metadata. It uses at most two `gpt-audio` calls,
900 output tokens/call, a 60-second timeout/call and no automatic retry. Forced
function calling returns assessment data only: no tool is executed. Audio-model
JSON response mode is not assumed supported. Invalid tool names, malformed output
or missing evidence fail closed; recordings remain available.

## Boundaries and reliability

- Only stopped, newly recorded EN/FR virtual voice answers with explicit start/end
  boundaries can be reviewed. Older sessions are not guessed into time ranges.
- Typed answers, open audio, invalid WAVs and answers outside 0.5–90 seconds are
  rejected. Very quiet/silent audio gets `not_assessed` locally without a request.
- No fallback from missing audio to text-only pronunciation diagnosis. Background
  speech/leakage may still affect review; use headphones and verify the clip.
- OpenAI `gpt-audio` receives WAV input through Chat Completions with text-only
  output, `store:false`, 1,200 output-token cap, 60-second timeout, no automatic
  retries. Normal provider billing/retention terms still apply.
- Returned findings require a valid in-clip range, nonempty evidence/correction/
  example and model-reported confidence >=0.8. That is a filter, not calibrated
  certainty. Valid accents/paraphrases and uncertain differences must not be
  treated as confirmed mistakes. The human can dismiss any finding.
- Recording and Live do not wait for review. A provider failure leaves all saved
  artifacts intact and allows an explicit retry.

## Local storage

`<sessionsDirectory>/practice-reviews/<session-sha256>-<turn-index>.json` stores
version, session/turn IDs, language/mode, clip hash and offsets, timestamp, model,
latency, summary, bounded findings and pending/confirmed/dismissed decisions.
Files are written atomically with owner-only permissions. Reopen returns the same
review; unchanged clips/mode reuse it without another paid call. Changed audio
invalidates the saved evidence. The original journal/archive is not rewritten by
review. Markdown transcript export excludes feedback; it remains available in UI.
Governance receipts contain action metadata, not audio or feedback text.

## Verification

`tests/interview-audio-review.test.cjs` checks actual WAV framing, bounds, silence,
provider payload, consent, stopped-only admission, durable decisions, cache,
changed audio and provider failure without transcript mutation. The App UI
acceptance script covers review and Dismiss after five EN/FR interview turns.

The opt-in `scripts/acceptance/interview-audio-review-real.cjs` sends two bounded
synthetic EN/FR clips to the real provider with isolated data, copied encrypted
credentials removed afterward, an endpoint/call cap and a three-minute watchdog.
2026-10-25: EN 1.708 s, FR 2.012 s; both reviews survived readback. The French
synthetic voice received one unverified finding. This proves audio integration,
not pronunciation accuracy: human-accent calibration and repeat-attempt comparison
remain open before treating this as a reliable language assessment tool.
The final 0.3.9 packaged-backend repeat measured EN 1.951 s and FR 0.864 s, with
different findings on the same audio hashes. The feedback is experimental and
nondeterministic; never treat model-reported confidence as a verified diagnosis.

`tests/interview-repeat.test.cjs` covers conservative parsing, delayed permission
and Stop, failed capture, consent, duplicate/cache behavior, unsupported advice,
owner confirmation, identical/silent audio, source invalidation and retry safety.
The App UI regression exercises manual EN Stop and real 20-second FR auto-Stop.
Set `COQPI_REPEAT_ACCEPTANCE=1` in the opt-in audio acceptance script to test seeded
false recommendations and identical audio with real synthetic EN/FR speech. These
fixtures are deliberately false claims, not user mistakes or model-generated facts.

API contract: [OpenAI audio inputs](https://developers.openai.com/api/docs/guides/audio-chat-completions),
[gpt-audio](https://developers.openai.com/api/docs/models/gpt-audio).

# Realtime transcription latency

Historical audio evidence for the pre-release 0.3.3 candidates. The subsequent
[v0.3.4 dependency pass](DEPENDENCY_SECURITY.md) resolves the audit findings;
its packaging/runtime checks do not retroactively change these measured timings.

## Scope

Reduce conversation latency without changing the transcription model or weakening
recording durability. This is a short synthetic-audio check through real BlackHole,
WebRTC and OpenAI, not a physical-headset or long-call certification.

## Changes

- Conversation OTHER input uses 500 ms server-VAD silence instead of 800 ms.
  Recording mode and the separate ME microphone retain 800 ms. Threshold 0.5 and
  300 ms pre-roll are unchanged. Auto still allows EN/FR/RU/UK switching.
- Explicit system-loopback capture disables browser echo cancellation, noise
  suppression and automatic gain. Microphone processing defaults are unchanged.
- The model remains `gpt-4o-transcribe`. No interim transcript is promoted to a
  final segment or used to trigger an assistant answer.
- Local microphone/system WAV backups, incremental transcript journal, recovery
  and Stop/Reset guards remain independent of STT and assistant success.
- The real-audio probe records metadata-only speech-stop, commit and transcription
  event times. It fails if no finalized answer arrives, instead of counting an
  error screen as successful execution.

## Baseline

Installed build `9b8ca711...`, probe `coqpi-acceptance-BGvWVk`, same EN/FR inputs:

| Language | End of playback to final STT | To final assistant answer |
| --- | ---: | ---: |
| English | 1,681 ms | 3,908 ms |
| French | 1,599 ms | 3,659 ms |

French speech-stop arrived after 803 ms; final transcription followed 796 ms later.
The earlier 11,825 ms complete-answer sample did not repeat in this baseline.
It remains an observed outlier, not a fixed or explained failure. Do not compare
one best new sample against that outlier and claim a guaranteed speedup.

An unpackaged Electron test could not decrypt the installed app's safeStorage
credential. It was not an STT measurement; credential protection was not bypassed.
Real acceptance uses the packaged app identity and isolated session data.
In that failed connection run (`coqpi-acceptance-bKswB7`), shutdown still saved a
stopped session and valid microphone/system WAVs (5,947,436 and 5,824,556 bytes;
declared PCM lengths matched file sizes). Zero finalized STT segments is expected
for the failed connection; this is audio preservation, not successful transcription.

## Quality gate finding

First packaged candidate `bff2746e...` (`coqpi-acceptance-AJHlBN`) returned the French
turn in Russian. STT itself took 1,587 ms, but this is a quality failure, not a
successful speed measurement. The candidate was not installed. The Auto prompt
now explicitly preserves each turn's language and numbers/negations. The audio
probe also computes reference word error rate and fails above 15%; this is a
fixture guard, not a substitute for checking meaning and numeric formatting.

## Final candidate measurements

Candidate ASAR `61839f7da1a5f91046ec79d02018ff111a147c7225cf25bbe1565a6b29313c38`,
probe `coqpi-acceptance-tQHRUA`:

| Language | End of playback to final STT | To final assistant answer |
| --- | ---: | ---: |
| English | 1,434 ms | 4,711 ms |
| French | 1,175 ms | 3,667 ms |

All 65 reference words were preserved (normalized WER 0). French stayed French,
the meaning appeared in Russian and the suggested response in French. Both WAV
headers matched their saved file lengths; Stop completed in 39 ms. These are
single samples: STT improved by 247/424 ms versus the paired baseline, but total
assistant time did not improve consistently. No claim of eliminating the earlier
11-second tail is justified.

The reopen check timed out, so this run alone does not pass the installation gate.
A subsequent isolated launch stalled before audio capture. A native process sample
identified synchronous macOS Keychain access (`SecItemCopyMatching` / decrypt) as
the blocking call, also from a local-disk copy. This is not evidence of an STT
latency regression; neither credentials nor Keychain protection were bypassed.
The owner subsequently allowed Keychain access and the next probe reached the UI.

## French numeric / pause validation

Probe `coqpi-acceptance-BwBpqG` used the identical candidate from a local-disk copy.
The fixture included a 450 ms inserted pause, 15,000 versus 50,000 euros, 27 November,
and "sans réduire les tests". All original French words and constraints survived;
Russian meaning and French response were displayed. Final STT took 1,742 ms after
playback ended; the final answer took 3,909 ms. Stop took 44 ms. Both audio files
were saved with matching PCM lengths, and close/reopen preserved every segment.

The initial automated WER gate incorrectly counted `15000` versus `15 000` as word
errors (4/23). The original report remains unchanged. A separate comparison after
normalizing only grouped thousands gives 0/23 errors; added unit coverage confirms
that changed amounts, dates and missing negations still count as errors. This was
a test-comparison correction, not an ASR correction or a relaxed error threshold.

## Verification and installation status

- `pnpm check`: 370 tests passed; type checking, lint, boundary validation and build
  passed. The command remains nonzero on 12 pre-existing dependency advisories
  (3 high, 6 moderate, 3 low).
- Recording UI regression passed: offline capture, OTHER/ME separation, channel
  latency modes and rejection of delayed answers after Stop/Reset.
- A further local-disk offline launch also did not reach the UI. Isolated hung
  processes were stopped before capture; temporary encrypted key copies were removed.
- Numeric-format comparison regression passed separately. Real numeric/pause
  quality and close/reopen checks passed after Keychain access was allowed.
- `/Applications/CoqPi.app` was updated. Its ASAR SHA-256 matches the tested
  candidate `61839f7da1a5f91046ec79d02018ff111a147c7225cf25bbe1565a6b29313c38`.
  Installed-binary preflight completed at 17:45:59 UTC without renderer errors;
  this last launch was isolated and made no paid requests.

## Reference

[OpenAI transcription session reference](https://developers.openai.com/api/reference/resources/realtime/subresources/transcription_sessions/methods/create)
documents the silence/early-turn tradeoff. A shorter pause can split a natural
utterance, so pause/negation/number preservation must be checked before installation.

## Remaining limits

Cloud/network transcription tails are not bounded by the VAD setting. More accents,
background noise, actual headset audio and repeated long calls remain necessary to
measure p95 and verify accuracy beyond these fixtures. Raw backups are recoverable
evidence, not proof that every live word was recognized correctly.

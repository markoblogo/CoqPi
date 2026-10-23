# Recording reliability 0.3.3

## Scope

First implementation batch from the 2026-10-23 audit: obsolete assistant results,
independent local audio capture, interrupted-WAV recovery, and system-input Live routing.
No Finder/mail removal, lesson redesign or pronunciation analysis in this batch.

## Use

1. With speakers and a single microphone, use the existing Mic input and Space/ME marking.
2. With headphones, route the call output through an existing loopback device such as BlackHole/Loopback. In Settings > Debug choose that device under **Other side input (loopback)** and choose a separate physical microphone. CoqPi does not install a driver or reroute Meet/Zoom automatically.
3. Live sends the explicit loopback stream to STT as OTHER and the physical microphone as ME. Only OTHER triggers suggestions/language switching. Two STT streams incur provider usage. A bad route cannot be detected merely from the device name: confirm that it contains the counterpart, not your mixed output.
4. Transcribe > Start captures local audio without requiring a key. With a key, it also requests live transcription. An STT/network error does not stop local capture. Stop ends both sources and saves the session.
5. After interruption/reopening, Transcribe > Recover repairs an open WAV when no recording owner is active, then requests cloud STT. A key/network is needed for recovery, not for the local recording itself. Export text after review.

## Persistence and recovery

Configured sessions directory (`COQPI_SESSIONS_DIR`, otherwise app data `sessions/`):

- existing current-session snapshot, append-only transcript journal and per-session archive;
- `audio-backups/<sha256(session_id)>/manifest.json`;
- `microphone.wav`, optionally `system.wav`, PCM16;
- local stage claim files prevent simultaneous recording/recovery.

Audio writes serialize per source, update the WAV header and fsync before acknowledgement.
Restarting a writer cannot truncate an existing source file. Stop drains queued chunks;
failure closing one source does not skip the other. Write errors stay visible rather than
being cleared by successful transcript autosave. The renderer queue is bounded: overload
reports a gap rather than retaining unbounded audio in memory.

Recovery repairs a stale open PCM header using actual file bytes, after rejecting a live
recording owner. The original PCM is retained. Each successful recovered chunk is committed
to the transcript journal before the next provider request. If a later source fails checksum
validation, earlier recovered text remains saved and the UI reloads that progress.

Stop/Reset/new capture and changed context invalidate pending assistant result generations.
New counterpart turns invalidate older in-flight answers. This rejects old success and error
responses; it does not yet cancel an already-running backend provider request or its cost.

## Verification

Verified locally on 2026-10-23:

- 364/364 automated tests; TypeScript, ESLint and renderer build passed.
- Headless App regression passed, including Stop during pending input acquisition,
  no-key capture, STT failure with backup kept running, two-source routing, ME
  exclusion and delayed response rejection after Stop/Reset.
- SIGKILL test retained the written transcript and 32,000 PCM bytes; interrupted
  WAV repaired successfully. A failed second recovery source retained the first
  recovered segment on disk.
- All 90 compiled application files matched the packaged ASAR.
- Installed `/Applications/CoqPi.app` reports 0.3.3; local ad-hoc signature
  verification passed (not Developer ID signing/notarization).
- Both built and installed apps passed isolated launch/close verification:
  renderer loaded, synthetic transcript saved, 6,400 PCM bytes finalized on
  window close. No real microphone/provider call was used.
- Full `pnpm check` is NOT green: dependency audit still reports 24 advisories
  (1 critical, 11 high, 9 moderate, 3 low). These existed before this batch;
  dependency presence is not an exploitability determination.

Installed ASAR SHA-256:
`8a7cf28e6c299288251783b6fbc8b01ba29978a439ebf50b3d1c8618e9c2c5c5`.
The previous application bundle was retained outside Applications for rollback;
no profile, credential or conversation archive was moved or deleted.

- `pnpm test:meeting-transcription`: storage, source labels, WAV headers and recovery.
- `node --test tests/raw-audio-recorder.test.cjs tests/recording-crash.test.cjs`: pending Start/Stop, disk-error visibility, SIGKILL persistence and partial recovery.
- `pnpm test:recording-ui`: headless real React App with synthetic IPC/WebRTC/audio. Covers no-key recording, OTHER/ME routing, ME exclusion, delayed response after Stop/Reset. Requires Playwright (`COQPI_PLAYWRIGHT_MODULE` may point to an existing installation). Blocks external network requests.
- `pnpm check`: broader regression/build/security gate. Dependency advisory results must be reported separately from functional tests.
- `COQPI_TEST_EXECUTABLE=/Applications/CoqPi.app/Contents/MacOS/CoqPi node scripts/verify-packaged-recording.cjs`: actual installed-bundle launch and close persistence with isolated synthetic data. Uses the same optional Playwright module override as the headless test.

## Remaining limits

- An OS crash can still lose audio not yet delivered/acknowledged by the backend; disk full or lost input cannot be recovered magically.
- This is a selected virtual-device route, not automatic macOS system-audio capture.
- A microphone on loudspeaker may include both voices; UNKNOWN remains appropriate for recovered single-mic audio.
- Recovery is manual for the current restored session. Arbitrary archived-session recovery, overlap reconciliation against existing live text, and Merge/Restore duplication remain follow-up work. Review recovered chunks before export.
- Real microphones, loopback routing, long calls, recognition and latency were not certified by synthetic tests. No paid transcription was performed for verification.
- Retired product modules and pre-existing dependency advisories are outside this focused repair batch.

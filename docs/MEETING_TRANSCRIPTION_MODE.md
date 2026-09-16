# Meeting Transcription Mode

Use this mode when the goal is only to record a meeting transcript.

Path:

`Open CoqPi -> Transcribe -> choose language -> Start -> meeting -> Stop -> Save Markdown or Copy Markdown`

Current status: local incremental persistence is implemented. The app can
transcribe from the selected microphone, preserve checkpoints during an
interruption, restore a damaged snapshot from its journal, and export a UTF-8
Markdown transcript. An Amanu-inspired local audio backup writes WAV/PCM audio
alongside the transcript manifest. A stopped session can be manually recovered
from available backup sources if realtime STT missed text. This backup is
separate from assistant suggestions and is kept local.

## What It Does

- listens to the selected microphone;
- sends audio only to the realtime transcription provider;
- displays interim text live;
- commits finalized transcript segments and safe interim checkpoints;
- scrolls the transcript view toward the latest text;
- autosaves the current meeting transcript to an atomic snapshot and an
  append-only NDJSON journal after realtime events;
- uses the same recording path when Live Copilot is enabled, while keeping
  assistant failures separate from transcript persistence;
- can optionally update the MN7R Monitor Live panel from finalized `OTHER`
  lines; this bridge is separately consented and does not change local transcript persistence;
- flushes pending local writes on Stop, window close, app quit, and reload;
- exports Markdown or TXT as UTF-8;
- can copy the Markdown transcript directly to clipboard if the save dialog is
  inconvenient during a call;
- preserves finalized text when realtime transcription is interrupted;
- writes a local WAV/PCM backup while recording, so later recovery has audio to
  retranscribe;
- can manually recover a stopped session from `microphone.wav` and, when a
  separate system route has written one, `system.wav`; the recovered text is
  split near detected low-energy pauses when possible, otherwise by safe fixed
  windows, then appended with approximate timestamps to the local transcript
  journal once per audio hash/chunk;
- shows a short recovery report after manual recovery: recovered chunks,
  failed chunks, skipped duplicates, empty chunks, and per-source counts;
- follows language changes within a recording; the language selector is an initial hint;
- retains each session in Saved conversations, independently of Clear;
- retries interrupted WebRTC transport up to three times, without discarding the current session.

## What It Does Not Do

- no translation;
- no assistant answers;
- no reply suggestions;
- no summary during the call;
- no reliable speaker labels unless the audio route provides them; otherwise
  exports use `UNKNOWN`;
- no automatic system-audio routing yet; the backend accepts a separate
  `system` backup source, but the default UI path still starts microphone
  backup only;
- no automatic background retranscription from the saved WAV backup yet;
- no automatic Monitor write: a live brokerage preview stays temporary until
  the broker explicitly saves it to Draft Inbox.

When recording through Live, [manual speaker marking](MANUAL_SPEAKER_MODE.md)
preserves `ME`/`OTHER` labels without stopping transcription. This is a user
annotation, not diarization. Recorder-only sessions continue to use `UNKNOWN`
when the source is unavailable. Recovered `system` chunks are labeled `OTHER`.

## Manual Check

1. Open `Transcribe`.
2. Select `Ukrainian`.
3. Select the microphone input or leave `System default (macOS)`.
4. Press `Start Transcription`.
5. Speak Ukrainian for a few minutes.
6. Play another Ukrainian speaker through Mac speakers so the microphone hears both voices.
7. Confirm finalized lines appear in the transcript area.
8. Press `Stop`.
9. If expected text is missing and the session has a completed audio backup,
   press `Recover`.
10. Press `Save Markdown` or `Copy Markdown`.
11. Open the exported file, or paste copied Markdown into a note, and check
    Ukrainian characters and obvious duplicate fragments.

Repeat a short one-sentence check for:

- Russian;
- English;
- French.

## Real Call Setup

Use this when the call is in Google Meet or another app on the same Mac:

1. Start CoqPi before the call.
2. Open `Transcribe`.
3. Select the language of the meeting.
4. Select the mic or leave `System default (macOS)`.
5. Keep call audio on Mac speakers if you need both sides captured by the mic.
6. Press `Start Transcription` before the important part begins.
7. Press `Stop` after the call.
8. If the transcript missed a section after an STT interruption, press
   `Recover` before export.
9. Export Markdown, or use `Copy Markdown` if the file dialog is not convenient.

If status becomes `interrupted - transcript preserved`, realtime transcription
failed but the finalized text and any saved interim checkpoint remain in the
local session. Use `Stop`, then `Recover` if the microphone backup completed,
then `Save Markdown` or `Copy Markdown`. `Clear` asks for confirmation when the
current transcript has not been exported/copied yet.

If headphones are used, CoqPi will usually capture only your own voice unless
the headset leaks enough audio into the microphone. Dedicated system-audio
routing is prepared in the backup contract, but still needs a real routed audio
source in the UI/runtime.

## Launch Without Terminal

Build a local macOS app bundle:

```bash
cd /Volumes/Work/Work/CoqPi
pnpm run pack:mac
```

Then open:

`/Volumes/Work/Work/CoqPi/dist-packages/mac-arm64/CoqPi.app`

You can drag that app to `/Applications` or keep it in Dock. Because it is
unsigned, macOS may require right click -> `Open` on first launch.

## Automated Check

Run:

```bash
pnpm test:meeting-transcription
```

This covers final/interim handling, stop/clear behavior, backup recovery
dedupe and chunk timestamping, UTF-8 export,
filename generation, explicit language config, reconnect-style duplicate final
events, append-only journal recovery after a broken snapshot, serialized
atomic local writes, local autosave/restore/export, and the no-assistant
boundary for the transcription event model.

## Persistence format

Session data is stored under the app sessions directory (development:
`./data/sessions`; packaged app: the CoqPi data directory):

- `meeting-transcription-current.json` is the latest atomic snapshot;
- `meeting-transcription-journal.ndjson` is an append-only sequence of safe
  session checkpoints and changed-segment patches used for recovery;
- `recordings/<sha256(session_id)>.json` retains independently readable session archives;
- `audio-backups/<sha256(session_id)>/manifest.json` tracks the local
  WAV/PCM backup sources;
- `audio-backups/<sha256(session_id)>/microphone.wav` stores the local
  microphone audio backup when available;
- `audio-backups/<sha256(session_id)>/system.wav` stores a separate system
  audio backup when an explicit system route is connected;
- `audio-backups/<sha256(session_id)>/*.claim.json` prevents duplicate
  recording/transcription/recovery workers from processing the same session;
- `Clear` removes the current snapshot and journal after explicit confirmation
  when needed.

Window close and quit wait for a renderer checkpoint and backend flush; a failed
save keeps the window open with an error. Clear does not remove archived sessions.
Live sessions also retain assistant answers/model/latency, separate from original
transcript segments. Export remains transcript-focused. Text already received is
protected; audio spoken during an STT outage may exist in the local WAV backup.
Manual `Recover` scans stopped backup WAV files for low-energy pauses near
chunk boundaries, falls back to fixed windows when no useful pause is found,
sends each chunk to the configured STT provider, and appends recovered segments
with approximate chunk timestamps to the local journal. Microphone recovery uses
`UNKNOWN`; system recovery uses `OTHER`. Repeating `Recover` for the same audio
hash/chunk does not duplicate text. Recovered chunks are marked in the
transcript review. The review can be filtered by `All`, `Exported`, or
`Excluded`. Before export, a bad recovered chunk can be excluded from
Markdown/TXT while staying visible in the local session, restored if it was
excluded by mistake, or merged into the previous segment when the boundary split
one phrase in two. The recovery report remains visible after recovery so the
operator can judge whether the archive is trustworthy.

The journal contains only transcript session fields. It does not contain API
keys, system prompts, unrelated settings, or assistant hidden reasoning.

Live microphone and OpenAI credential behavior should be rechecked after major
realtime/audio changes.

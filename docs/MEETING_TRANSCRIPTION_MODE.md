# Meeting Transcription Mode

Use this mode when the goal is only to record a meeting transcript.

Path:

`Open CoqPi -> Transcribe -> choose language -> Start -> meeting -> Stop -> Save Markdown`

Current status: manually checked on the local Mac. The app can transcribe from
the selected microphone, stop without clearing the transcript, and export a
UTF-8 Markdown transcript.

## What It Does

- listens to the selected microphone;
- sends audio only to the realtime transcription provider;
- displays interim text live;
- commits only finalized transcript segments;
- autosaves the current meeting transcript locally;
- exports Markdown or TXT as UTF-8.

## What It Does Not Do

- no translation;
- no assistant answers;
- no reply suggestions;
- no summary during the call;
- no speaker labels in v1;
- no system-audio routing.

## Manual Check

1. Open `Transcribe`.
2. Select `Ukrainian`.
3. Select the microphone input or leave `System default (macOS)`.
4. Press `Start Transcription`.
5. Speak Ukrainian for a few minutes.
6. Play another Ukrainian speaker through Mac speakers so the microphone hears both voices.
7. Confirm finalized lines appear in the transcript area.
8. Press `Stop`.
9. Press `Save Markdown`.
10. Open the exported file and check Ukrainian characters and obvious duplicate fragments.

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
8. Export Markdown.

If headphones are used, CoqPi will usually capture only your own voice unless
the headset leaks enough audio into the microphone. System-audio routing is not
implemented in v1.

## Launch Without Terminal

Build a local macOS app bundle:

```bash
cd /Volumes/Work/Work/CoqPi
pnpm pack:mac
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

This covers final/interim handling, stop/clear behavior, UTF-8 export,
filename generation, explicit language config, reconnect-style duplicate final
events, local autosave/restore/export, and the no-assistant boundary for the
transcription event model.

Live microphone and OpenAI credential behavior should be rechecked after major
realtime/audio changes.

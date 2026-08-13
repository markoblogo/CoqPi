# Meeting Transcription Mode

Use this mode when the goal is only to record a meeting transcript.

Path:

`Open CoqPi -> Transcribe -> choose language -> Start -> meeting -> Stop -> Save Markdown`

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

## Automated Check

Run:

```bash
pnpm test:meeting-transcription
```

This covers final/interim handling, stop/clear behavior, UTF-8 export,
filename generation, explicit language config, reconnect-style duplicate final
events, local autosave/restore/export, and the no-assistant boundary for the
transcription event model.

Live microphone and OpenAI credential behavior still require manual
verification on the Mac.

# Realtime Smoke Test

## Prepare

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY`.
3. Optionally review:
   - `OPENAI_REALTIME_TRANSCRIPTION_MODEL`
   - `OPENAI_REALTIME_TRANSCRIPTION_DELAY`
   - `OPENAI_SAFETY_IDENTIFIER`

Expected result:

- `.env` exists.
- API key status in the app should later show `Present`.

## Start app

1. Run `pnpm dev`.
2. Wait for the Electron window to open.

Expected result:

- App launches.
- No startup crash.

Common failures:

- `OPENAI_API_KEY` missing.
- Electron microphone permission not granted.

## Check basic UI state

1. Confirm `API key status: Present`.
2. Confirm an `Audio input` device is selectable.
3. Confirm `Realtime Health: Not started`.

Expected result:

- Key presence is visible without exposing the key itself.
- A microphone device is listed.

Common failures:

- No audio devices available.
- Permission denied from a prior run.

## Check audio meter

1. Click `Grant Access` if needed.
2. Speak into the selected microphone.

Expected result:

- The audio level meter reacts locally.

Common failures:

- macOS microphone permission denied.
- Wrong input selected.

## Start realtime listening

1. Click `Start Listening`.
2. Watch the debug panel and health indicator.

Expected result:

- `Realtime Health` moves through `Connecting`.
- `Realtime Debug` shows lifecycle entries such as:
  - `Start Listening clicked`
  - `microphone stream acquired`
  - `RTCPeerConnection created`
  - `audio track added`
  - `SDP offer created`
  - `backend SDP answer requested`
  - `SDP answer received`
  - `remote description set`
  - `data channel open`
- Realtime connection/data-channel states become non-default.

Common failures:

- Missing API key.
- Backend SDP failure.
- Invalid SDP answer.
- Data channel failed to open.

## Speak English test phrase

Say:

`Can you tell me about yourself?`

Expected result:

- `conversation.item.input_audio_transcription.delta` events appear.
- Partial transcript text appears in the `Live Transcript` panel.
- A completed transcript event finalizes the utterance.

## Speak French test phrase

Say:

`Pouvez-vous me parler de votre parcours ?`

Expected result:

- More delta/completed events appear.
- Final transcript text is visible in the transcript panel.

## Check debug counters

Open `Realtime Debug`.

Expected result:

- `Total events` increases.
- `Delta events` increases.
- `Completed events` increases.
- `Failed events` stays at `0` in a healthy run.
- `Generic error events` stays at `0` in a healthy run.

## Run assistant analysis

1. Click `Analyze last 30 sec`.

Expected result:

- Assistant analysis still works using transcript text.
- Russian summary and suggested answers appear.

## Stop listening

1. Click `Stop Listening`.

Expected result:

- Health changes to `Stopped` or `Idle` afterward.
- Transcript stays visible.
- Lifecycle log includes:
  - `Stop Listening clicked`
  - `media tracks stopped`
  - `peer connection closed`

## Confirm cleanup

Expected result:

- No crash after stopping.
- No new transcript events arrive after stopping.
- Audio is no longer being sent.

## Common failures

- `Microphone permission was denied. Grant access and try again.`
  Fix:
  Enable microphone access in `System Settings -> Privacy & Security -> Microphone`.

- `No selected audio input. Choose an input device before starting listening.`
  Fix:
  Select a valid input device first.

- `No transcription events were received after 20 seconds of listening.`
  Fix:
  Check microphone selection, actual speech input, network access, and debug connection states.

- Backend/OpenAI request failure
  Fix:
  Re-check `OPENAI_API_KEY`, network connectivity, and whether the OpenAI Realtime API is reachable.

# Manual speaker marking

Hold Space before speaking with the CoqPi Live window focused. Release after
finishing. For a long response, click **Говорю я**, switch to the call app and
click again in CoqPi when done. Recording remains active throughout.

- Final and unfinished original text retain `ME`/`OTHER` labels in local storage
  and export. Recorder-only mode without manual marking retains UNKNOWN.
- Only OTHER speech drives language changes, translation and answer requests.
  ME speech does not replace the current incoming question or reading prompt.
- When the optional MN7R Monitor bridge is enabled, only finalized OTHER speech
  can enter its live-preview payload. ME, partial and system items are removed
  before IPC and rejected again by the Monitor endpoint.
- Server VAD item IDs pin the role across delayed deltas/finals. Releasing Space
  does not relabel an already identified item. If marking begins during an
  active item, that whole item is conservatively excluded from assistant input.
- Space ignores editable fields and modified/composing keys. Repeated keydown
  does not toggle. Window blur releases a held key but preserves button mode;
  stopping or leaving Live releases the mode. Starting a new call resets IDs.
- There is no global plain-Space interception, microphone mute, biometric
  identification, audio splitting or provider change. Enter still activates
  focused controls while Space is reserved for speaker marking in Live.

Limitations: mark before speaking. If the first identifying STT/VAD event only
arrives after release, or both speakers share one uninterrupted VAD item, the
source cannot be inferred precisely. Leave a brief pause between turns and use
button mode for long replies. Already sent assistant requests cannot be undone.

Verification: `pnpm test:manual-speaker`; the built Electron
`test:conversation-ui` checks held/released Space, delayed final, button mode,
blur, editable-field typing, no extra assistant calls for ME, and archive labels.
No live microphone test is implied by these synthetic fixtures.

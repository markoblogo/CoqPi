# CoqPi Design Contract

## Design read

Reading this as a calm, local-first AI workbench for live conversations, preparation, training, knowledge, and opportunity workflows. The interface must make state, source, freshness, authority, and human decisions more legible than the model itself.

## Reference direction

Use [bitdrift live logs](https://bitdrift.io/use-cases/live-streaming) as a pattern reference: the event stream is the primary operational surface and visual styling is secondary to freshness and readability. Extract log hierarchy, timestamps, source identity, filtering, and live/paused state. Do not clone the green-terminal aesthetic.

## Dials

- Variance: low. Workflow location must remain predictable.
- Motion: very low. Repeated and keyboard-driven work should feel immediate.
- Density: medium-high, with progressive disclosure for diagnostics and configuration.

## Preserve

- Local-first behavior and explicit context selection.
- Clear boundaries between transcript, assistant inference, saved memory, evidence, and external action.
- Existing Live, Training, Transcribe, Prepare, Finder, Context, and Settings capabilities.
- Visible model, latency, cost, connection, permission, and recovery information where relevant.
- Human review before outreach, sending, adoption, or other consequential external actions.
- Multilingual transcript and answer semantics.
- Keyboard focus, compact desktop use, and reduced-motion support.

## Reconsider

- Equal visual weight across primary work, secondary context, QA, and debug controls.
- Repeated panels and status chips that fragment one state story.
- Long pages of configuration inside the same visual layer as live work.
- A transcript presented as passive text instead of a timestamped event stream.
- Suggested answers without nearby source/context scope and current assistant status.
- App-level component and stylesheet growth that makes visual behavior hard to govern.

## Primary information model

1. Session identity and selected context scope.
2. Realtime connection, recording/transcription state, and freshness.
3. Timestamped transcript/event stream with speaker and language identity.
4. Current assistant interpretation and suggested response.
5. Evidence/context used, omissions, confidence limits, and cost/latency.
6. Human action: copy, accept for the session, retry, edit, save, or reject.
7. Diagnostics and configuration behind progressive disclosure.

Every AI output surface distinguishes observed transcript, retrieved owner context, model inference, generated suggestion, saved artifact, and external action. “Ready” must say what is ready and for which action.

## Layout and components

- The Live surface should read as one coherent cockpit, not a grid of independent cards.
- Give the transcript/event stream the largest stable region.
- Keep current assistant output adjacent to the event that triggered it.
- Use a detail inspector for evidence, ignored context, costs, and diagnostics.
- Approval/action controls stay attached to the artifact they affect.
- Use tabular numerals for timestamps, latency, counters, and cost.
- Empty, waiting, stale, paused, disconnected, analyzing, blocked, and error states must be visually distinct and textually explicit.

## Color and type

- Preserve the current dark, restrained cyan system unless evidence supports a broader brand change.
- Accent indicates active focus or current process, not generic decoration.
- Success, warning, and danger colors require text/icon labels.
- Use the existing compact sans-serif UI stack; monospace is reserved for IDs, timestamps, logs, payloads, and code-like evidence.
- Avoid low-contrast secondary text on raised dark surfaces.

## Motion

- No animation for transcript navigation, keyboard actions, tab switching, or repeated suggestions.
- A short transition may explain new streamed content, panel origin, completion, or failure.
- Live state cannot depend on pulsing or motion alone.
- Respect `prefers-reduced-motion` without losing chronology or status.

## Responsive behavior

- Desktop/Electron is primary; compact widths must keep session state, transcript, and current action visible.
- Secondary inspectors may stack or collapse; primary chronology may not disappear.
- Long transcript, source paths, IDs, and generated text must wrap or scroll intentionally.
- Increased text size must not hide stop, retry, save, or approval controls.

## Anti-patterns

- Chat bubbles as the default representation for every artifact.
- Purple/blue AI gradients, floating glass cards, or ornamental “thinking” animation.
- Tool activity hidden behind a single spinner.
- Confidence implied through color without evidence.
- Generated text visually indistinguishable from observed transcript.
- Automatic sending or silent promotion of model output.

## Verification gate

Test the Live path with disconnected, connecting, listening, transcript-active, analyzing, answered, stale, blocked, and error states. Verify keyboard/focus, long multilingual copy, compact width, reduced motion, source/context disclosure, retry, copy/save, and human-gated actions. A screenshot does not prove realtime behavior.

## First redesign surface

Start with the `Live` cockpit. Reframe it around a primary transcript/event stream, a current assistant/action rail, and an evidence/status inspector. Do not redesign Training, Finder, or Settings in the same slice.

## Implemented slice

The first Live cockpit pass makes the transcript the wide primary pane, keeps assistant and answer artifacts in a narrower adjacent rail, and moves status/payload diagnostics behind the active work in visual order. The authority model and all existing controls remain unchanged; realtime and hardware behavior still require their own runtime proof.

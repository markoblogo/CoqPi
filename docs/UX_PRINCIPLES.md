# CoqPi UX Principles

## Primary use case

CoqPi is used during stressful interviews and professional calls. The interface must help the user react quickly, not study the tool.

## Core principles

- Reduce cognitive load.
- Keep the `Live Call` screen focused on critical information only.
- Favor short, readable answer blocks over dense prose.
- Keep destructive or costly actions explicit and manual.
- Show current health/status clearly at the top of the screen.

## Compact sidecar principle

- CoqPi must fit next to a video call.
- The default live screen must work around `700x560`.
- `Live Call` should avoid page-level scrolling.
- Internal panel scrolling is acceptable when transcript or answers grow.

## Compact utility interface

- CoqPi is not a dashboard.
- It is a sidecar control panel used during stressful calls.
- Primary design target: `720x500`.
- Mini target: `500x360`.
- At mini size, switch panes instead of showing everything.
- Live mode must avoid page-level scroll.
- Debug and profile context are hidden by default.
- Button labels should be short, with tooltips if needed.

## Visible-or-Hidden Rule

- In compact UI, an element must be fully usable or not visible.
- Never allow half-visible panels, folded accordions, squeezed controls, or decorative empty boxes.
- Use popovers, tabs, and active sections instead of squeezing.

## Winamp-Like Density Principle

- CoqPi should feel like a compact desktop utility, not a web dashboard.
- Primary target is functional density.
- Every pixel should serve transcript, comprehension, answer suggestion, or control.

## Visibility rules

- Transcript, meaning, suggested answers, and keywords stay primary.
- Debug details stay collapsed by default.
- Long notes, profile context, and privacy explanations stay secondary.
- Settings belong outside the main live cockpit.

## Cost and safety

- Assistant analysis stays manual-only.
- Repeated requests should be slowed by cooldowns and visible counters.
- Cost estimates are approximate warnings, not billing truth.

## Privacy

- The renderer should never receive secrets.
- Audio is sent only during active realtime listening.
- Audio is not saved by default.

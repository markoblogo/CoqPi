# Realtime Smoke Test

This is the current short path for the first real mic check. It matches the UI as of July 28, 2026.

## Before start

Confirm in the app:

1. API key is available.
2. A microphone input is selected.
3. One relevant pack is selected for the session.
4. The Test tab readiness card is at least `ready for mock`.

## Step 1: mock probe first

In `Test`:

1. Enable `Mock Transcript Mode`.
2. Add one short EN or FR line.
3. Run `Analyze 2m` or wait for auto-analysis.

Expected result:

- transcript gets a final `other` line;
- Assist/Answers shows a fresh answer;
- communication quality is not blocked.

If it fails:

- use the cockpit to see whether the issue is transcript scope, stale answer, payload drop, or provider failure.

## Step 2: check execution diagnostics

Before the real mic probe, read the `Real smoke execution` card.

It now shows:

- current stage health;
- first failure, if any;
- compact trace:
  - realtime status;
  - event counters;
  - transcript counts;
  - latest lifecycle/event entry.

Use `Capture current state` if you want to prefill the smoke note draft from the current failure path.

## Step 3: short real mic probe

1. Start realtime listening.
2. Say one short clear sentence in English or French.

Good test phrases:

- `Can you tell me about your product background?`
- `Pouvez-vous résumer votre expérience produit ?`

Expected result:

- local audio meter reacts;
- realtime enters `connecting` then `connected/listening`;
- transcript appears;
- if the line is eligible, assistant result becomes fresh.

## Step 4: if something goes wrong, identify the first failed stage

Use the execution card first, not the long debug area.

Typical first failures:

- `setup`
  - no permission or no input device;
- `realtime`
  - connection / SDP / transport error before stable transcript;
- `transcript`
  - audio seen but no transcript;
  - transcript seen but ignored as non EN/FR, too short, or low signal;
- `assistant`
  - transcript reached analysis but provider failed or answer stayed stale;
- `quality`
  - answer exists but selected context/payload/answer quality is not ready.

## Step 5: save one short smoke note

After the probe:

1. Review or edit `Worked / Broken / Next fix`.
2. Save the smoke note locally.
3. Optionally use `Copy report` for a short Codex summary.

Rules:

- do not paste transcript text into the note;
- capture the first concrete failure, not a long narrative;
- keep `Next fix` actionable.

## Recommended follow-up commands

If the issue looks like live-loop/payload logic:

- `pnpm test:live-loop-ui`
- `pnpm test:analyze-recent-transcript`

If the issue looks like pre-smoke/readiness/notes:

- `pnpm test:pre-smoke`

If the issue looks like Finder/context routing:

- `pnpm test:finder-prepare-live-ui`
- `pnpm test:governance`

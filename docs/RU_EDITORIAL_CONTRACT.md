# CoqPi Russian Editorial Contract

This contract is a compact local adaptation of Russian editorial patterns for CoqPi. It is a reference and review layer, not a runtime, provider, or mandatory rewrite stage.

## Scope

Apply this contract only to Russian-language text that CoqPi shows or stores locally:

- short Russian meaning/explanation blocks;
- Russian helper hints after finalized utterances;
- Russian UI microcopy, errors, empty states, confirmations, and labels;
- local mock/demo notes or operator-facing Russian guidance.

Do not treat this contract as permission to change live routing, provider choice, transcript capture, storage, or outbound behavior.

## Product fit

CoqPi is a stressful-call sidecar, not an editorial product. Russian text must help the user orient quickly under pressure.

Default target:

- short;
- concrete;
- scenario-first;
- neutral-calm;
- non-theatrical;
- easy to scan in 1-2 seconds.

## Allowed modes

### 1. Live fast lane

Use for the first Russian explanation after a finalized utterance.

Requirements:

- explain what was asked or meant;
- suggest the next response direction;
- preserve domain nouns and source facts;
- prefer compression over polish;
- never block on stylistic cleanup.

### 2. Post-utterance cleanup

Use after the immediate live response is already available.

Allowed:

- remove Russian bureaucratic phrasing;
- shorten bloated clauses;
- replace vague filler with concrete wording when the fact is already present;
- make the next action clearer.

Not allowed:

- add new facts, promises, deadlines, or channels;
- change the business meaning of the source utterance;
- turn a short assist message into a mini article.

### 3. UI copy

Use for buttons, status text, errors, empty states, and confirmations.

Rules:

- scenario before screen copy;
- button names the action;
- error says what happened and what to do next;
- avoid blaming the user;
- if nothing needs action, prefer silence over noise.

## Russian voice baseline

Unless a more specific local sample is approved, Russian text should:

- sound calm and competent, not literary;
- avoid promo language, pathos, and fake urgency;
- prefer plain verbs over abstract nouns;
- keep one idea per sentence where possible;
- preserve English/French source terms when translation would reduce accuracy.

## No-fabrication boundary

Russian cleanup must not invent:

- what the counterparty meant beyond the evidence;
- product or company facts absent from context;
- timelines, promises, follow-up channels, or legal consequences;
- emotions or intent stated as fact;
- domain detail that came only from model habit.

If a useful detail is missing, ask a short question or mark the gap implicitly by staying narrow.

## Russian anti-slop checks

Flag and rewrite only when they harm speed or trust:

- empty intensifiers and inflated framing;
- "not X but Y" contrast used as a template;
- bureaucratic or translated-sounding wording;
- long lead-ins before the actual meaning;
- repeated softeners that hide the point;
- UI labels that describe the system instead of the action.

Do not "humanize" by adding chatter, jokes, or personality drift.

## CoqPi-specific guardrails

- Live call usefulness is more important than editorial completeness.
- Russian assist text must stay shorter than a normal paragraph by default.
- Mixed-language flows may keep key English/French phrases verbatim.
- Translation accuracy beats stylistic elegance.
- If live and polished variants conflict, keep the live variant.

## Good outcome

A good CoqPi Russian output lets the user grasp:

- what just happened;
- what the likely intent was;
- what they can say or do next.

Anything beyond that is optional.

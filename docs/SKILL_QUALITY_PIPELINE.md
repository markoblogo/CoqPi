# Skill Quality Pipeline

This is an optional local protocol for improving CoqPi prompt/skill behavior from controlled evidence. It adapts the useful SkillOpt pattern without installing SkillOpt or enabling automatic self-editing.

## Allowed Targets

- call-assist prompt skills;
- translation and short meaning prompt skills;
- mock transcript analysis prompts;
- future partner/job/investor finder prompts.

## Required Evidence

Each candidate update needs:

- task ID;
- synthetic or explicitly recorded mock transcript input;
- current skill/prompt version;
- trajectory or run-note reference;
- verifier;
- score;
- failure class;
- bounded edit operation: `add`, `delete`, or `replace`.

## Acceptance Gate

A candidate can be accepted only when:

- a held-out or independently selected mock set improves;
- live-call privacy, consent, key handling, and provider-governance rules remain intact;
- realtime latency and UI readability are not degraded;
- owner acceptance is explicit.

Rejected edits must be recorded with reasons. `best_skill.md` may be exported only after validation and acceptance.

## Non-Goals

- no automatic prompt mutation;
- no live-call transcript harvesting;
- no use on live calls without a separate consent/privacy gate;
- no outbound messaging or production routing;
- no provider change or model route change by this protocol alone.

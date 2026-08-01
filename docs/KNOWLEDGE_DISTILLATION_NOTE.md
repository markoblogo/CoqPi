# Knowledge Distillation Note

CoqPi may use knowledge distillation for compact pre-call and post-call context.
It must not become an automatic memory collector for live conversations.

This note is based on the capture/classify/recall/synthesize pattern in
`norrietaylor/distillery`.

Source: https://github.com/norrietaylor/distillery

## Allowed

- capture owner-approved call decisions, partner context, relationship state,
  follow-up facts, and useful language patterns;
- classify each note before it becomes durable local memory;
- deduplicate against existing participant or target context;
- recall only selected eligible notes for a Prepare or Live session;
- synthesize pre-call packets and post-call recaps from cited local entries.

## Not allowed

- raw live transcript retention by default;
- automatic memory creation during a call;
- hidden cross-project memory transfer;
- broad email/file/web ingestion into call context;
- external outreach or follow-up from distilled notes;
- storing sensitive call material without owner review.

## Entry receipt

Every durable distilled note should record:

- `entry_id`;
- `target_id`;
- `source_kind`;
- `source_ref`;
- `captured_at`;
- `classification`;
- `sensitivity`;
- `retention`;
- `dedup_status`;
- `owner_confirmed`;
- `eligible_for_session_context`.

## Session use

Before a distilled note enters Prepare or Live:

- it must be selected for that session;
- it must fit the target/person/project scope;
- it must pass the privacy gate before external model use;
- weak matches must abstain instead of inventing continuity.

Knowledge distillation supports CoqPi's selected-context layer; it does not
replace owner review.

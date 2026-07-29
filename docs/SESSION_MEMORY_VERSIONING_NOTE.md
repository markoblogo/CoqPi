# Session Memory Versioning Note

## Purpose

This note adds reversible memory-mutation semantics to CoqPi's existing
session-memory boundary.

CoqPi may keep reviewed session memory, but corrections and promotions should
be auditable and reversible rather than silent overwrites.

## Allowed scope

The scope remains session-bounded:

- one call;
- one prep window;
- one post-call review window;
- one explicitly approved rehearsal or demo segment.

Versioning applies only to retained session artifacts and approved follow-up
memory derived from that scope.

## What may be versioned

- session summaries;
- action items;
- reviewed transcript-derived notes;
- approved people/company context updates;
- redacted evidence references;
- operator-facing decision notes.

Do not treat raw ambient desktop history as versioned CoqPi memory.

## Core adaptation

Use compact versioning semantics:

- snapshot before a material correction or promotion;
- keep working memory separate from approved durable memory;
- quarantine contradictions instead of silently replacing them;
- allow rollback when review finds a wrong or unsafe retained note.

This is a governance layer, not a new storage product.

## Minimal mutation receipt

```text
mutation_id:
session_scope:
memory_class: working | session | approved_follow_up
operation: create | append | correct | quarantine | rollback | promote
reason:
source_evidence:
prior_version:
new_version:
review_owner:
```

## Promotion boundary

Only reviewed session memory may be promoted into a longer-lived operator or
contact/company memory layer.

Promotion should require:

1. explicit session relevance;
2. reviewed evidence;
3. redaction/minimization if sensitive fields appear;
4. clear owner approval when the note outlives the session.

## Contradiction handling

If a retained session fact conflicts with an existing durable note:

- do not silently overwrite;
- create a review candidate or quarantine state;
- keep the prior approved version until the conflict is resolved.

## Rollback boundary

Rollback is allowed for:

- mistaken transcript interpretation;
- misattributed action item;
- wrong counterparty fact;
- overshared or insufficiently redacted note;
- accidental promotion beyond session scope.

Rollback does not erase the review trail; it creates a later corrective event.

## Boundary summary

CoqPi may use narrow, session-scoped, reversible memory updates.

It may not become a free-form long-term memory runtime or silent memory
rewriter.

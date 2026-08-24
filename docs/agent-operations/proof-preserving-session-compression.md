# Proof-Preserving Session Compression v0.1

## Purpose

Reduce selected CoqPi context before assistant analysis or handoff while preserving the session's active goal, selected source IDs, exact owner facts, constraints, scenario, open questions, retrieval receipts, and abstentions.

This is a local, session-scoped projection. It is not ambient memory, a realtime STT feature, a broad retriever, or automatic durable-memory promotion.

## Allowed inputs

- selected `L0`, `L1`, or explicitly opened `L2` context;
- approved session notes and reviewed transcript chunks;
- selected counterparty packs and their provenance fields;
- existing retrieval trajectory and dropped-item reasons.

Unselected packs, unresolved links, raw source stores, unrelated desktop material, and credentials stay out of the compression input.

## Preservation contract

`KEEP` all owner facts, role/company names, dates, numbers, language, selected IDs, scope, privacy, retrieval readiness, missing fields, abstentions, and approval state.

`REMOVE` only exact duplicate or ceremonial wording that cannot affect the answer.

`FLAG` any uncertain merge, paraphrase, stale claim, or change to a session boundary. Do not silently rewrite owner facts or convert a missing field into a guess.

## Output

The compressed artifact must retain:

```text
session_id
purpose
selected_pack_ids
dropped_pack_ids_with_reason
levels_touched
final_sources_used
abstentions_or_missing_fields
source_digest_or_manifest_hash
flags_for_owner_review
```

The assistant may use the projection only for the same bounded session or approved follow-up. It must ask for clarification or abstain when the compressed context no longer supports a reliable answer.

## Verification

Record source and output counts, compare selected IDs and sacred fields, and retain a removal log. The projection is `PROPOSED` until review; it never promotes itself to durable memory or sends data to an external provider.

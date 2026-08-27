# Selected Context Tiers Contract

CoqPi adapts a compact OpenViking-style idea for the local selected-context
system: tiered loading, retrieval trajectory, and basic retrieval observability.

It does not add a context server, vector database, background reindexer, or
automatic broad source ingestion.

## Tiered selected context

Only selected profile/session/pack/draft context may enter assistant analysis.

Use three levels:

- `L0` — session abstract: current role, goal, selected pack IDs, selected
  draft ID, weak-field summary, and dropped-pack reasons;
- `L1` — pack overview: pack summary, context field, links, quality state,
  source ID, and retrieval readiness;
- `L2` — detail: exact extracted fields or bounded facts from explicitly
  selected readable sources only.

Default rule:

```text
session filter -> L0 active set -> L1 pack review -> L2 exact facts only when needed
```

Unselected packs, folder pointers, unresolved links, and raw source stores stay
out of all three levels.

## Retrieval trajectory receipt

Each non-trivial assistant/context pass should be explainable with:

```text
retrieval_id:
session_id:
purpose:
selected_pack_ids:
dropped_pack_ids_with_reason:
levels_touched:
packs_opened:
final_sources_used:
abstentions_or_missing_fields:
```

This is a short operational receipt, not hidden reasoning. It is meant to show
why one pack was used, another was dropped, and whether the assistant had to
abstain because context was weak or out of scope.

## Retrieval observability

The UI or local receipts should surface at least:

- selected pack count;
- dropped/disabled/missing pack count;
- current retrieval provider;
- weak/stale pack warnings;
- whether the final answer relied only on `L0`, on `L1`, or required `L2`;
- blocked reason when no eligible pack can be used.

Useful examples:

- selected pack is no longer retrieval-ready;
- pack scope is wrong for the current call;
- selected outreach draft is stale or missing;
- only `future_vector` candidate-set metadata was available;
- exact fact required `clarify_or_abstain`.

## Practical use in CoqPi

This is intended for:

- live assistant runs;
- session prep and smoke status;
- counterparty-pack selection;
- compact review of whether context was too broad or too thin.

## Boundary

- no broad folder read or hidden source expansion;
- no inclusion of unselected packs;
- no automatic promotion of session state into durable memory;
- no external provider, outreach, or call authority from retrieval success.

## Optional local model worker

CoqPi can exercise the local MPS worker without changing the production
provider route:

```sh
pnpm local-model:smoke
```

The worker receives only the selected fixture/context supplied by the caller,
returns a read-only receipt, and does not promote answers into memory. Start
it from the shared local-models checkout with `python3 local_model_worker.py`.
The local route is experimental and is not a replacement for the existing
OpenAI/Ollama governance path until separately evaluated.

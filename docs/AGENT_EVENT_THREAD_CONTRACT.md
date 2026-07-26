# CoqPi Agent Event Thread Contract

CoqPi adapts selected `12-factor-agents` ideas to the local call-assist product. This is a product contract, not an agent framework.

## Adopted principles

### Own the context window

Only selected, explicit context may enter assistant analysis:

- profile context;
- current session fields;
- selected counterparty packs;
- selected outreach draft when present;
- bounded route and receipt metadata.

Raw source stores, broad folder scans, and unselected packs stay out of the active context.

### Tools as structured outputs

Assistant steps and supporting flows should resolve to typed local artifacts:

- extraction previews;
- pack summaries;
- governance receipts;
- smoke notes;
- candidate review fields;
- route metadata.

Free-form hidden state is not a contract.

### Unify execution state and business state

Where possible, CoqPi should let the retained event thread explain both:

- what the user is doing now;
- what the system already did;
- why a pack/source/draft is included or excluded;
- whether the assistant is fresh, stale, blocked, or waiting.

Do not introduce a second opaque orchestration model when event and receipt history already explains the state.

### Pause/resume and own control flow

The product should pause cleanly around:

- human approval;
- source review;
- pack selection;
- draft review;
- provider failure or deferred retry;
- smoke-test interruption.

Resume should come from retained local state, not from assuming one uninterrupted loop.

### Compact errors into context

Errors should be short, local, and actionable:

- reason;
- affected step;
- next action;
- optional retry path.

Do not widen live-call errors into verbose framework diagnostics.

### Small, focused agent behavior

CoqPi is a local call assistant, not a general assistant platform. It should stay focused on:

- comprehension;
- response support;
- bounded prep context;
- local review of partner/job/investor leads.

### Stateless reducer test

Use this as an architectural check:

- can the next assistant step be derived from retained session state and event history;
- can a paused flow resume without hidden in-memory control state;
- can a review or route decision be reconstructed from persisted local evidence.

If not, the flow is too implicit.

## Boundary

This contract does not authorize:

- outbound communication;
- autonomous agent loops;
- broad source ingestion;
- background learning;
- hidden long-running orchestration;
- framework-driven rewrite of the current product.

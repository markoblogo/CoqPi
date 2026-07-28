# Knowledge Console Boundary

`CoqPi` may later use a local knowledge-console surface inspired by tools like
Open WebUI, but only as a bounded operator layer around already-reviewed
context.

This is not a broad RAG appliance, not a shared team memory, and not authority
to change the live call-assist workflow.

## Allowed role

Use a knowledge console only for:

- reviewed document ingestion previews;
- selected-pack and retrieval sanity checks;
- synthetic or owner-reviewed context experiments;
- compare-only local model/retrieval evaluation;
- operator inspection of provenance, eligibility, and extraction quality.

## Required boundaries

- local-only by default;
- read/review-first, not write/action-first;
- retrieval limited to selected eligible packs;
- no broad folder or web auto-ingestion;
- no hidden memory promotion from console usage into live assistant context;
- no outbound messages, partner contact, or workflow execution;
- no replacement of governance receipts, smoke notes, or selected-context audit.

## Good fit

Good uses:

- verify that a reviewed PDF/DOCX/HTML file extracts into the expected compact
  fields;
- inspect whether a selected pack would surface the right facts before a live
  session;
- compare two retrieval or extraction approaches on synthetic or reviewed
  source packs.

Bad uses:

- live realtime call assist;
- autonomous crawling/searching at scale;
- uncontrolled personal knowledge accumulation;
- using console chat history as a silent long-term memory layer.

## Minimal workflow

Keep the loop small:

```text
select reviewed source -> preview extraction -> verify retrieval scope ->
record receipt or issue -> return to governed CoqPi flow
```

If a console experiment produces a useful change, promote it through normal
docs/contracts/tests, not through console state.

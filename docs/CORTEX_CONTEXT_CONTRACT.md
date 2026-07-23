# Cortex Context Contract v0

## Purpose

CoqPi is the local call cockpit. Cortex is the future local owner of personal context, source admission, extraction, and derived context packs.

This version creates a local shared-RAG ingress manifest. It does not create a retriever, vector store, source watcher, link crawler, provider call, or automatic promotion.

## Source manifest

The ingest contract uses a local event log (`coqpi-ingress.events.jsonl`) plus a normalized manifest:

- `manifest.json` (canonical contract state)
- `coqpi-context-pack.manifest.md` (human-readable snapshot for easy review)
- `coqpi-context-pack.history.jsonl` (append-only local change history with hash chaining)
- `--validate` preflight before handoff can be executed with `pnpm dump-manifest -- --validate`.

`manifest.json` is gitignored in normal operation but keeps a compact, explicit contract per source:

- source ID and creation timestamp;
- source kind: `link`, `file`, `folder`, or manually supplied `path`;
- local location or public URL;
- optional local label;
- provenance: a stable ingress source ID and locator SHA-256;
- `pending` classification and a `coqpi_pending_classification` retrieval scope;
- manual-deletion retention/TTL;
- `explicit_audit_required` promotion boundary.

The manifest does not contain file contents, folder inventories, parsed metadata, transcript text, profile data, credentials, or hidden reasoning. `contentHash` is deliberately `null` while a record is pending classification: content has not been read, so a content hash cannot honestly exist.

History lines are appended for each local state mutation and include action, timestamp, manifest hash, previous hash, and optional local git `HEAD` for audit correlation.

## Snapshot handoff for Cortex

For local synchronous handoff, CoqPi exposes a dedicated export snapshot (no UI flow needed):

- `pnpm dump-manifest -- --dump-manifest`
- `pnpm dump-manifest -- --handoff` (runs validate and snapshot in one flow)

The snapshot includes:

- current `manifest.json` contract,
- optional append-only history lines from `coqpi-context-pack.history.jsonl`,
- `manifestHash`,
- optional `signature` when `--sign` is used.

Signing key resolution:

- `--key <value>` CLI parameter or `COQPI_CONTEXT_PACK_SIGNING_KEY` env var.
- Before handoff, Cortex sync should prefer running `--validate` on the same directory first.

## Explicit admission boundary

Adding a source is an explicit desktop action. Choosing a file or folder returns only the path selected in the native dialog. CoqPi records the ingress metadata but does not inspect it.

Links are accepted only as `http` or `https` pointers. CoqPi does not fetch them in this version. Pending records are never sent to OpenAI or another provider.

Folder monitoring, recursive scanning, authenticated social links, cloud drives, and automatic refresh are out of scope.

## Shared RAG lifecycle

The future adapter may consume selected manifest entries through this narrow contract:

```text
CoqPi Context Sources (owner-created ingress records)
  -> pending classification / CoqPi-only scope
  -> explicit local content capture and content hash
  -> explicit audited promotion to Cortex personal context
  -> scoped retrieval or later compact context-pack export
```

Cortex will own post-promotion classification, retention enforcement, extraction, redaction, and shared-RAG retrieval. CoqPi may remain the first ingress UI, but cannot promote a record, expose it to another tenant, or make it eligible for an external action.

CoqPi's future read use case is personal English/French interview and self-presentation assistance. Retrieval must be limited to personal-call records with an explicit CoqPi scope. When no suitable, current context is available, CoqPi must request clarification or offer a neutral clarification answer instead of inventing owner facts.

CoqPi may later append structured interview artifacts only: company, role, date, owner-confirmed outcomes, follow-ups, and source/provenance references. Raw audio and full transcripts remain out of scope. CortexABV may append evidence-backed owner/project facts and approved public/project updates. Neither writer may promote personal interview material to corporate Cortex, project tenants, public surfaces, or external actions without an explicit per-surface approval record.

## Observability and safety

This manifest is local state, not a provider/tool route and not part of the realtime STT hot path. It produces no governance receipt because no provider request, filesystem content read, or external side effect occurs.

When classification or promotion exists, Cortex must create an append-only, allowlisted receipt. It may record owner/source IDs, provenance digest, classification, retention, scope, decision, reason, and derived pack ID; it must not record source contents, local paths, PII, credentials, transcript text, or hidden reasoning.

## Explicit file capture and EN/FR retrieval

The current capture action is deliberately narrow. The owner must select `Capture & classify` for one `file` record. CoqPi then reads that file locally, calculates its SHA-256, and records a private append-only capture event. Only `.md`, `.txt`, `.csv`, and `.json` files up to 10 MB may produce a local text excerpt for retrieval in this phase.

### Counterparty/context packs (finder-ready compact packets)

Finder and other local adapters may emit compact context packs for a specific opportunity/person. These packets are ingested directly to `manifest.counterpartyPacks` via the CoqPi context API and remain in the same local manifest and history.

Each packet is explicit, scoped, and selected-at-ingest by default. Ingestion stores only compact text fields (partner, role/title, summary/context), content hash, sourceId, provenance digest, scope (`coqpi_interview_en_fr`) and retention metadata. No raw transcripts or binary file contents are stored.

Finder/search adapters may pass compact packets in batch using the same field contract as finder JSON objects:

- `kind`: `job | partner | investor | accelerator | other`
- `sourceId`: stable external ID or key
- `partnerName`, `title`, `summary`: required
- `context`: optional compact notes
- `links` or `linksText`: optional array or newline-separated links
- `selected`: optional boolean (default true)

Batch ingest is exposed as:

- `context-packs:ingest-finder-batch` (IPC) with payload: `unknown[]`
- `ingestCounterpartyFinderPayloadDrafts` on service layer

On ingest, malformed packets are reported in `counterpartyPayloadIngestSummary.errors` and do not fail the whole batch.

Selected counterparty packs participate in retrieval for EN/FR interview/self-presentation analysis. If no suitable packet is found, the assistant is instructed to ask a concise clarification question instead of inventing counterparty-specific facts.

The EN/FR retrieval contract is now explicit:

- `contextPackRetrievalKinds` is the strict allowlist for pack kind filtering.
- `selectedCounterpartyPackIds`, when non-empty, is a strict candidate allowlist: retrieval may use only these packs and does not auto-expand to other selected packs.
- `retrievalProvider` is a pluggable provider selector for the retrieval path with supported values `legacy | future_vector` (currently routed to `legacy`).

Stored counterparty packs are also normalized as versioned compact records before they can enter retrieval:

- `version: 1`, stable `sourceId`, provenance digest, `contentHash`, private classification, TTL/retention, and `coqpi_interview_en_fr` scope are required.
- UI state, session save/load, and assistant analysis revalidate `selectedCounterpartyPackIds` against the current manifest.
- Disabled, removed, duplicate, missing, non-private, non-`retrieval_ready`, wrong-version, or wrong-scope packs are pruned before the assistant prompt is built.
- Finder outreach drafts are session-linked by draft ID only. The selected draft is resolved from local Finder source truth and compacted for assistant consistency; it is not treated as proof that a message was sent.
- Finder `manual_mock` runner output is local candidate scaffolding only. It may enter review/scoring/import flows, but it is not evidence of a real external opportunity until the owner adds source links or other reviewed provenance.
- Finder `owner_paste_v0` source adapter output is owner-provided evidence normalization only. URL strings are not fetched; pasted URLs, vacancy snippets, LinkedIn-style job snippets, accelerator/program snippets, investor/fund lists, and CSV-like exports first become a no-write preview with common field extraction for company/partner, role/opportunity, location, contact, deadline, relevance, and missing information. Selected/owner-edited candidates are then appended as deterministic source-ID records and remain private/local until explicitly imported into session packs.
- Finder scoring is local and deterministic. It may derive scenario-aware `fitScore`, `missingInfo`, `nextAction`, and public score explanations from compact extracted fields, but owner-provided review fields remain authoritative and no external scoring service is called.
- Knowledge source adapters are explicit local contracts: owner profile/CV file, counterparty material file, public profile link, company/respondent link, and local folder pointer. Only readable file adapters can be captured after explicit owner selection; link and folder adapters remain provenance pointers and must not be fetched, scanned, or exposed as raw content.
- Knowledge ingestion readiness is a local contract summary, not a retrieval engine. It records source lifecycle, classification state, retention expiry, pointer-only boundaries, pack quality, and future vector candidate-set readiness without reading unsupported source contents.
- Knowledge extraction preview is metadata-first and compact in this phase: title, adapter type, classification, missing fields, retrieval readiness, extraction mode, provenance hash, and deterministic fields from explicitly captured readable `.md`, `.txt`, `.json`, or `.csv` files. It must not fetch URLs, scan folders, call an LLM, upload raw content, or expose unsupported source contents.
- The shared eligibility helper exposes stable blocking reasons (`wrong_version`, `not_selected`, `not_retrieval_ready`, `wrong_owner`, `not_private`, `missing_interview_scope`) and the UI surfaces the same session-readiness text before a call.
- Raw candidate artifacts such as transcripts, HTML, binary contents, credentials, or unreviewed source text are not preserved in compact pack events.

Folders, manual paths, links, binary files, PDFs, office documents, external URL fetching, and recursive scans remain pending. They cannot enter retrieval merely because they were recorded as ingress.

Assistant retrieval is limited to sources explicitly captured into `coqpi_interview_en_fr`. It is a compact local keyword retrieval for English/French interview and self-presentation guidance. If it finds no eligible evidence, the assistant prompt requires a concise clarification or neutral answer instead of an invented personal fact. The core excerpt is read only after assistant analysis begins; it is never used by the realtime audio hot path.

## Manual verification

On 2026-07-20, an owner-selected plaintext CV was explicitly captured, classified `private`, and marked `retrieval_ready` for `coqpi_interview_en_fr`. In Mock Transcript Mode, English interview prompts produced assistant suggestions grounded in the scoped CV context. No unsupported source type, folder, URL, external fetch, or live-call accuracy claim was validated by that check.

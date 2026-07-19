# Cortex Context Contract v0

## Purpose

CoqPi is the local call cockpit. Cortex is the future local owner of personal context, source admission, extraction, and derived context packs.

This version creates a local shared-RAG ingress manifest. It does not create a retriever, vector store, source watcher, link crawler, provider call, or automatic promotion.

## Source manifest

The manifest is stored locally at `data/context-sources/manifest.json` and is gitignored. Each entry is owned by the local owner and contains only:

- source ID and creation timestamp;
- source kind: `link`, `file`, `folder`, or manually supplied `path`;
- local location or public URL;
- optional local label;
- provenance: a stable ingress source ID and locator SHA-256;
- `pending` classification and a `coqpi_pending_classification` retrieval scope;
- manual-deletion retention/TTL;
- `explicit_audit_required` promotion boundary.

The manifest does not contain file contents, folder inventories, parsed metadata, transcript text, profile data, credentials, or hidden reasoning. `contentHash` is deliberately `null` while a record is pending classification: content has not been read, so a content hash cannot honestly exist.

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

# Session Memory Boundary

## Purpose

This document defines the narrow memory shape CoqPi may adopt from tools such as
ScreenPipe without becoming an always-on desktop memory system.

CoqPi is a session assistant, not a continuous life-logging product.

## Allowed memory unit

The allowed unit is a bounded session:

- one call;
- one prep window;
- one review window after the call;
- one explicitly approved demo or rehearsal segment.

Memory is attached to that unit and should not silently widen into full-day,
full-device, or ambient operator recall.

## What may be captured

Allowed session-scoped inputs:

- finalized transcript or reviewed transcript chunks;
- explicit session context fields already in CoqPi;
- selected counterparty packs and approved local notes;
- user-approved screenshots, screenshare-derived notes, or bounded UI evidence
  from the active session;
- reviewed post-call action items and decision notes.

## What is not allowed by default

Do not treat CoqPi as:

- a 24/7 screen recorder;
- an ambient microphone logger;
- a keyboard or clipboard capture tool;
- a passive memory of unrelated apps or browser tabs;
- a background recall layer for the whole computer;
- an autonomous agent that acts from session memory without owner review.

## Capture boundary

If screen or UI evidence is ever included, it must be:

- session-bounded;
- explicitly approved for that task;
- reduced to the smallest useful evidence shape;
- redacted before durable persistence when sensitive fields are visible.

Accessibility-first extraction, structured UI text, or local screenshot OCR are
allowed as donor ideas. They are not permission to enable continuous desktop
capture.

## Persistence boundary

Allowed durable outputs:

- reviewed transcript artifacts;
- session summaries;
- action items;
- decision notes;
- selected people/company context updates;
- redacted evidence references with timestamps.

Do not persist by default:

- raw full-session screen video;
- unrelated desktop history;
- keyboard logs;
- clipboard history;
- raw sensitive screenshots when a redacted note is enough.

## Privacy and consent

CoqPi may only retain session memory when:

1. the recording or transcript scope is explicit;
2. the retained artifact serves the active session workflow;
3. sensitive material is minimized or redacted before persistence;
4. the result stays local/private unless a separate export path is approved.

Live calls, partner discussions, employer conversations, and investor calls are
especially sensitive. Default to the narrowest retention mode.

## Retrieval boundary

Session memory retrieval must remain:

- selected;
- reviewable;
- explainable;
- scoped to the active session or its approved follow-up.

CoqPi should retrieve:

- what matters for the current call or post-call review;
- why an item was included;
- what was dropped or unavailable.

It should not become a general “search my whole desktop past” product surface.

## Scheduled analysis boundary

Report-only scheduled analyzers are allowed only for bounded session artifacts,
for example:

- post-call recap;
- unresolved follow-up checklist;
- weak-field detection in retained notes;
- reviewed contact/company memory suggestions.

They must not:

- capture new ambient data;
- message anyone;
- update durable memory automatically;
- widen authority beyond proposal or review.

## Donor ideas worth adapting

- session-scoped searchable local memory;
- structured UI/context evidence instead of raw video dependence;
- redaction before persistence;
- local evidence store with explicit retrieval receipts;
- report-only analyzers over reviewed session artifacts.

## Donor ideas rejected here

- 24/7 desktop capture;
- keyboard and clipboard memory;
- full ambient personal recall;
- autonomous pipes acting from memory;
- cloud-first or external-memory assumptions;
- using unrelated desktop activity as implicit call context.

## Boundary summary

CoqPi may adopt a narrow, local, session-scoped memory layer.

It may not adopt an ambient desktop-memory runtime.

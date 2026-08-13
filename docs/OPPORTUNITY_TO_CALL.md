# Opportunity-to-Call Runbook

## Implemented path

`Finder job -> provider discovery -> reviewed candidate -> application pack -> Gmail draft -> batch approval -> send -> linked reply -> Calendar proposal -> Prepare/Live`

The workflow is local and single-user. Search never starts email sending. Gmail and Calendar writes require separate owner actions.

## One-time setup

1. Add `BRAVE_SEARCH_API_KEY` to `.env` for general fund, accelerator, grant, partner, and vacancy search.
2. Create a Google OAuth desktop client and add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`.
3. Restart CoqPi. In Finder -> Opportunity to call, connect Gmail. Connect Calendar only when call scheduling is needed.
4. Optional JobSpy: install JobSpy in a separate Python environment and set `COQPI_JOBSPY_PYTHON` to that interpreter. It is not required for the main flow.

Secrets stay in Electron main. Google tokens are encrypted with Electron `safeStorage`. Disconnect removes local tokens and does not delete Gmail or Calendar data.

## Search

1. Create a normal Finder job with a narrow query and goal.
2. Select it in Opportunity to call.
3. For job searches, optionally enter explicit Greenhouse board slugs or Lever site slugs. General Brave discovery works without these.
4. Run real discovery and review provider, source confidence, evidence, URL, and duplicates before importing or preparing anything.

Daily jobs run only while CoqPi is open. Startup performs at most one catch-up per job and local date. Search run history contains operational query/provider/count/error data and never starts outreach.

## Prepare and contact

1. Select one candidate.
2. Enter only verified owner facts relevant to this target and facts/topics to avoid.
3. Assemble the application pack. `needs_review` means the target cannot enter Live yet.
4. Review recipient, subject, body, and attachment paths; save a local draft.
5. Create a Gmail draft and inspect it in Gmail.
6. Select exact drafts and approve them. Editing recipient, subject, body, or attachments changes the hash and invalidates approval.
7. Press Send approved batch. The daily limit is 20; partial failures remain per-message and do not mark failed items contacted.

First manual test should be one draft sent to the owner's own address. Real 2-3 recipient batches come only after that succeeds.

## Replies and calls

1. Check linked replies. CoqPi requests only stored Gmail thread IDs; it does not scan the inbox.
2. Review the compact classification and create a local reply draft if needed. Sending again uses the same approval path.
3. For a proposed call, review date, timezone, attendees, and meeting link. Save a Calendar proposal.
4. Connect Calendar separately, then confirm the exact proposal hash to create the event.
5. Use the reviewed application pack, reply summary, and Calendar proposal in the session. Live receives only the selected opportunity handoff and must abstain when facts are insufficient.
6. After the call, use the Post-call section to save an owner-confirmed session summary, then prepare a local follow-up draft from that summary and the same application pack. Sending still requires the normal hash-bound approval.

## Storage and privacy

- `opportunity-store.v2.json`: local jobs, candidate metadata, compact evidence, application packs, local drafts, approvals, thread summaries, and Calendar proposals.
- `opportunity.events.jsonl`: append-only operational history.
- Full mailbox contents, OAuth tokens, raw CV files, transcripts, prompts, and hidden reasoning are excluded from governance receipts.
- Local mail drafts contain the reviewed message body because the user must edit and approve it; receipts contain only route metadata and hashes.

## Verification

```bash
pnpm test:opportunity-to-call
pnpm test:finder-outreach-pipeline
pnpm test:finder-prepare-live-ui
pnpm test:knowledge-retrieval
pnpm test:live-loop-ui
pnpm typecheck
pnpm lint
pnpm build
```

Manual acceptance still required:

1. Brave vacancy search and accelerator/fund search with real links and no duplicate queue entries.
2. Google OAuth plus Gmail draft and send-to-self.
3. Approved 2-3 recipient batch with one intentionally failing item to observe partial results.
4. Reply -> Calendar proposal -> Prepare -> mock transcript -> short real call.

# Continuous Review Boundary

CoqPi is allowed to use an optional continuous-review helper because assistant,
context, IPC, and provider-boundary changes can compound quickly in local
iteration.

## Allowed modes

- `manual` review runs are allowed;
- `pre-push` or `before-pr` branch review is allowed;
- `post-commit optional` is allowed only as a local developer choice.

Current local helper:

- `Open Code Review` (`ocr`) may be used as the second reviewer on a diff
  before push or PR;
- default target is the current working diff or a branch range, not the whole
  repository;
- `scan` is reserved for unfamiliar or high-risk files only.

## Not allowed by default

- no mandatory daemon for every session;
- no automatic PR comments on first adoption;
- no auto-fix or auto-commit loop as a repository requirement;
- no replacing governance receipts, smoke checks, or selected-context review
  with review-tool output.

## Preferred use

Use it when touching:

- provider/realtime boundaries;
- context-source capture and selected-pack retrieval;
- IPC and session-state behavior;
- governance receipts, failover, or assistant routing.

Expected role:

- precise local findings with file/line anchors;
- fix-or-reject with reason;
- still run governance receipts, smoke checks, and selected-context review.

Skip it for:

- docs-only edits;
- Russian editorial-only changes;
- local content/prose changes with no behavior impact.

# Chat Surface Boundary

CoqPi may eventually expose a chat-facing assistant surface, but only within a
very narrow boundary.

## When it is допустимо

Chat-bot architecture is acceptable only when all are true:

- the surface is owner-controlled, private-test, or explicitly scoped for one
  reviewed user class;
- the assistant remains `read` or `proposal` authority only;
- sources are bounded to selected profile/session/pack/draft context;
- unsupported requests can cleanly abstain or hand off;
- no hidden broad retrieval or background learning is introduced.

Good candidate surfaces:

- owner-only private test chat;
- bounded prep/support chat over selected packs;
- read-only research or rehearsal chat with explicit context selection.

## When it is not допустимо

Chat-bot architecture is not acceptable when it would imply:

- autonomous outreach or messaging;
- joining calls or controlling other apps;
- hidden access to broad personal archives;
- unreviewed customer/support deployment;
- plugin-driven capability expansion without separate review;
- a replacement for the existing local cockpit when structured UI/state review
  is still necessary.

## CoqPi default

The current default remains:

- local cockpit first;
- selected-context review first;
- proposal/hint assistance first;
- no external chat channel by default.

If a later chat surface is explored, it should begin as:

- `owner_only_chat` or `private_test_chat`;
- `authority: proposal`;
- `retention: local`;
- `unsupported -> clarify_or_abstain`.

## Boundary

- no Telegram/WhatsApp/Discord/Slack deployment by default;
- no plugin marketplace adoption by default;
- no channel integration as a substitute for the current UI/state model;
- no widening from local call assistant to general messaging bot without a
  separate authority review.

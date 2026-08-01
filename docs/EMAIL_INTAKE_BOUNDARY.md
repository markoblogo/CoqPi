# Email Intake Boundary

CoqPi may use email as an explicit, local preparation source. It must not become
an email client, CRM automation layer, or outbound messaging agent.

This note is based on the read-only / allowlist mode available in
`nikolausm/imap-mcp-server`.

Source: https://github.com/nikolausm/imap-mcp-server

## Allowed

- find owner-approved threads before a call;
- read selected messages for partner, employer, investor, accelerator, or client
  preparation;
- summarize only the relevant facts into a preparation packet;
- attach provenance to the local prep note;
- redact sensitive data before any external model call.

## Not allowed

- send, reply, forward, move, delete, or flag messages;
- broad mailbox crawling;
- automatic outreach;
- durable ingestion of raw messages or attachments;
- using email content in live calls unless it was selected for the session.

## Required local mode

Use either read-only mode:

```json
{
  "IMAP_MCP_READ_ONLY": "true"
}
```

or the narrower allowlist:

```json
{
  "IMAP_MCP_ENABLED_TOOLS": "imap_search_emails,imap_get_email,imap_get_latest_emails,imap_find_thread_messages,imap_list_folders,imap_get_unread_count"
}
```

## Run receipt

Each email-prep run should record:

- account and folder scope;
- query, sender, or thread selector;
- message count reviewed;
- facts retained in the preparation packet;
- redaction result;
- whether owner approval is needed before any follow-up.

Outbound contact remains outside CoqPi's current authority.

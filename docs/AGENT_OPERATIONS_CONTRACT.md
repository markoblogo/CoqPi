# CoqPi Agent Operations Contract

CoqPi applies the shared agent-operations pattern only to concrete external provider seams and retained operation evidence. It is not an agent runtime, scheduler, knowledge-base appliance, or autonomous assistant team.

## Agent card boundary

The current application identity is a local call assistant owned by the device user. Its effective authority is `read` plus local UI `proposal`: transcribe active audio, analyze an approved transcript path, and display suggestions. It has no authority to send messages, join calls, control other applications, mutate external systems, or perform transactions.

No unattended schedules are allowed. An eventual training or batch-analysis mode requires a separate card and operation receipt before implementation.

## Operation receipts

Existing governance receipts remain the source for external provider-call facts. If CoqPi adds a queued or long-running operation, its receipt must include `operation_id`, `agent_id`, `project_id`, `requested_by`, `authority`, `queued_at`, `status`, `result_summary`, evidence references, and `approval_required`.

Allowed states are `QUEUED`, `RUNNING`, `NEEDS_APPROVAL`, `SUCCEEDED`, `FAILED`, and `CANCELLED`. Do not put transcripts, prompts, profile/session content, credentials, raw provider errors, PII, or hidden reasoning in the receipt.

## Memory scopes

- `personal`: explicitly edited local profile preferences;
- `project`: repository-owned product and architecture context;
- `agent`: unavailable until a reviewed domain-memory store exists;
- `run`: current call/session state with explicit retention.

Cross-project reads and background learning are disabled. A completed call or successful provider request never promotes run state into durable memory automatically.

## Provider registry

The initial registry is `docs/agent-operations/provider-tool-registry.yaml`.

- OpenAI assistant analysis and OpenAI Realtime are recorded as cloud routes because current code contains those seams.
- Their availability remains `declared` until a dated relevant-path run is attached; source inspection is not confirmation.
- Local STT and Ollama remain unavailable/planned until implemented and verified.
- Local audio and latency-sensitive STT paths must not acquire a new policy, database, or network round trip merely to satisfy this documentation contract.

## Human boundary

Any future external action, system control, outbound communication, persistent recording, or cross-application automation requires explicit user approval and a separate authority review. Provider choice, schedule, or successful authentication never grants that authority.

## Research pilot: find-partners (no production routing)

- This pilot is **research-only** and local.
- Scope: partner/investor/employer discovery for initial market outreach prep.
- Required constraints:
  - no auto-send,
  - no outbound messages,
  - no external workflow side effects,
  - no credential use without explicit owner approval.
- Output format is local evidence-first notes/JSON, then manual review.
- Execution record should link to `docs/pilots/find-partners/README.md`.

If the pilot remains stable, convert it to an explicit module with a separate authority contract.

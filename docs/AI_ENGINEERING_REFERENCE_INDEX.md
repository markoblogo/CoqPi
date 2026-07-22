# AI Engineering Reference Index

This is a local reference index for implementation examples from [patchy631/ai-engineering-hub](https://github.com/patchy631/ai-engineering-hub). It is not a dependency, install plan, or runtime contract.

Use it when CoqPi needs a pattern reference for voice/context flows, mock transcript evaluation, local fallback, document/context packs, or retrieval behavior.

## Rules

- Treat every entry as `reference` until explicitly reviewed.
- Do not copy code into CoqPi without source review, dependency review, and owner approval.
- Do not use examples on live calls without a separate consent/privacy gate.
- Do not change provider routing, API keys, model calls, or realtime behavior from this index alone.
- Record secrets/data-egress risk before any pilot.

## Index

| category | source project path | possible local use | required adaptation | secrets/data-egress risk | allowed pilot projects | status |
|---|---|---|---|---|---|---|
| voice agent | `rag-voice-agent` | Reference for voice + retrieval loop shape. | Convert to mock transcript and local assistant-analysis path; no live-call change. | high; likely STT/LLM/provider egress. | mock transcript analysis only | reference |
| realtime voice | `real-time-voicebot` | Compare realtime state, latency, and interruption handling. | Preserve CoqPi local UI and existing realtime provider contract. | high; audio and provider egress likely. | synthetic audio/mock transcript eval | reference |
| document chat | `document-chat-rag` | Reference for counterparty/context document retrieval. | Use existing context pack manifest and strict selected-pack allowlist. | medium/high; document content and API calls may egress. | local context-pack mock run | candidate |
| local chat | `local-chatgpt`, `local-chatgpt with Gemma 3`, `local-chatgpt with DeepSeek` | Compare local fallback UX and provider switching. | Use existing provider profile/failover contract; no model route change by docs alone. | low/medium if fully local; verify model download and telemetry. | local fallback smoke only | reference |
| OCR/context intake | `llama-ocr`, `gemma3-ocr`, `qwen-2.5VL-ocr` | Reference for future document/source ingestion. | Keep OCR output local; classify source and record provenance before retrieval. | medium/high; vision provider egress likely unless local. | synthetic docs/context intake | reference |
| evals | `eval-and-observability` | Reference for prompt/skill quality evaluation. | Convert to local receipts and mock transcript scorecards. | medium; tracing vendors may export prompts/metadata. | skill-quality pipeline mock eval | candidate |
| memory agent | `agent-with-mcp-memory`, `database-memory-agent` | Compare memory and retrieval patterns. | Preserve selected-pack strict allowlist; no global memory or MCP server. | high if MCP/DB/provider is remote. | synthetic context-source fixtures | reference |
| meeting notes | `multilingual-meeting-notes-generator` | Reference for multilingual post-call summaries. | Only after explicit recorded/mock transcript source; no live capture expansion. | high; transcript egress risk. | mock transcript notes only | reference |

## Admission Checklist

- source inspected at exact commit;
- license and dependencies reviewed;
- data-egress path identified;
- required secrets listed;
- mock or explicitly recorded fixture chosen;
- live-call privacy and consent unaffected;
- provider route unchanged unless separately approved;
- owner approval recorded before implementation.

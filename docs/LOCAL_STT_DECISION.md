# Local STT Direction

## Decision

CoqPi does not import FluidVoice. It uses FluidVoice only as a reference when designing local-first transcription UX.

The reference is valuable for:

- selectable transcription providers and models;
- a clear distinction between local and cloud processing;
- low-latency interim feedback;
- microphone permission and model-download flows.

FluidVoice is GPL-3.0. Do not copy, import, or link its code, assets, prompts, or binaries into CoqPi without a dedicated license review. Reference: <https://github.com/altic-dev/FluidVoice>.

## CoqPi sequence

1. Prove the existing OpenAI Realtime live-call loop with microphone tests.
2. Add an `AssistantProvider` abstraction: OpenAI primary, Ollama fallback for text analysis and suggested replies.
3. Add a separate `TranscriptionProvider` abstraction only after step 2.
4. Evaluate local STT on this Mac:
   - Apple Speech for the simplest macOS fallback;
   - Whisper-family engine for offline English and French;
   - Parakeet/Nemotron only if local latency and memory measurements justify it.

## Constraints

- Local STT does not block Phase 3 Ollama fallback.
- Existing OpenAI Realtime transcription remains the primary v1 path.
- The UI must always show the active transcription and assistant providers.
- Transcript persistence stays disabled by default.

## Acceptance for the later local-STT slice

- Mic audio can be transcribed locally in English and French.
- Switching provider does not change the transcript-to-assistant contract.
- With no internet, an existing or mock transcript can still be analyzed through Ollama when enabled.
- Missing model, microphone permission, and provider failures remain understandable in the live cockpit.

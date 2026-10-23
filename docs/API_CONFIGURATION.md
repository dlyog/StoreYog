# Optional AI providers

The default local demo requires no AI URLs or API keys and still executes real MCP calls/SQLite. Live voice requires actual compatible speech services. Nothing here exposes the developer’s private lab services.

Run `python3 setup.py --live` (Windows: `py setup.py --live`) for CLI prompts. API keys use hidden input and are saved to ignored local `.env`; existing values are retained when a prompt is left blank. `--live --non-interactive` reads `.env`/shell configuration without prompting. The script sends a small chat request, a half-second silent WAV to configured STT and a short phrase to configured TTS; provider charges can apply. Failures are shown without printing keys and fall back to the credential-free MCP mode when no LLM is verified. Unconfigured speech remains optional.

## Chat completions

Set `LLM_API` to a compatible provider base origin or its `/v1` base, `LLM_API_KEY` to your own key when required, and `TRAINIUM_LLM_MODEL` to a model that your account can use. The adapter sends `POST /v1/chat/completions`, Bearer authorization if configured, and JSON with `model`, `messages`, `max_tokens`, `temperature` and `stream:false`. It reads `choices[0].message.content`. With a model configured, the web simulator follows the Alexa+ pattern: the model chooses the MCP tools, the server runs them, and the model answers from the real results (order approval stays in server code). Without a model, the credential-free mode routes common questions deterministically over the same real MCP tools.

A configured provider is not guaranteed to support every OpenAI feature or this planning prompt. Restricted/newer model families may require different token parameters. Choose a model supporting this documented chat contract, or adjust and test the adapter.

## StoreYog small tool-calling model (optional)

`training/tool-model/` contains a 350M-parameter model recipe (`facebook/opt-350m`, after arXiv 2512.15943) trained on StoreYog conversations generated from the real MCP tools on the synthetic store. Serve it with `serve_small.py` on any GPU host and set `SIMULATOR_LLM_PROTOCOL=storeyog-small`, `SIMULATOR_LLM_URL=http://<host>:9010`. The prompt carries the store's current product names, so new products work without retraining. If the model states a product fact before calling a tool, the server forces a tool call. See `training/tool-model/README.md`.

## Speech-to-text

| Variable | Meaning |
| --- | --- |
| `STP_API` | STT base URL |
| `STT_API_KEY` | Optional Bearer key |
| `STT_API_FORMAT=whisper` | Custom `/transcribe`, multipart `audio`, JSON `transcription` |
| `STT_API_FORMAT=openai` | `/v1/audio/transcriptions`, multipart `file` and `model`, JSON `text` |
| `STT_MODEL` | OpenAI-format transcription model, default `whisper-1` |

The browser uploads recordings to StoreYog `/api/stt`. Secrets stay server-side. WebM/Opus/MP4 are browser-dependent; providers must support the uploaded format. The shared microphone controller handles silence detection, interruption and stop locally around utterance-based HTTP calls.

## Text-to-speech

| Variable | Meaning |
| --- | --- |
| `TTS_API` | TTS base URL |
| `TTS_API_KEY` | Optional Bearer key |
| `TTS_API_FORMAT=kokoro` | `/generate-audio-binary/`, JSON text/voice/speed, WAV response |
| `TRAINIUM_TTS_VOICE` | Custom Kokoro voice, default `af_heart` |
| `TTS_API_FORMAT=openai` | `/v1/audio/speech`, JSON model/input/voice/response_format, MP3 response |
| `TTS_MODEL`, `TTS_VOICE` | OpenAI-format model/voice, defaults `tts-1` / `alloy`; verify your provider supports them |

StoreYog `/api/tts` proxies generated audio. Missing services produce an honest unavailable message and leave the text visible. No fake transcription or canned audio is substituted. `server/ai-services.ts` is the single adapter source; `scripts/check-services.ts` performs functional probes.

## Safe configuration

Use trusted HTTP(S) base URLs without embedded username/password, query or fragment; prefer HTTPS for external providers. Never paste keys into browser URLs, issue descriptions, screenshots or Git. `.env.example` is a template with empty values, not a working private endpoint list. Setup preserves API configuration between runs and regenerates local connection URLs/available ports. To disable live model inference explicitly, run `setup.py --demo`.

ElevenLabs is **not** wired into live runtime TTS. Its separate use for generated pitch narration is documented in [VIDEO.md](VIDEO.md), including voice IDs and key handling. No ElevenLabs key is needed to judge the app.

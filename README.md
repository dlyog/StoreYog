# StoreYog

**A shared inventory platform for a small store, with an owner workspace, customer finder and Alexa+-style voice simulator backed by a real MCP server.**

[![StoreYog on a real Echo Show: watch the 2:58 demo](https://img.youtube.com/vi/uU1Ww_vpUAU/maxresdefault.jpg)](https://youtu.be/uU1Ww_vpUAU)

**[▶ Watch the 2:58 demo](https://youtu.be/uU1Ww_vpUAU)** · [Try it: storeyog.dlyog.com/simulator](https://storeyog.dlyog.com/simulator) · [Verify real MCP calls](https://storeyog.dlyog.com/store/admin)

A customer finds dal using a shelf photo and directions. The owner manages products and checkout, asks about stock, and approves a simulated restock. SQLite is shared by the workspace, POS and authenticated MCP tools. Calls have persisted request IDs and executed SQL, so the judge can verify operations.

## One-command local setup

Install **Python 3.10+** if it is not already present. No Docker, AI key, Chrome or FFmpeg is required for the default demo. Internet is needed initially to download Node/dependencies and optionally watch the hosted film.

```sh
git clone https://github.com/dlyog/StoreYog.git
cd StoreYog
# macOS / Linux:
python3 setup.py
```

On Windows PowerShell, run the same file with:

```powershell
py setup.py
```

If the Windows Python launcher is unavailable, use `python setup.py`. The script detects macOS/Linux/Windows and x64/ARM64, reuses Node 22+ or downloads an official Node 22 distribution into ignored `.runtime/node/`, checks its SHA-256, installs locked npm dependencies including SQLite/image libraries, creates private local settings/credentials, checks ports and starts the app. It needs no sudo/admin access. Official prebuilt Node compatibility still applies; see troubleshooting for older Linux or unsupported CPUs.

**Choose the default when asked about optional AI.** For a completely unattended demo:

```sh
python3 setup.py --demo --non-interactive
```

On Windows replace `python3` with `py`. The terminal prints the actual URLs and selected ports. Defaults are 3100/3101/3102; occupied ports get alternatives. Other applications are never stopped. Leave the terminal open; **Ctrl+C stops only this instance** and preserves local data. Rerun the same command to start again. An explicit restart means Ctrl+C, then rerun. `--no-start` installs/configures without launching. The script does not expose services on the network: local listeners use 127.0.0.1.

## Judge walkthrough: no credentials or paid API needed

Use the URLs printed by setup, since port 3100 may have been occupied.

1. Open the landing page, then **Echo simulator** (`/simulator`). Click **Run demo script** to execute real MCP reconciliation, a draft and a simulated confirmed order. The assistant is explicitly deterministic in this mode; tool/database results are real.
2. Type **“How much rice is available?”**. The answer is computed from actual MCP inventory rows, not a generated count. Follow **Verify call** to `/store/admin?request=<UUID>` and inspect the matching persisted result/SQL.
3. Open `/experience`, type **“Alexa, open StoreYog”**, then **customer**, then **“Do you have dal?”**. You see public availability, shelf directions and an image. Start another owner walkthrough with the launch phrase, choose **owner**, enter demo PIN **1234**, then ask about inventory. This PIN grants access only to the fictitious store.
4. Open `/store/`. **Synthetic demo store · Little India** is selected in the Access dropdown with its credentials (`reviewer@little-india.example` / `LittleIndiaDemo123!`) filled in, here and on the hosted site. Open it to inspect and change inventory, photos, POS and orders; email and API keys stay disabled for this shared demo. Or register an independent store, which starts empty and keeps its data separate. Review the basket before confirming any simulated restock.
5. Open the **MCP administrator console** at the backend URL printed below the app URLs (`http://localhost:<backend-port>/console/`). Select **Judge demo administrator** and sign in. Inspect tool calls, errors, latency and SQL. Store administration requires password/session authentication. Select the prefilled Little India reviewer for read-only synthetic audit access; real owners use their own store credentials.

Default mode uses typed questions and real MCP/SQLite. It does not fake microphone transcription or model inference. Live microphone input and spoken replies require optional STT/TTS services; use the hosted experience for the full configured voice demo. If you enable voice, click once to stay hands-free, pause to submit, speak to interrupt, and say any sentence containing **stop** to disconnect and hear goodbye. The UI shows microphone off. Browser speech requires localhost/HTTPS and microphone permission. Physical speaker echo behavior depends on browser/hardware.

No supplier purchase/payment occurs. Email is disabled until a real SMTP transport and verified recipient are configured; a missing transport is reported honestly. The pitch uses a local captured demo email, not real delivery.

## Optional live LLM, speech-to-text and text-to-speech

```sh
python3 setup.py --live
# Or read existing .env / shell variables without prompts:
python3 setup.py --live --non-interactive
```

The live simulator needs exactly **three API base URLs**: an LLM, speech-to-text and text-to-speech. Either answer the prompts or put them in `.env` before running `--live --non-interactive`:

```dotenv
LLM_API=https://your-llm.example.com/v1        # OpenAI-compatible chat completions
LLM_API_KEY=                                   # optional, kept server-side
TRAINIUM_LLM_MODEL=your-model-id
STP_API=https://your-stt.example.com           # speech-to-text
STT_API_FORMAT=openai                          # or whisper (custom /transcribe)
TTS_API=https://your-tts.example.com           # text-to-speech
TTS_API_FORMAT=openai                          # or kokoro (custom /generate-audio-binary/)
```

The example hosts are placeholders. The script asks for three base URLs, optional hidden API keys, model IDs and speech formats. It reads existing `.env` values first. Keys remain in ignored local `.env`, never browser code or Git. It sends one small functional request to each configured provider; **your provider can charge for these requests**. Failed/unconfigured AI does not prevent the deterministic MCP demo. Speech can be configured even without an LLM.

Supported adapters:

| Service | Formats |
| --- | --- |
| LLM | OpenAI-compatible `/v1/chat/completions` with model, messages and optional Bearer API key |
| STT | Custom Whisper `/transcribe` (`audio` → `transcription`), or OpenAI-compatible `/v1/audio/transcriptions` (`file` + model → `text`) |
| TTS | Custom Kokoro `/generate-audio-binary/` (text/voice/speed → WAV), or OpenAI-compatible `/v1/audio/speech` (model/input/voice → MP3) |

See [.env.example](.env.example) and [API configuration](docs/API_CONFIGURATION.md). A provider's name/API key alone does not guarantee wire compatibility or model access. We do not distribute or expose the developer’s private model/speech APIs. ElevenLabs was used for offline pitch narration, not as this app’s live speech backend.

## Bonus: classic Alexa skill on a real Echo Show

The same MCP-backed assistant also runs on a real Echo through a **classic Alexa custom skill**. This is not Alexa+, whose preview tools are partner-only. One catch-all intent sends whatever the user says to StoreYog's agent and MCP tools. On an Echo Show it also shows shelf photos with the arrow, plays the demo video, and answers general questions through the configured LLM. Store facts always come from MCP. The skill is in development stage on the developer's own account ("Alexa, open store yog"); judges can review the code and the setup guide in [classical-alexa/README.md](classical-alexa/README.md). It is off unless `CLASSIC_ALEXA_ENABLED=true`, and requests are verified with Amazon's request-signature rules.

## Research: three tool-calling modes

With a model configured, the simulator's **Mode** selector switches how a request becomes MCP tool calls, on the same store and behind the same safety guard:

- **LLM router · in-context.** One LLM call picks one of eleven numbered actions from examples; code runs the MCP tools and builds the reply from real results.
- **StoreYog small model (research only).** Our OPT-350M fine-tune, published at [huggingface.co/dlyog/storeyog-opt-350m-mcp-tools](https://huggingface.co/dlyog/storeyog-opt-350m-mcp-tools) under Meta's OPT-175B license, which allows non-commercial research use only. The page shows a notice before it is used.
- **LLM tool loop.** The model receives the tool schemas and plans the calls itself.

Every request and model-written reply passes a responsible-AI prompt guard (`simulator/prompt-guard.ts`, see [docs/responsible-ai](docs/responsible-ai/README.md)). Every model call and MCP call is recorded in the store audit with its mode.

The paper, the 30-turn benchmark with three scored runs per mode, the audited model calls, a live tester session, the guard evaluation and the training statistics are in [research/](research/paper.md). Results: router 96.7%, small model 90.0%, native tool calling 48.9%; guard F1 99.67.

`node --import tsx scripts/compare-modes.ts --prompts research/benchmark-prompts.json` reruns the benchmark against a running installation.

## Development and tests

After setup, Node 22+ and dependencies are available. If Node was installed locally, use the executable under `.runtime/node/` or add its `bin` directory (Windows: installation directory) to PATH. If system Node is available:

```sh
npm run typecheck
npm test
npm run test:owner
npm run test:oauth
npm run test:oauth-proxy
npm run test:admin
```

Use `python3 setup.py --demo --non-interactive --verify` to run all core checks without managing Node PATH. The unit suite needs no external APIs. Owner tests use a local fake SMTP inbox; OAuth tests use temporary local services/data. `python3 setup.py --no-start --demo --non-interactive` tests provisioning without starting the app. Run `python3 setup.py` for foreground startup and Ctrl+C for shutdown. See [testing guide](docs/TESTING.md) for backend/MCP/audit and optional Chrome tests, what is mocked, and how to use the selected ports.

## Architecture and honest boundaries

- [Architecture, security and entry points](docs/ARCHITECTURE.md)
- [Judge walkthrough](docs/JUDGE_GUIDE.md)
- [Hackathon rules and criteria](docs/HACKATHON.md)
- [Video provenance and update process](docs/VIDEO.md)
- [Agent instructions](AGENTS.md) and [Claude memory](CLAUDE.md)

**Alexa+ track:** self-hosted MCP 2025-11-25 Streamable HTTP + our own web simulation. Amazon’s official FAQ limits Alexa+ preview tools to selected partners; participants cannot obtain that access through the hackathon. This repository does not claim native Alexa account/device/mobile integration. A classic Custom Skill endpoint is a different protocol. [Official FAQ](https://amazonappdev2026.devpost.com/details/faqs)

## Trademarks

Alexa, Alexa+, Echo, Echo Show, Amazon and Amazon Business are trademarks of Amazon.com, Inc. or its affiliates; Gemma is a trademark of Google LLC; OPT is a model released by Meta Platforms, Inc.; other names belong to their respective owners. They are mentioned only to describe compatibility and for reference, as nominative fair use. StoreYog is an independent hackathon project and is not affiliated with, sponsored by or endorsed by Amazon, Google, Meta or any other organization or employer.

## Troubleshooting

- **Python missing:** install Python 3.10+ from python.org; Windows often uses `py`, macOS/Linux `python3`.
- **First install fails:** check internet/TLS access to nodejs.org and npm. No certificates are bypassed. If native prebuilds are unavailable, install OS C++ build tools (macOS Command Line Tools; Linux compiler/make; Windows Visual Studio C++ Build Tools) and rerun. We do not install system compilers or change system Node automatically.
- **Port occupied:** setup selects another available port and prints it. If another process races startup, rerun. Do not force-kill it.
- **Voice unavailable:** type instead, use default demo, or configure/check compatible speech services with `--live`. A URL without the right path/format/model/key is insufficient.
- **Application error:** inspect `.runtime/storeyog.log`; rerun setup after correcting the problem. Existing data is preserved; setup does not reset the store.
- **Fresh clone has no MP4:** intentional. Media are ignored; the landing video uses the hosted export and core local features do not depend on it. The Devpost entry separately needs a public YouTube/Vimeo URL.
- **Windows/Linux support:** OS/CPU branches and CI workflow are supplied. Only macOS has been exercised in this release session; see the test status for evidence rather than assuming an unrun platform passed.

Licensed under [Apache-2.0](LICENSE). Synthetic-data hackathon preview; use only fictitious inventory, prompts and pictures. Do not submit payment, health or other sensitive customer data. Account credentials/email for owner login are stored locally; this is not a claim that no personal information can ever be processed.

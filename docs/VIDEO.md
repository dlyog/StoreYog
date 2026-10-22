# Pitch video and provenance

The hosted V6 video has two editions: normal **207 seconds (3:27)** and exactly **1.25×, 165.6 seconds (2:45.6)**. The accelerated edition preserves pitch and fits the three-minute submission limit. Both use 1080p, quiet background music, clean cuts and no subtitle track. Generated MP3/WAV/MP4 and production caches are intentionally excluded from this public runtime repository.

The film combines original illustrated characters, synthesized dialogue and actual application screenshots captured after real customer, POS and MCP requests. The owner PIN is a synthetic walkthrough; supplier orders are simulated. The sales-report inbox is illustrative and populated through a local fake SMTP capture; neither the displayed Raj nor Sam address received a real email. No native Alexa hardware integration or continuous live-human recording is claimed.

Production pipeline used in the development project:

1. Start a separate recording stack/database and localhost-only SMTP capture.
2. Capture customer lookup, owner role/PIN, POS, reviewed restock and report evidence with Playwright.
3. Generate/cache dialogue with ElevenLabs, then create a timed narration manifest.
4. Compose marketing, architecture, actual app and character frames.
5. Render normal video, quietly mix/duck music, then create the 1.25× edition with pitch-preserving audio.
6. Verify duration, full decode, dimensions, no subtitle stream and no black opening; manually inspect important scenes and audible voice/music balance.

Original builder names are `capture.ts`, `produce.py`, `frames.ts`, `render.py`, plus generated `evidence.json`, `timeline.json`, `SCRIPT.md` and `video-manifest.json`. Production scripts/media are not required to run this app and are excluded here. To update the public demo, retain the old edition, capture the **current** working UI, regenerate changed narration, validate both exports, update hosted video links and the Devpost YouTube/Vimeo upload. Editing a transcript file alone does not change captured app state. Preserve permission records for music and third-party assets.

## V7 live walkthrough

V7 is one continuous real Chrome session on `https://storeyog.dlyog.com`: landing page, owner turns in `/simulator` with the live MCP tool trace, the customer shelf finder, the owner identity gate in `/experience`, and the protected `/store/admin` audit opened on the exact request ID from the owner's rice question (bound SQL, then LLM calls). It ends with the real output of a fresh clone running `python3 setup.py --demo --non-interactive --test`, then the three API settings for live voice. Typed turns go through the live agent and MCP server. The restock is simulated and touches only the synthetic demo tenant.

The film uses the same ElevenLabs voices as above. Will narrates Raj's story with Eleven v3 audio tags; Liam and Matilda voice the typed owner and customer lines; Sarah re-voices the exact reply text the live app spoke with its own Kokoro TTS. Where a voiced line is longer than the live clip, the screen is held still rather than reordered. Audio is normalized to −14 LUFS. Raj and the customer are fictional.

## ElevenLabs details

ElevenLabs was used **offline for the pitch**, not as the application’s live TTS provider. Model: `eleven_multilingual_v2`; output: `mp3_44100_128`. Requests use `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with the private `xi-api-key` header. Tested narration settings were stability 0.48, similarity boost 0.75, style 0.15 and speaker boost enabled.

| Role | Voice | Public voice ID |
| --- | --- | --- |
| Narrator | Will | `bIHbv24MWmeRgasZH58o` |
| Raj | Liam | `TX3LPaxmHKxFdv7VOQHJ` |
| Assistant | Sarah | `EXAVITQu4vr4xnSDxMaL` |
| Customer | Matilda | `XrExE9yKIg1WjnnlVkGX` |

Credentials belong in a private `ELEVENLABS_API_KEY` environment variable or an external ignored file selected by `ELEVENLABS_SECRET_FILE`; no key is supplied here. The successful basic-plan synthesis did not require listing voices; the key lacked voice-list permission. Voice access can change, so verify a small synthesis before a new build. Reuse unchanged clips by text/voice hash to save credits; changed settings with the same text/voice require a new cache version. Do not create/cloned voices or change a subscription merely to rebuild.

The live app instead supports optional Whisper/OpenAI-format STT and Kokoro/OpenAI-format TTS as documented in [API_CONFIGURATION.md](API_CONFIGURATION.md). Judges do not need an ElevenLabs account or generated audio to run the app. Native Alexa+ preview access remains restricted as documented in [HACKATHON.md](HACKATHON.md).

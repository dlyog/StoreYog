# StoreYog friction log

Amazon Developer Hackathon 2026 · Alexa+ track. Real problems we hit while building StoreYog, with what we did about them.

## 1. Getting the Alexa+ preview tools

| | |
| --- | --- |
| **Task** | Connect our self-hosted MCP server to Alexa+ using the official simulator or MCP Toolkit. |
| **Steps** | Opened the Alexa developer console (classic Skills), looked for MCP add-on onboarding, then read the hackathon FAQ. |
| **Expected** | A participant path to the Alexa+ simulator or toolkit. |
| **Actual** | The preview tools (MCP Toolkit, AI CLI, official simulator) are limited to select partners, and the classic console has no MCP onboarding. |
| **Severity** | High |
| **Workaround** | Built our own Alexa+-style web simulator that calls the same MCP server (spec 2025-11-25, Streamable HTTP). |
| **Suggestion** | Give hackathon participants a time-boxed sandbox for the official simulator, or state the restriction on the track page itself. |

## 2. OAuth discovery behind a reverse proxy

| | |
| --- | --- |
| **Task** | Expose public `/mcp` with OAuth so an Alexa account-linking client could discover it. |
| **Steps** | Deployed the OAuth authorization-server and protected-resource metadata endpoints behind Apache, then tested discovery over HTTPS. |
| **Expected** | All `/.well-known/` metadata endpoints return JSON. |
| **Actual** | They returned 404, because a blanket `/.well-known/` exclusion added for certificate renewal intercepted them. |
| **Severity** | Medium |
| **Workaround** | Narrowed the exclusion to `/.well-known/acme-challenge/`. All three discovery paths then passed a full public OAuth + PKCE + MCP test. |
| **Suggestion** | List the exact discovery paths (RFC 8414 and RFC 9728) and proxy requirements in the Alexa+ account-linking docs. |

## 3. Hands-free voice in the browser

| | |
| --- | --- |
| **Task** | A continuous, interruptible voice conversation in a browser, like a real Alexa device. |
| **Steps** | Recorded utterances, sent them to an HTTP speech-to-text API, and played the text-to-speech replies. |
| **Expected** | Natural turn-taking. |
| **Actual** | Echo and overlapping turns. Users had to be able to interrupt replies, and "stop" had to work mid-sentence. |
| **Severity** | Medium |
| **Workaround** | Built our own pause detection, barge-in, queued turns and a stop-word handler (`simulator/public/handsfree.js`), shared by every voice page. |
| **Suggestion** | Publish a reference web voice loop (voice activity detection, barge-in, cancellation) for teams building simulated Alexa+ experiences. |

## 4. Making the model's numbers trustworthy

| | |
| --- | --- |
| **Task** | Answer "How much rice is available?" correctly every time. |
| **Steps** | Let a small LLM plan the tool call and phrase the answer from MCP results. |
| **Expected** | The answer matches the database. |
| **Actual** | Short product names ("rice", "dal") and similar items were sometimes matched or phrased wrongly. |
| **Severity** | Medium |
| **Workaround** | Quantity answers are computed directly from MCP inventory rows (`simulator/inventory-query.ts`). Every MCP call and LLM call is persisted with its request ID, SQL, prompt and response in a protected audit. |
| **Suggestion** | Alexa+ MCP guidance could recommend a pattern for "facts come from tools, not the model", and show how to surface tool provenance to users. |

## 5. Developer console simulator rejects a working development skill

| | |
| --- | --- |
| **Task** | Test our classic Alexa custom skill (the Echo Show front end for StoreYog) in the developer console's Test tab. |
| **Steps** | Built the interaction model, set the HTTPS endpoint, enabled testing in Development, typed "open store yog" in the Alexa Simulator. |
| **Expected** | The skill launches, as it does on a real device. |
| **Actual** | "Sorry, store yog is not supported on this device." The same happened with a different invocation name, and no request reached our endpoint. The same skill worked immediately on a real Echo Show on the same account. The Manual JSON tab did reach the endpoint. |
| **Severity** | Medium |
| **Workaround** | Tested on the real device and with Manual JSON (which needs a current timestamp to pass request verification). |
| **Suggestion** | Explain in the simulator why a skill is "not supported on this device" (for example the simulated device type or an Alexa+ account), and link to the fix. |

## 6. VideoApp fails silently on a 1080p MP4

| | |
| --- | --- |
| **Task** | Play the StoreYog demo video on an Echo Show with `VideoApp.Launch`. |
| **Steps** | Enabled the Video App interface, served a 1920×1080 H.264 High-profile MP4 over HTTPS, and sent `VideoApp.Launch` (one directive, no reprompt, no `shouldEndSession`). |
| **Expected** | Playback, or an error explaining why not. |
| **Actual** | Nothing played. No `SessionEndedRequest` error reached the skill, and our logs showed the directive was accepted. |
| **Severity** | Medium |
| **Workaround** | The VideoApp reference lists a 1280×720 maximum. A 1280×720 H.264 Main-profile, AAC 48 kHz encode played immediately. |
| **Suggestion** | Return an error event (or log one in the developer console) when a video's format or resolution is unsupported, and put the format limits next to the directive's example. |

## 7. Speech-to-text spells Indian grocery words differently

| | |
| --- | --- |
| **Task** | Answer "do I have dal?" on an Echo through a catch-all slot. |
| **Steps** | Spoke "do I have dal", "check dal" and "where is the dal". |
| **Expected** | Slot text "dal" (the product name in the catalog and in our slot samples). |
| **Actual** | Alexa wrote "dahl", so exact matching found no product and the question fell through to the language model. |
| **Severity** | Medium |
| **Workaround** | Normalized spoken spellings (dahl/daal → dal, mung → moong, curd/yogurt → dahi, chilli → chili) before matching, and added them to our tests. |
| **Suggestion** | Let custom slot values carry pronunciation or spelling synonyms that also apply to catch-all text, or document best practice for regional product names. |

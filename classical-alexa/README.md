# Classic Alexa skill for StoreYog (branch `classical`)

This is a classic Alexa **custom skill** that lets a real Echo (including 2nd-gen devices) talk to StoreYog. It is **not Alexa+**: the Alexa+ preview tools are limited to approved partners. The skill is a thin voice front end for the same backend the web simulator uses.

```
You ──speech──▶ Echo ──text (signed JSON)──▶ https://storeyog.dlyog.com/alexa
                                              │  classical-alexa/skill-handler.ts
                                              ▼
                        simulator agent (LLM planning) ──▶ MCP tools ──▶ SQLite (synthetic demo store)
                                              │
Echo speaks the reply ◀──── reply text ───────┘        every call is in /store/admin (request IDs, SQL)
```

## Design

| Alexa request | What the skill does |
| --- | --- |
| `LaunchRequest` ("Alexa, open little yog") | Sends "Alexa, open StoreYog" to the agent and speaks the welcome. |
| `ChatIntent` with `{text}` | Sends the exact words to the agent: the same LLM + MCP path as `/simulator`. "Yes" and "no" flow here too, so restocks still need a fresh yes. |
| `AMAZON.StopIntent` / `CancelIntent`, or any sentence containing "stop" | Says goodbye and ends the session (StoreYog's stop rule). |
| `AMAZON.HelpIntent` | Speaks a short help line. |
| `AMAZON.FallbackIntent` | "Sorry, I did not catch that." |

- **Catch-all intent:** `ChatIntent` has one sample, `{text}`, with a custom slot type `ANYTHING` seeded with 40 example phrases. Alexa fills `text` with almost any sentence.
- **One conversation per Alexa session:** the session keeps the open restock draft between turns.
- **Speed:** replies must arrive within Alexa's 8 s limit. The handler answers by 7 s and asks you to repeat if the agent is still busy (count questions take ~0.2 s; reconcile/restock ~1.5 s).
- **Identity:** the skill uses the simulator's server-held demo-store key, so it can only reach the **fictitious Little India store**. It cannot reach registered businesses. Email sends stay blocked, exactly as in the simulator.
- **Security:** every request is verified the way Amazon requires: the certificate URL rules, a downloaded signing chain trusted by Node's CA store, `echo-api.amazon.com` in the subject alternative name, an RSA-SHA256 `Signature-256` over the raw body, a timestamp within 150 s, and an optional skill ID check.

## Echo Show (multimodal) and open questions

- **Greeting:** "Hello, I am your Virtual Store Assistant! You can ask me: how much rice is available; where is the toor dal; reconcile today's inventory and draft a restock; play the demo video. You can also ask me anything else. How can I help?" On a screen it shows the same list over the store artwork.
- **"Where is the rice?"** speaks the published location and shows the shelf photo with the owner's yellow arrow. The data comes from the read-only customer finder (`find_product`), so no counts or costs.
- **Stock questions** speak the MCP count. When exactly one product matches and it has a published photo, the screen shows that photo; otherwise it shows the answer card.
- **"Play the demo video"** plays the V7 film (`/alexa/media/demo.mp4`) full screen. The microphone stays closed while it plays. When it ends, the device sends an event and the assistant asks what's next.
- **Other questions** ("what can I cook with toor dal", "capital of France") go to the same LLM with a general-assistant prompt. They're recorded in the store's LLM audit, and the model is told never to state store data. Store intents (stock, sales, orders, approvals, "yes"/"no") always use the MCP agent.
- Screens are APL 1.8 documents (`apl.ts`). They're sent only when the device reports `Alexa.Presentation.APL`; devices without a screen get voice only.

**Console step for screens:** Build → **Interfaces** → turn on **Alexa Presentation Language** (tick the Echo Show sizes) → **Save Interfaces** → **Build skill**. Without it, the Echo Show answers by voice only.

Answer quality for open questions depends on the configured LLM. The default is the self-hosted Gemma 4 E2B; setting `ANTHROPIC_API_KEY` on the server makes the store agent use Claude, but `generalAnswer` currently calls the OpenAI-compatible endpoint.

## Files (all new; nothing else changed except one gated line)

| File | Purpose |
| --- | --- |
| `skill-handler.ts` | Express router for `/alexa`: verification, session map, intent routing (store agent, shelf, video, general LLM), Alexa responses, demo video file |
| `apl.ts` | Echo Show screens: welcome, answer card, shelf photo with arrow, demo video |
| `skill-package/skill.json` | Skill manifest (name, endpoint, privacy) for the ASK CLI or reference |
| `skill-package/interactionModels/custom/en-US.json` | Interaction model to paste into the console's JSON Editor |
| `test-skill.ts` | Local test with realistic Alexa JSON through the real agent and MCP |
| `simulator/agent.ts`, `simulator/inventory-query.ts` | Shared fixes: spoken spellings ("dahl"), "do I have / check" routing, tolerant model JSON, stock fallback wording |
| `simulator/index.ts` (one line) | Mounts the router **only** when `CLASSIC_ALEXA_ENABLED=true`. Without it, `/alexa` returns 404 and nothing else changes. |

Rollback: switch back to `main`, or leave `CLASSIC_ALEXA_ENABLED` unset.

## Settings (app host `.env`)

```dotenv
CLASSIC_ALEXA_ENABLED=true
CLASSIC_ALEXA_SKILL_ID=amzn1.ask.skill.xxxxxxxx   # from the developer console; requests from any other skill are refused
# CLASSIC_ALEXA_SKIP_VERIFY=true                  # local testing only; never on the public server
```

## Create the skill (Alexa developer console, about 10 minutes)

Use the **same Amazon account** your Echo is registered to. A development-stage skill works only on that account's devices, and needs no certification.

1. Go to https://developer.amazon.com/alexa/console/ask and click **Create Skill**.
2. Name `StoreYog`, locale **English (US)**, experience **Other** → **Custom**, hosting **Provision your own**, template **Start from scratch**, then **Create**.
3. **Build → Interaction Model → JSON Editor**: paste the whole of `skill-package/interactionModels/custom/en-US.json`, then **Save** and **Build skill**. Invocation name: `little yog`.
4. **Build → Endpoint**: choose **HTTPS**. Default Region: `https://storeyog.dlyog.com/alexa`. SSL: "My development endpoint has a certificate from a trusted certificate authority". **Save**.
5. Copy the **Skill ID** (`amzn1.ask.skill...`, shown on the Endpoint page) and add it to the server `.env` as `CLASSIC_ALEXA_SKILL_ID` with `CLASSIC_ALEXA_ENABLED=true`, then restart the app.
6. **Test** tab: set "Skill testing is enabled in" to **Development**. Type `open little yog` in the simulator box to check it end to end.
7. On the Echo: "**Alexa, open little yog**".

Invocation name: `little yog`. In this account the console's typed **Alexa Simulator** answered "<name> is not supported on this device" for both `store yog` and `little yog`, while the same skill worked on a real Echo. Test on the device, or with the **Manual JSON** tab (set a current UTC `timestamp`).

## Demo script on the Echo

1. "Alexa, open little yog." → "Welcome, Raj. How can I help you?"
2. "How much rice is available?" → the count, from a real `get_inventory` MCP call.
3. "Reconcile today's inventory and draft a restock for the low items." → sales summary plus "Shall I order these 2 items…?"
4. "Yes, go ahead." → "Your order is confirmed…" (simulated; no payment).
5. "Stop." → "Goodbye."
6. On a laptop, open `https://storeyog.dlyog.com/store/admin`. The calls you just made appear with request IDs and SQL.

Call it a "classic Alexa custom skill on a real Echo, backed by our MCP server", not Alexa+.

## Test locally

```sh
./manage.sh start                                   # local app with MCP on 3101
node --import tsx classical-alexa/test-skill.ts     # real agent + MCP; confirms one simulated restock locally
```

The test checks: certificate URL rules, a forged self-signed certificate rejected, an unsigned request refused (400), launch → real MCP rice count → restock draft → fresh yes → "stop" in a sentence and `AMAZON.StopIntent` end the session → `SessionEndedRequest` → empty-text fallback.

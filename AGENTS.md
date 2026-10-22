# StoreYog public submission: agent instructions

Read `README.md`, `docs/ARCHITECTURE.md` and `docs/TESTING.md` before editing. `CLAUDE.md` imports this file for Claude; this is standard project memory, not a manually activated skill.

## Product and truthful claims

This is a small-business inventory app with an actual store-scoped SQLite ledger, owner workspace/POS, published customer finder, authenticated MCP 2025-11-25 Streamable HTTP server and web voice simulation. Public preview: https://storeyog.dlyog.com/. The local default needs no paid AI APIs and uses a labeled deterministic assistant with real tools/data. Do not fake tool/model records. Supplier orders are simulated, POS collects no payment and email requires a verified configured transport.

Native Alexa+ toolkit access is limited to selected partners; the official hackathon participant path uses our own simulator. Do not claim native mobile/device linking, approved-partner status, voice identity authentication or native Echo Show widgets. See `docs/HACKATHON.md` for official sources and judging requirements.

## Keep these boundaries

- Every new business starts empty, with its own owner password/session and store ID. All inventory, images, keys, reports and audit reads must remain store-bound. Caller-supplied store IDs never change identity.
- Customer MCP identities have only `customer:read` and return published availability/locations/images, never quantities, costs, sales or owner credentials. Shared customer devices never receive owner keys.
- `/store/admin` is password/session protected and tied to actual owner accounts. The prefilled Little India reviewer is read-only there. The same synthetic credentials also open the fictitious Little India store app at `/store/` as a shared, editable demo (stock, POS, products, simulated orders); that session must never send email, preview report recipients or mint API keys, and never applies to registered businesses.
- Log actual LLM requests/responses/status/errors/timing in the protected store audit. Persist the request before provider invocation, exclude transport credentials/headers, and correlate MCP calls by conversation ID. Deterministic answers have no invented LLM call.
- Public voice views share `simulator/public/handsfree.js`. Click once, detect pauses, allow interruption, and treat the standalone word `stop` anywhere in a sentence as disconnect + one goodbye + microphone off. Do not require repeated taps.
- Preserve CSRF, stale-stock checks, fresh exact-basket approval, idempotent checkout, SQL parameter binding and explicit customer photo publication.

## Working on this repo

Use `python3 setup.py --demo --non-interactive --verify` (Windows: `py setup.py ...`) for core checks and a self-stopping real MCP smoke. Browser tests need Chrome; real speech needs optional configured services. Do not claim unrun Windows/Linux CI passed. No external email, supplier order or subscription change is authorized merely for tests.

This public distribution deliberately has no developer lab endpoints, deployment configuration or private operational state. Never commit `.env`, `.secret`, API keys, runtime credentials, SQLite, uploads, recordings, generated audio/video, node_modules, private deployment hosts or personal workstation paths.

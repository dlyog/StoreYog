# Startup and test guide

## One-script setup and verification

Use Python 3.10+ and internet for the first dependency install. macOS/Linux use `python3`; Windows uses `py` or `python`. No AI key is needed for these core checks.

```sh
python3 setup.py --demo --non-interactive         # install/select ports/start; Ctrl+C stops
python3 setup.py --demo --non-interactive --no-start  # provision only
python3 setup.py --demo --non-interactive --test  # real MCP/customer/admin-audit smoke; stop
python3 setup.py --demo --non-interactive --verify # full core suites + smoke; stop
```

`--verify` runs typecheck, unit tests, isolated owner/fake-SMTP tests, direct and frontend-proxied OAuth tests, store-admin/LLM/tenant-isolation tests, then a live no-API smoke. It uses the selected Node executable even if Node was provisioned locally and is not on your shell PATH. Actual model logging is tested against a local synthetic provider fixture; this does not claim a paid/external model was called during the test. Actual MCP/SQLite calls and audit writes are used.

The launcher reuses Node 22+ or checksum-verifies an official local Node 22 download. It installs locked dependencies if the lockfile/Node ABI changed, loads `.env` and optional CLI settings, selects free ports, starts both services, waits for health, and prints exact URLs. It never stops an unrelated process. Ctrl+C terminates its own process group and preserves `.env`, credentials, SQLite and uploads under ignored `.runtime`. A second instance gets different ports but should not be used to intentionally share an active development database.

## Manual judge flow

1. Follow the printed landing URL and open `/simulator`.
2. Click **Run demo script**. It is a labeled deterministic assistant executing real MCP tools, not fake server responses. Supplier orders remain simulated.
3. Type “How much rice is available?” and inspect the real count/tool trace. Follow its verification link to `/store/admin?request=<UUID>`.
4. In Store administration choose the prefilled **Little India Grocery — demo reviewer** profile, then click **Open store administration**. This synthetic password grants only audit reading, never owner mutations. The **Audit** section shows tool SQL and LLM prompt/response records, when a model was actually called. Deterministic quantity answers do not invent a model call.
5. Create a new store at `/store/` with your own fictitious email/password. It starts empty. Add products, receive stock, record a POS sale and check inventory. Its owner can sign in at `/store/admin` with the same credentials and sees only that store's records.
6. Use the private local backend `/console/` for the global operator view. Setup enables a local judge dropdown; this is not a production public admin credential.

## Developer commands

After setup, with the selected Node/npm on PATH:

```sh
npm run typecheck
npm test
npm run test:owner
npm run test:oauth
npm run test:oauth-proxy
npm run test:admin
```

- Unit tests cover ledger rollover, tenancy, atomic POS, stale edits, approvals, customer/photo privacy, stop matching and model-audit isolation.
- Owner tests run temporary backend/SQLite and Python SMTP against a local fake inbox, without external mail.
- OAuth tests exercise exact callbacks, consent/CSRF, S256, resource binding, token expiry/rotation/replay/revocation, scopes and private-route isolation.
- Admin tests use temporary frontend/backend and a synthetic chat server to verify exact prompt/response/error capture, MCP conversation correlation, real independent signups, authenticated store-bound reads and cross-store denial.

## Optional browser and live-service checks

Chrome is required for the checked-in Playwright browser scripts. Start the app first and point `BUSINESS_BASE_URL` at the **printed** frontend URL if it differs from port 3100. In PowerShell set `$env:BUSINESS_BASE_URL='http://localhost:ACTUAL_PORT'`; on macOS/Linux prefix the command with `BUSINESS_BASE_URL=...`.

```sh
node --import tsx scripts/inventory-answer-check.ts
node --import tsx scripts/audit-browser-check.ts
node --import tsx scripts/experience-duplex-check.ts
node --import tsx scripts/customer-duplex-check.ts
```

The inventory/admin audit check calls real MCP tools. The browser audit check verifies protected login and the matching SQL record. Voice browser suites feed controlled audio and intercept STT/TTS for repeatable pause/stop tests; they are not proof of acoustic echo behavior on every physical device. `scripts/duplex-check.ts` additionally uses a real configured TTS response, so it requires speech service access. It must not be run as a no-service smoke test.

For real voice, configure `setup.py --live`, allow microphone access in Chrome on localhost/HTTPS, click once, pause naturally, interrupt a reply, and say “OK stop”. Check that goodbye plays once, the UI says microphone off and browser audio tracks are released. Missing STT/TTS leaves the text path available; no fake inference is supplied.

## Test status and platform scope

See the release notes in this repository for checks actually run. There is no CI workflow; checks are run locally. Local sessions used macOS; Linux and Windows have not been exercised, so platform-specific claims need a real run there. The automatic Node bootstrap was tested with the system Node lookup hidden, and the official runtime checksum was verified.

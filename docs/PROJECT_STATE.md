# StoreYog public distribution handoff

Updated 2026-10-22. Start with `AGENTS.md` and `README.md`. This repository is the minimal runnable public hackathon distribution, not a backup of the developer’s private environment or media.

## Implemented

- Owner signup/login, independent empty business catalogs, inventory/receiving/POS/restocks/reports and published shelf images.
- Actual official SDK MCP 2025-11-25 Streamable HTTP calls and store-scoped SQLite persistence. Customer lookups use real read-only MCP identities.
- Web simulator, guided customer/owner experience, shared hands-free microphone controller and stop-in-a-sentence goodbye behavior.
- Protected `/store/admin` Audit section for actual tool/SQL and LLM prompt/response/error/timing records. Owners use their workspace credentials. The prefilled synthetic Little India reviewer cannot mutate owner data or inspect another store.
- Public OAuth/PKCE protocol implementation, store-key revocation, rotating refresh tokens and private-route isolation. Actual native Alexa linking is not claimed.
- OS-aware `setup.py` installs/verifies a local Node runtime if needed, installs dependencies, preserves private local settings/data, selects free ports and runs a no-API demo by default. `--live` configures optional compatible providers; `--test` runs a real smoke and stops; `--verify` runs all core suites plus smoke.

## Validation before publication

The prepared distribution passed typecheck, **30 unit tests**, isolated owner/fake-SMTP and OAuth direct/proxy suites, store-admin/LLM/tenant isolation and launcher MCP/customer/protected-audit smoke on macOS. Official Node bootstrap was exercised with system Node lookup disabled and checksum verified. The original configured app’s real model audit and public protected admin are verified separately in its operational handoff. CI is configured for macOS/Linux/Windows; do not claim a platform passed until its job actually runs. No API credentials are required for the local core verification.

## Known boundaries and remaining submission steps

Native Alexa+ tooling is partner-preview gated. Our submission intentionally demonstrates the actual MCP service through our own frontend. Physical mic/speaker acoustic behavior depends on browser/hardware. Photo captions need a compatible vision model and manual fallback; model availability is not guaranteed. Orders are simulated; configured SMTP acceptance is not proof of inbox delivery. The pitch uses a local fake mailbox and generated characters/voices.

The current hosted pitch is 2:45.6 at 1.25×; the normal edition is 3:27. Video/media are not in Git. Upload the short edition publicly to YouTube/Vimeo, verify the repository is actually pushed/public with its Apache-2.0 license, complete Devpost description/product feedback/change history and confirm media permissions. Local commits do not submit or publish anything. The owner requested local commits and **no push**.

## Resume

1. Inspect `git status --short` and this document.
2. Run `python3 setup.py --demo --non-interactive --verify` (Windows `py`). Follow printed ports rather than assuming 3100 is free.
3. Read the architecture/API/testing docs for the affected component. Preserve store isolation, actual audit evidence and public-safe defaults.
4. Apply required non-sensitive paired-repo updates using `SOURCE_MANIFEST.json` as a review aid; update tests/docs and commit locally without pushing.

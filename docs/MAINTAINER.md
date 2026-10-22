# Maintaining the submission mirror

This repo contains only runnable app source, app images, tests, setup, sanitized documentation and the existing license. It intentionally excludes private infrastructure/deployment notes, runtime state and video-production artifacts. `SOURCE_MANIFEST.json` records file hashes and whether a file is shared, adapted or public-only. Hashes are a review aid, not a guarantee that later changes are safe to publish.

When changing the paired development app, copy required non-sensitive shared source/assets/tests here as part of the task. Review new imports/files too. Adapted files deliberately remove lab defaults, add optional Bearer-key/OpenAI-compatible speech/model adapters, keep local-only bind defaults and use cross-platform tests/launcher behavior. Never overwrite those adaptations blindly. Public-only setup/docs must remain functional after shared changes.

Run `setup.py --demo --non-interactive --verify`, then relevant browser/provider checks. Scan the candidate tree for secrets, `.env`, databases, uploads, media, personal paths and internal hosts. Preserve `.git`, `LICENSE` and previous private artifacts. Update the handoff and manifest. Commit both repositories locally when the task includes mirrored changes; **do not push** under the owner’s current instruction.

The standard agent entry points are `AGENTS.md` and `CLAUDE.md`. Local operation and test details are in README/TESTING, provider wire formats in API_CONFIGURATION, source map in ARCHITECTURE and submission criteria in HACKATHON. Original private deployment commands and secret locations belong only in the development checkout’s operations runbook.

# Amazon Developer Hackathon: StoreYog submission checklist

Checked 2026-10-22. Primary track: **Alexa+**, using an actual self-hosted MCP server plus our own web simulator. This checklist is a project-specific guide; the [official rules](https://amazonappdev2026.devpost.com/rules), [event requirements/judging criteria](https://amazonappdev2026.devpost.com/) and [official FAQ](https://amazonappdev2026.devpost.com/details/faqs) control eligibility and submission. Recheck them before final submission. Deadline currently listed: **October 23, 2026, noon Pacific**.

## Alexa+ access: what we can honestly demonstrate

The official FAQ says the Category SDK, MCP Toolkit, Alexa AI CLI and official Web Simulator are preview tools available to **select partners**, with no participant-access application path. Classic Alexa Skills console access does not grant that preview access. This is a restriction on the preview tooling, not a requirement to purchase a third-party vendor service. The documented participant path is a self-hosted MCP/Agent Skill demonstrated through a custom frontend/simulator. [FAQ](https://amazonappdev2026.devpost.com/details/faqs)

StoreYog implements MCP 2025-11-25 Streamable HTTP, store-scoped tools, public OAuth/PKCE and a working browser simulation. Public protocol tests passed. We do **not** claim native Alexa mobile/device linking, Amazon certification, approved-partner status, real voice identity authentication or native Echo Show MCP Apps rendering. The demo PIN is for a fictitious store only. Supplier orders are simulated; POS records stock/sales without payment. The pitch email uses local capture and illustrative recipients.

## Required submission package

The event asks for a working project description, accessible source and run instructions, a public English YouTube/Vimeo demonstration under three minutes, product/tool feedback, and the selected track/challenges. An existing project must explain changes made during the event. The repository must meet the public/open-source or private-review access option; private sharing must include the named reviewers. Media permissions matter. [Requirements](https://amazonappdev2026.devpost.com/)

| Deliverable | StoreYog evidence / remaining action |
| --- | --- |
| Working experience | Hosted landing, owner workspace, customer finder and both voice views |
| Actual required technology in source | Official MCP SDK imports, Streamable HTTP entry point, scoped tools and client calls |
| Verifiable operations | `/store/admin`, matching request IDs, persisted SQL, real count/checkout tests |
| Repository | Public `https://github.com/dlyog/StoreYog`; verify latest files are actually pushed before submission |
| License | Preserve the public repo’s existing Apache-2.0 `LICENSE` |
| Judge startup | One Python setup entry point, no-API mode by default, optional private provider configuration |
| Video | V8: StoreYog on a real Echo Show, plus the web simulator and the session's MCP audit, 2:58, public on YouTube: https://youtu.be/uU1Ww_vpUAU (paste this URL into Devpost) |
| Description | Explain the solo-owner/customer problem, shared data and role separation; disclose simulation boundaries |
| Feedback | Describe tools actually used, onboarding, strengths, problems/workarounds and willingness to use again; do not imply gated tools were used |
| Change history | State what was built/significantly updated during the hackathon window, including reused reference integrations |
| Rights | Confirm permission for supplied music and third-party material; do not assume a music file’s presence establishes a license |

## Judging criteria mapped to evidence

After a viability/technology pass, the rules describe four equally weighted criteria: **Tech Implementation, Design, Potential Impact and Quality of the Idea**. [Judging criteria](https://amazonappdev2026.devpost.com/)

- **Tech Implementation:** demonstrate actual MCP transport/tool calls, SQLite shared stock, scope enforcement, OAuth and SQL correlation. The local no-API demo still executes real tools.
- **Design:** one coherent landing → workspace → voice/customer journey, readable shelf photos, hands-free pause/interrupt/stop behavior and explicit approval for restocks.
- **Potential Impact:** show a solo owner handling stock while working, a customer finding a product independently, and a partner receiving a report. Explain the business value without invented savings or market claims.
- **Quality of the Idea:** explain why a shared store ledger and separate customer/owner access solve a specific small-store problem and can extend to other small retailers.

Product-specific evidence above is our proposed presentation, not a promise of an award or guaranteed eligibility. A simulator is intentional and allowed; it must clearly show functioning source-backed behavior. [Official rules](https://amazonappdev2026.devpost.com/rules)

## Optional entries and truthful feedback

Do not select **AWS Builder** unless a qualifying actual AWS integration/tool use is documented. A self-hosted model, Amazon-named simulated order, or ordinary use of an AI coding agent does not by itself prove that requirement. Do not claim **Open Source** solely because the primary submission repo is public: the event describes an additional project/contribution with its own license/link/details. [Mini challenges](https://amazonappdev2026.devpost.com/)

An optional friction log should record a real attempted task, reproduction steps, expected/actual result, severity, workaround and actionable improvement. The rules describe a possible bonus up to 10%; don't claim one was earned before judging. Examples we can substantiate include preview-tool access confusion and account-linking discovery blocked by an overly broad proxy exclusion. Gemma GPU OOM is feedback on our chosen model infrastructure, not a defect we can attribute to Amazon’s unavailable preview toolkit. [Rules](https://amazonappdev2026.devpost.com/rules)

## Final human review

1. Check the public repository in a signed-out browser; the local checkout/commit is not proof of publication.
2. Start from a clean clone with the documented setup and reproduce the judge walkthrough without developer secrets.
3. Test the live site and audit links; label any unavailable optional speech service accurately.
4. Watch the public under-three-minute upload with sound and confirm the link is not private.
5. Complete description, feedback, track, change history and any selected challenge fields in Devpost; save and submit before the deadline. Source copies or this checklist do not submit the entry.

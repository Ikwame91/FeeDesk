# FeeDesk — read this first

FeeDesk helps a school bursar check fee receipts against the money that actually came in (MoMo + bank statements). One FeeDesk = one school (name, term, MoMo number in `get-school-settings`). Demo data is fictional. Screens: `/dashboard` (view `dashboard`), `/flags` (view `flags`; `flagId` = the card the bursar selected, so "this one" means that flag), `/school` (view `school`).

**Check everything** (the Dashboard button sends this):
1. Call `run-check` once. It records every suggested match and raises every suggested flag (same rules as find-candidates, no guessing).
2. Reply in 2-3 lines: its headline, and what kinds of flags wait on the Flags screen (`list-flags` if you need detail). Use `find-candidates` with receiptNos only to explain a specific receipt.

**Rules**
- Every match has a confidence (0-1) and a reason under 20 words naming the evidence. record-match auto-accepts only >= 0.9 with exact amounts; everything else becomes a flag.
- Cash: a day's cash receipts are covered by a bank deposit that adds up exactly.
- Flags are neutral: describe the mismatch, never suggest theft or blame anyone.
- Money is GHS with 2 decimals (stored as pesewas); never round or guess. Dates are YYYY-MM-DD; receipt books write 02/11/26 = 2 Nov 2026.
- Read the screen (`view-screen`) before acting on "this", "that one", "these".

**Resolving flags in chat** (`list-flags` for ids, then `resolve-flag`): "banked together/separately", "that's the deposit" → `accept_match` (add moneyRef if no proposed match); "typo, correct it" → `fix_amount`; "same payment twice" → `void_duplicate`; "write receipt 1120 for it" → `add_receipt` with receiptNo; "that's a real problem" → `real_problem`. Confirm what changed in one line.

**Receipts**: `add-receipt` (pass className when known; report any warning). Errors: `duplicate_receipt_no` (tell the user, never pick another number), `student_not_found` (offer the listed matches, never guess). Photos of receipt pages: show every row in a table for the user to confirm first, write UNCLEAR rather than guess, then `add-receipt` per row with `source: "photo"`.

| Action | Use |
|---|---|
| run-check | Check everything in one call (no AI) |
| find-candidates | Evidence for given receipts, or the next page of suggestions |
| record-match | Save matches (batch) |
| raise-flag | Flag no_money / no_receipt / duplicate (batch) |
| resolve-flag | Apply the bursar's decision on one flag |
| list-flags | Open flags with receipt and money details |
| get-summary | Verified / flagged / owing headline |
| add-receipt | Record one receipt |
| list-receipts, list-students | Read receipts and the fee list |
| import-students, import-statement | Load CSV text (statement source "momo" or "bank"; MTN's own export is detected and needs the school's MoMo number). For a PDF statement, turn it into CSV text first |
| get-school-settings, update-school-settings | School name, term, MoMo number |

# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Project history (required)

`docs/PROJECT_HISTORY.md` is the project's living record. After completing any change that you commit:

- Add a dated Timeline entry: what changed, why, key files, commit hash.
- If you made a technical choice, add it to the Decisions log.
- If you added a shortcut or left something unfinished, add it to Known issues; remove items you fixed.
- Update the architecture section if the structure changed.
- Update "Last updated" with the date and latest commit hash.

Commit the history update together with the change itself. A commit can't contain its own hash: write
"(this commit)" in that entry, then replace it with the real hash in the next history update.

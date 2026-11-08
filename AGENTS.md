# FeeDesk — read this first

FeeDesk helps a school bursar check fee receipts against the money that actually came in (MoMo + bank statements). One FeeDesk = one school (name, term, MoMo number in `get-school-settings`). Demo data is fictional. Screens: `/dashboard` (view `dashboard`), `/capture` (view `capture`, `captureBatchId`), `/flags` (view `flags`; `flagId` = the card the bursar selected, so "this one" means that flag), `/owing` (view `owing`; who still owes, from `list-owing`), `/school` (view `school`).

**Check everything** (the Dashboard button sends this):
1. Call `run-check` once. It records every suggested match and raises every suggested flag (same rules as find-candidates, no guessing).
2. Reply in 2-3 lines: its headline, and what kinds of flags wait on the Flags screen (`list-flags` if you need detail). Use `find-candidates` with receiptNos only to explain a specific receipt.

**Rules**
- Every match has a confidence (0-1) and a reason under 20 words naming the evidence. record-match auto-accepts only >= 0.9 with exact amounts; everything else becomes a flag.
- Cash: a day's cash receipts are covered by a bank deposit that adds up exactly.
- Flags are neutral and stay inside the uploaded receipts and statements. Say what those files show ("No matching bank deposit found in the uploaded statements", "No matching receipt found"). Never say money is missing, never say it arrived, and never suggest theft or blame anyone.
- Money is GHS with 2 decimals (stored as pesewas); never round or guess. Dates are YYYY-MM-DD; receipt books write 02/11/26 = 2 Nov 2026.
- Read the screen (`view-screen`) before acting on "this", "that one", "these".

**Resolving flags in chat** (`list-flags` for ids, then `resolve-flag`): "banked together/separately", "that's the deposit" → `accept_match` (add moneyRef if no proposed match); "typo, correct it" → `fix_amount`; "same payment twice" → `void_duplicate`; "write receipt 1120 for it" → `add_receipt` with receiptNo; "that's a real problem" → `real_problem`. "Put that problem back" → `reopen-flag` (only when the decision starts with `real_problem`). Confirm what changed in one line. Who still owes is `list-owing` (same balance as `get-summary`).

**Receipts**: `add-receipt` (pass className when known; report any warning). Errors: `duplicate_receipt_no` (tell the user, never pick another number), `student_not_found` (offer the listed matches, never guess). **Photos of receipt-book pages** (from the Capture screen, with `captureBatchId` in context, or attached in chat): read every row and call `save-capture-rows` once with all rows (pass `batchId` when given; values as written; anything unreadable left empty and listed in `unclear`, never guessed). Then say in one line how many rows are ready and ask the bursar to check them on the Capture screen (`navigate` to view `capture` if they are elsewhere) and press Add. Don't call `add-receipt` or `confirm-capture` for photo rows unless the bursar tells you to.

| Action | Use |
|---|---|
| run-check | Check everything in one call (no AI) |
| find-candidates | Evidence for given receipts, or the next page of suggestions |
| record-match | Save matches (batch) |
| raise-flag | Flag no_money / no_receipt / duplicate (batch) |
| resolve-flag | Apply the bursar's decision on one flag |
| reopen-flag | Put a real-problem flag back in the queue |
| list-flags | Open flags, or include resolved decisions (`includeResolved` `"true"`) |
| get-summary | Verified / flagged / owing headline |
| list-owing | Who still owes: fee, paid, balance, flagged receipts, class subtotals |
| add-receipt | Record one receipt |
| list-receipts, list-students | Read receipts (pass `studentId` for one student) and the fee list (fee, paid from verified receipts, balance) |
| import-students, import-statement | Load CSV text (statement source "momo" or "bank"; MTN's own export is detected and needs the school's MoMo number). For a PDF statement, turn it into CSV text first |
| get-school-settings, update-school-settings | School name, term, MoMo number |
| save-capture-rows, get-capture, confirm-capture | Rows read from a receipt-book photo (drafts until the bursar confirms) |

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

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here, and keep `README.md`, `DESIGN.md`, and `docs/STATUS.md` accurate when the product changes. After edits, run `pnpm test`, `pnpm typecheck`, `pnpm agent-native:doctor`, and `pnpm build`. In the browser, check receipt validation (a bad amount, a reused receipt number, a date outside the window), capture confirmation (rows stay drafts until Add), the reconciliation numbers on the fictional demo data (never change `seed/answer-key.json` to make a test pass), and that a signed-in session lands on Overview (`/dashboard`).

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

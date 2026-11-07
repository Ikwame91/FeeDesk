# FeeDesk — Build Handoff

**Historical.** This is the planning brief from Tue 3 Nov 2026 (Accra). It is not the current
status. What is built, what is not, and how to run the demo are in [`STATUS.md`](STATUS.md).
The submission deadline below (Tue 10 Nov 2026, 07:59 Accra) is still the deadline.

Handoff from a planning conversation (Tue 3 Nov 2026, Accra) to Claude Code for the build.
Read this fully before writing code. Live plan doc: https://claude.ai/artifact/GqYDXHDJsCVLQ1oQhha8TM

---

## 1. Who and what

- **Builder:** Kwame (Isaac Kwame Agyapong), solo. CS grad (KNUST), Data Analyst In-Training at a Ghanaian bank, comfortable with Node.js/TypeScript backend; Flutter is his other main stack. Based in Accra (UTC+0).
- **Goal:** a finished, working hackathon entry by Monday 9 Nov. Not a startup. Optimise for a complete, polished single flow and a convincing 2-minute demo.
- **How to work with him:** explain in plain English, give honest critique (not reassurance), say exactly what to fix and why, keep scope tight. He'll pick from options; don't pad.

---

## 2. The hackathon (Builder.io Agent-Native Hackathon)

- Page: https://www.builder.io/hackathon · Rules: https://www.builder.io/hackathon/rules · Submit: https://www.builder.io/hackathon/submit
- Free, global, no registration. Solo or team. Must be 18+.
- **Must build with the Agent-Native framework** (https://www.agent-native.com/docs/, repo https://github.com/BuilderIO/agent-native).
- **Challenge:** an app where people and agents work together: the agent has a real job; users get an interface to view, edit and act on its work; UI and agent share the same data and actions.
- **Originality:** original work or meaningful new development from 27 Oct 2026. Must declare pre-existing work, templates (we use the Chat template), libraries, third-party assets.
- **Submission:** project description, team details, contact, and a **public Clips demo** (https://clips.agent-native.com/) of the real app in use, viewable without login. Public repo / live deployment encouraged, not required. Recording a clip alone does NOT submit — use the form and confirm receipt.
- **Judging (0–10 each, weighted):**
  - Usefulness & Execution **40%** — clear problem, complete working flow
  - Creativity & Design 20%
  - Innovation 20% — a thoughtful people-and-agent workflow, not AI for its own sake
  - Cleverness & Use of Agent-Native 20% — interface, agent and capabilities brought together
- **Prizes:** $5,000 / $2,500 / $1,500 / $750 / $250. Non-US winners: identity check, W-8BEN, possibly up to 30% US withholding.
- **Dates (PT controls; Accra = UTC):**
  - Office hours: Tue 3 Nov and Thu 5 Nov, 8:30 AM PT = **4:30 PM Accra** (optional)
  - Final weekend: 6–8 Nov
  - **Deadline: Mon 9 Nov 11:59 PM PT = Tue 10 Nov 07:59 Accra.** Plan to submit Monday evening Accra.
  - Winners: 13 Nov

---

## 3. How we got here (so you don't re-propose rejected ideas)

1. **FeeMatch (dropped):** match anonymous MoMo payments to students. Kwame checked with a school contact: parents pay **in person (cash)** or to the **school's MoMo merchant number**, and the bursar **writes a receipt** each time, so she already knows who paid. The "which child is this for" problem mostly doesn't exist.
2. Other ideas considered and rejected: MoMo bookkeeper for traders, report-card writer, meeting-to-tasks (too common), judge simulator, clinic triage (safety), grant finder / API client (fragile), tro-tro route mapper (prior mapping exists; needs many contributors), voice-note-to-form (Twi speech-to-text too weak; high-stakes forms), market price watch (Esoko exists), paperwork navigator (accuracy risk), trader credit tracker (too much effort for busy traders; a web app can't read SMS).
3. **Kwame's rule:** *a solution shouldn't create a new problem.* No new habits for users.
4. **Final choice: FeeDesk** — checking receipts against the money that actually came in. Locked.

Honest caveat: novelty is moderate. It wins on fitting a real workflow and on the **photo-to-match demo moment**. Make that the hero.

---

## 4. The product — FeeDesk

**One line:** FeeDesk checks a school's fee receipts against the money that actually arrived, so the owner knows every receipt is backed by real money and every cedi is accounted for.

**Real workflow:** parents pay cash at the office or to the school's MoMo merchant number → bursar writes a receipt (book or machine) → two separate records exist (receipts vs money) → nobody easily checks they agree.

**Users:** bursar (daily) and school owner/proprietor (wants assurance).

**Three ways data comes in (all call the same actions):**
1. **Photo** — snap a receipt book page; the agent reads it into rows; the bursar fixes misreads in an editable table beside the photo, then confirms. Nothing is saved before confirmation.
2. **Upload** — MoMo merchant statement and bank statement (CSV; PDF if feasible).
3. **Type** — a quick receipt form, or tell the agent in chat ("Receipt 1050, Ama Owusu, JHS 1, 300 cash"). Typing is always allowed — for corrections, cash on the spot, misread photos.

**Core flow:**
1. Agent maps each receipt to the money line that pays for it, with a confidence and a short reason ("same amount, same day, payer phone ends 4417").
2. Cash receipts can be covered by a day's bank deposit (several receipts → one deposit).
3. Agent flags only problems:
   - `no_money` — receipt written, no money found
   - `no_receipt` — money received, no receipt
   - `amount_diff` — e.g. receipt 450, MoMo 405
   - `duplicate` — same payment receipted twice
4. Bursar resolves each flag with one tap or in chat: "banked separately", "typo — correct to 405", "mark as real problem".
5. Agent drafts reminders for students still owing. **Never sends anything.**

**Finish line on screen:** "118 of 120 receipts verified · 2 flagged · 12 students still owing."

**Out of scope:** live MoMo/bank connections, sending SMS/WhatsApp, multiple schools, accounting/P&L, voice notes.

**Data rules:** all people and the school ("Adenta Hills Academy") are fictional, and the demo says so. **Never use real student, parent or bank data — including anything from Kwame's job.**

---

## 5. Agent-Native framework — what we know (verified from docs)

- Open-source TypeScript framework; React UI + Nitro server; Postgres via Drizzle (local **PGlite**, hosted via `DATABASE_URL`, e.g. Neon/Supabase).
- Prereqs: Node.js **22.22+**, pnpm. An LLM is needed to run the agent: Builder.io connect, an Anthropic/OpenAI key, or local Ollama.
- Create:
  ```bash
  npx --yes @agent-native/core@latest create feedesk --standalone --template chat
  cd feedesk
  corepack enable
  pnpm install
  pnpm dev
  ```
  On the Welcome screen choose **Continue as local dev**. If peer-dependency errors: `npx clear-npx-cache` and retry.
- **Five rules** (must follow):
  1. All app state lives in Postgres via Drizzle.
  2. **All AI goes through the agent** — no inline LLM calls in actions or UI.
  3. Agent operations are typed actions in `actions/`.
  4. Live sync keeps the UI updated (SSE; polling fallback).
  5. Ephemeral UI state (navigation, selection) lives in `application_state`, readable by the agent.
- **Actions:** `actions/<name>.ts` exporting `defineAction({ description, schema (zod), http?, run })` from `@agent-native/core/action`. One action = agent tool + React hook + HTTP + CLI + MCP + A2A.
  - React: `useActionQuery("name", input)` (read; needs `http: { method: "GET" }`) and `useActionMutation("name")` from `@agent-native/core/client/hooks`.
  - CLI: `pnpm action <name> --arg=value`; DB inspection: `pnpm action db-schema`, `pnpm action db-query --sql "..."`.
  - Mutating actions auto-invalidate action-backed queries, so agent-created rows appear without refresh.
- **Schema:** `import { table, text, integer } from "@agent-native/core/db/schema"`.
- **UI → agent:** `sendToAgentChat({ message, context, submit: true })` from `@agent-native/core/client/agent-chat` (e.g. a "Check everything" button).
- **Context awareness:** UI writes a `navigation` key to application state on route change; the agent reads it via the `view-screen` action. Write the open flag/photo there so "this one" works.
- **Agent building blocks:** `AGENTS.md` (loaded every turn), skills in `.agents/skills/<name>/SKILL.md` (on demand), actions.
- **Drop-in agent UI:** `<AgentPanel />` / `<AgentSidebar />`.
- **File uploads:** `POST /_agent-native/file-upload`; needs a provider — Builder.io (auto when connected), an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) via env vars, or a custom `registerFileUploadProvider()`. Without one, `uploadFile()` returns null / 503 and chat attachments only last for the current request. Server: `uploadFile({ data, filename, mimeType })` → `{ url }`.
- **UNVERIFIED — test first:** the docs don't say whether the agent can *read* images/PDFs. It depends on the model (Claude/OpenAI support vision). This is the #1 risk.
- Deploy targets: Vercel, Netlify, Cloudflare, Render, Node, Docker, etc. Don't use Node-only APIs (`fs`, `child_process`) in server routes; keep state in SQL.

---

## 6. Data model (5 tables)

| Table | Key columns | Notes |
| --- | --- | --- |
| `students` | id, name, class, term_fee, parent_name, parent_phone | Seeded from CSV |
| `receipts` | id, receipt_no, date, student_id, amount, method (cash/momo), source (photo/upload/typed), status | One row per receipt |
| `money_lines` | id, source (momo/bank), date, payer_name, payer_phone, amount, txn_id, reference | One per statement line |
| `matches` | id, receipt_ids, money_line_id, confidence, reason, state (auto/accepted/rejected) | Several cash receipts can share one bank deposit |
| `flags` | id, kind (no_money/no_receipt/amount_diff/duplicate), receipt_id, money_line_id, note, resolution, resolved_by | The review queue |

- Balance is **computed** (term fee − verified receipts), never stored.
- Money in GHS, exact to 2 decimals (store as integer pesewas to avoid float errors).

---

## 7. Actions

Deterministic tools; the agent supplies the judgement. All callable from UI and agent.

| Action | Does | Called by |
| --- | --- | --- |
| `import-students` | Load fee list CSV | UI, agent |
| `add-receipt` | Add one receipt (form, chat, or confirmed photo rows) | UI form, agent |
| `import-statement` | Load MoMo merchant or bank lines from CSV | UI upload, agent |
| `find-candidates` | Rank money lines for a receipt by amount, date, payer name/phone | Agent |
| `record-match` | Save a match with confidence + reason; auto-accept ≥ 0.9 | Agent |
| `raise-flag` | Create a mismatch flag with a note | Agent |
| `resolve-flag` | Apply the bursar's decision | UI buttons, agent (chat) |
| `get-summary` | Verified count, open flags, students owing | UI header, agent |
| `draft-reminders` | Editable drafts for students with a balance | Agent, then UI |

**Photo flow:** bursar attaches photo in the agent panel → agent reads it and shows rows in an editable table → on confirm, calls `add-receipt` per row.

**Demo star:** `add-receipt` and `resolve-flag` run identically from a click, from chat, and (for receipts) from a photo. Show this on camera — it's the 20% framework score.

---

## 8. Screens (agent panel docked right on each)

1. **Dashboard** — header "X of 120 receipts verified · Y flagged · Z students owing"; upload slots (fee list, statements); "Add receipt" form; "Capture receipts" photo area → editable extracted rows beside the image + Confirm; "Check everything" button.
2. **Flags** (most important) — one card per mismatch: receipt, money line (or "none found"), agent's reason; buttons Banked separately · Fix amount · Mark as problem. Cards disappear when resolved; header updates live.
3. **Students** — fee, verified paid, balance, status (Paid/Part/Owing); "Reminders" tab with editable drafts, Approve/Discard.

Style: plain and confident, one accent colour, big numbers, generous spacing. Polish photo capture and Flags first.

---

## 9. AGENTS.md rules (write these)

- Role: help a school bursar check fee receipts against the money that came in.
- Photos: extract receipt #, date, student, class, amount, method; mark unclear fields uncertain; never invent values; always show rows for confirmation before adding.
- Every match has a confidence (0–1) and a reason under 20 words naming the evidence.
- Auto-accept ≥ 0.9; anything lower becomes a flag.
- Cash: try to cover a day's cash receipts with that day's bank deposits before flagging.
- Flags are neutral: describe the mismatch, never accuse anyone of theft.
- Read the current screen state before acting.
- Reminders are drafts only; polite, short, include student name, class, balance; never claim anything was sent.
- Money is exact, GHS to 2 decimals.

---

## 10. Fake data spec (seed script — regenerates a clean demo state in one command)

- `students.csv` — 45 rows: id, full name, class (Basic 1–JHS 3), term fee GHS 850–1,400, parent name, parent phone.
- Receipts — ~120: receipt #, date, student, class, amount, method. ~20 printed/handwritten onto 3–4 receipt-book pages (Kwame writes them clearly himself) for the photo demo; the rest from CSV.
- `merchant.csv` — ~100 MoMo merchant lines: date, time, payer name, payer phone, amount, txn ID, reference. Copy the column layout from a real merchant statement export; invent every value.
- `bank.csv` — ~10 lines: banked cash, often one lump sum per day.

Planted cases (target end state: 118 of 120 verified, 2 real problems):

| Case | Count | Example |
| --- | --- | --- |
| Clean match | ~95 | Receipt amount/date matches one MoMo line |
| Cash covered by bank deposit | ~15 | Several cash receipts sum to a day's deposit |
| Amount typo | 4 | Receipt 450, MoMo 405 |
| Money with no receipt | 3 | Parent never collected a receipt |
| Duplicate receipt | 2 | Same payment receipted twice |
| Receipt with no money | 2 | The two real problems |

Make the numbers internally consistent (the seed script should assert the planted counts).

---

## 11. Schedule

- **Tue 3 Nov — prove the risky part:** (optional) ask office hours "Can the agent read image and PDF uploads, and what file storage do I need?"; create app; connect key; **photo test** (attach a handwritten page, ask the agent to list every row — if it fails, fall back to typing + CSV); seed script.
- **Wed 4 Nov:** 5 tables + `import-students`, `import-statement`, `add-receipt` (+ form); set up file storage; **deploy a bare version** and confirm the agent works there.
- **Thu 5 Nov:** `find-candidates`, `record-match`, `raise-flag`, `get-summary`; AGENTS.md; tune until matching finds exactly the planted mismatches; (optional) office hours 4:30 PM Accra.
- **Fri 6 Nov:** photo → editable rows → confirm → `add-receipt`; Flags screen + `resolve-flag` from buttons and chat.
- **Sat 7 Nov:** Students table + balances; reminder drafts; live header counts.
- **Sun 8 Nov:** freeze by noon; polish; redeploy; rehearse 3×; record Clips on the deployed URL.
- **Mon 9 Nov:** fix only what the recording exposed; submit Monday evening Accra; confirm receipt.

---

## 12. Demo script (~2 min)

| Time | On screen | Say |
| --- | --- | --- |
| 0:00–0:15 | Dashboard, nothing verified | In Ghana, parents pay school fees in cash or to the school's MoMo number, and the bursar writes a receipt. Checking receipts against the money is slow, so it rarely happens. This school and its students are fictional. |
| 0:15–0:45 | Photo of handwritten page → rows appear → fix one misread → Confirm | She keeps her receipt book. One photo, the agent reads it, she checks it before anything is saved. |
| 0:45–1:00 | Upload merchant + bank statements; ask agent to check everything | The agent ties every receipt to the money that paid for it. |
| 1:00–1:15 | Header jumps to ~110; Flags screen | Clean matches verified with a reason; only mismatches wait for her. |
| 1:15–1:35 | Fix a typo flag by click; resolve a cash flag by chat ("those three were banked together Monday"); type a receipt in chat | Same actions from a click, chat or photo — one code path. |
| 1:35–1:50 | 118 of 120 · 2 flagged · 12 owing; open a reminder draft | Two receipts have no money behind them — that's what the owner needs. Reminders drafted, not sent. |
| 1:50–2:00 | Dashboard | An afternoon of ticking lines became two minutes. |

Record on the deployed URL, calm pace. Never fake a result.

---

## 13. Cut list (cut from the bottom)

1. Matching with reasons + confidence — never cut
2. Flags screen with one-tap resolution — never cut
3. Same action from chat, form and photo — never cut
4. Photo capture with editable rows — cut only if the photo test fails (fallback: typing + CSV)
5. Cash covered by bank deposits
6. Live header counts
7. Reminder drafts

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Agent can't read photos | Test tonight; ask office hours; fallback typing + CSV |
| Handwriting misread on camera | Write demo pages clearly; editable rows catch the rest |
| Uploads need file storage | Builder.io connect or S3-compatible bucket (e.g. Cloudflare R2) on day one |
| Deploy breaks late | Deploy Wednesday; redeploy daily |
| LLM credits run out | Spending cap; small demo dataset |
| Matching looks random | Tune Thursday against the planted answers |

## 15. Submission checklist

- [ ] Built with Agent-Native; new work from 27 Oct onward
- [ ] Description declares the Chat template, libraries, and what was built
- [ ] Public Clips demo, viewable logged-out (check in a private window)
- [ ] Public GitHub repo + live URL (encouraged)
- [ ] Submitted via the form; receipt confirmed
- [ ] If winning: identity check + W-8BEN

## 16. Reference links (read before building the matching part)

**Hackathon**
- Hackathon page: https://www.builder.io/hackathon
- Official rules: https://www.builder.io/hackathon/rules
- Submission form: https://www.builder.io/hackathon/submit
- Clips (demo recording): https://clips.agent-native.com/ · docs: https://www.agent-native.com/docs/template-clips/

**Agent-Native — start here**
- Getting started: https://www.agent-native.com/docs/
- Create with an agent (setup via Claude Code): https://www.agent-native.com/docs/create-with-an-agent/
- Key concepts (the five rules, data, sync, context): https://www.agent-native.com/docs/key-concepts/
- Repo: https://github.com/BuilderIO/agent-native · Discord (for questions): https://discord.gg/qm82StQ2NC

**Building blocks we'll use**
- Actions overview: https://www.agent-native.com/docs/actions-overview/
- Defining actions: https://www.agent-native.com/docs/actions-defining/
- Action run context: https://www.agent-native.com/docs/actions-run-context/
- Database (schema, Drizzle, PGlite): https://www.agent-native.com/docs/server-database/
- Client data & sync (hooks): https://www.agent-native.com/docs/client-data/
- Agent chat (client): https://www.agent-native.com/docs/client-agent-chat/
- Routing: https://www.agent-native.com/docs/client-routing/
- Context awareness (navigation / view-screen): https://www.agent-native.com/docs/context-awareness/
- Drop-in agent (AgentPanel / AgentSidebar): https://www.agent-native.com/docs/drop-in-agent/
- Native chat UI (tables/widgets in chat): https://www.agent-native.com/docs/native-chat-ui/
- Generative UI: https://www.agent-native.com/docs/generative-ui/
- File uploads (needed for photos): https://www.agent-native.com/docs/file-uploads/
- Environment variables / LLM provider keys: https://www.agent-native.com/docs/environment-variables/
- Writing agent instructions (AGENTS.md): https://www.agent-native.com/docs/writing-agent-instructions/
- Skills guide: https://www.agent-native.com/docs/skills-guide/
- UI primitives (toolkit): https://www.agent-native.com/docs/toolkit-ui/

**Templates (for patterns to copy)**
- Chat template developer guide: https://www.agent-native.com/docs/template-chat-developers/
- Analytics template (tables/dashboards pattern): https://www.agent-native.com/docs/template-analytics-developers/
- Forms template (form pattern): https://www.agent-native.com/docs/template-forms-developers/

**Deploying**
- Deploy an app: https://www.agent-native.com/docs/deploy-an-app/
- Deployment env vars: https://www.agent-native.com/docs/deployment-environment-variables/
- Vercel: https://www.agent-native.com/docs/vercel/ · Netlify: https://www.agent-native.com/docs/netlify/ · Render: https://www.agent-native.com/docs/render/
- Neon Postgres: https://www.agent-native.com/docs/neon/ · Supabase: https://www.agent-native.com/docs/supabase/

**Planning**
- Live build plan doc (FeeDesk): https://claude.ai/artifact/GqYDXHDJsCVLQ1oQhha8TM

Note: these docs move fast — if a page or API name here doesn't match what's installed, trust the installed package and the live docs over this file.

## 17. First task for Claude Code

1. Scaffold the app with the commands in §5 and get `pnpm dev` running.
2. Help Kwame run the photo test (§11, Tue).
3. Write the seed script and data files (§10), with assertions on the planted counts.
4. Then follow the schedule.

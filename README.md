# FeeDesk

FeeDesk checks a school's fee receipts against the money that actually arrived, so the
owner knows every receipt is backed by real money and every cedi is accounted for.

> All people, students and the school ("Adenta Hills Academy") in this project are fictional.

## The problem

In many Ghanaian schools, parents pay fees in cash at the office or to the school's MoMo
merchant number, and the bursar writes a receipt each time. That leaves two separate records,
the receipt book and the money that actually came in (MoMo statement, bank deposits), and
nobody has time to check that they agree.

## What FeeDesk does

1. **Bring in receipts.** Photograph a receipt-book page (the agent reads it into rows you
   check before saving), type a receipt, or tell the agent in chat.
2. **Bring in the money.** Upload the MoMo merchant statement and the bank statement.
3. **Match.** The agent ties each receipt to the money that paid for it, with a confidence
   score and a short reason. Cash receipts can be covered by that day's bank deposit.
4. **Flag only the problems:** receipt with no money, money with no receipt, amount
   differences, and duplicate receipts.
5. **Resolve.** The bursar settles each flag with one tap or in chat.

Students (fee, paid, balance) and reminder drafts are not built.

The same actions run from a button click, from chat, and from a photo. People and the agent
work on the same data.

## Status

Live demo: https://feedesk-gh.netlify.app (branch `scaffold-app`). Current detail is in
[`docs/STATUS.md`](docs/STATUS.md). Deadline: **Tue 10 Nov 2026, 07:59 Accra**.

- [x] App scaffolded and running
- [x] Photo test passed (29 of 30 fields read from a handwritten page, nothing invented)
- [x] Photo capture screen (`/capture`): the agent reads a page into rows; nothing is saved until Add
- [x] Demo data and seed script (`pnpm demo:generate`, `pnpm demo:load`)
- [x] Data tables and actions
- [x] Matching and flags (Overview "Check everything" / "Check without AI", Flags screen)
- [x] Deployed demo (Netlify + Neon)
- [ ] Students screen
- [ ] Reminder drafts

## Run it locally

Needs Node.js 22.22+ and pnpm.

Two secrets, generated separately. Each is 64 hex characters. Use them in `.env` locally and
again in Netlify. Do not commit them, and do not reuse one value for both.

```bash
openssl rand -hex 32   # BETTER_AUTH_SECRET — signs logins. Keep it; changing it signs everyone out
openssl rand -hex 32   # SECRETS_ENCRYPTION_KEY — encrypts stored provider keys
```

```bash
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:8080, choose **Continue as local dev**, then connect an AI provider
under **Connect AI**. The check itself does not need a provider: **Check without AI** or
`pnpm demo:check`. Load the fictional demo data with `pnpm demo:load`.

To reset the local database to the fictional school, run `pnpm demo:load` again. The hosted
reset is in [`docs/DEPLOY.md`](docs/DEPLOY.md). Placeholders only; never paste a real URL or secret into chat.

## Built with

- [Agent-Native](https://www.agent-native.com/docs/) framework, starting from its **Chat
  template** (`@agent-native/core` 0.223.0). Everything FeeDesk-specific is new work from
  3 Nov 2026.
- React, React Router, Vite, Drizzle ORM, PGlite / Postgres, Tailwind CSS, Zod.

The 3 Nov planning brief is historical: [`docs/HANDOFF.md`](docs/HANDOFF.md). What is built now is [`docs/STATUS.md`](docs/STATUS.md).

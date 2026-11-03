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
6. **Remind.** The agent drafts polite reminders for students who still owe. It never sends
   anything.

The same actions run from a button click, from chat, and from a photo. People and the agent
work on the same data.

## Status

Work in progress for the Builder.io Agent-Native Hackathon (Nov 2026).

- [x] App scaffolded and running
- [ ] Photo test (can the agent read a handwritten receipt page?)
- [ ] Demo data and seed script
- [ ] Data tables and actions
- [ ] Matching and flags
- [ ] Flags, Students and Reminders screens
- [ ] Deployed demo

## Run it locally

Needs Node.js 22.22+ and pnpm.

```bash
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:8080, choose **Continue as local dev**, then connect an AI provider
under **Connect AI**.

## Built with

- [Agent-Native](https://www.agent-native.com/docs/) framework, starting from its **Chat
  template** (`@agent-native/core` 0.223.0). Everything FeeDesk-specific is new work from
  3 Nov 2026.
- React, React Router, Vite, Drizzle ORM, PGlite / Postgres, Tailwind CSS, Zod.

Planning notes: [`docs/HANDOFF.md`](docs/HANDOFF.md).

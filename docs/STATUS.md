# FeeDesk — status

Live site: https://feedesk-gh.netlify.app
Branch: `scaffold-app`
Latest commit: `ec5adf7` (`ec5adf732095aee563a77bce30915d68047dadac`), "Keep review copy inside the uploaded records and document what is actually built."

Deadline: **Tue 10 Nov 2026, 07:59 Accra** (Mon 9 Nov 2026, 11:59 PM Pacific).

All people, students, and "Adenta Hills Academy" are fictional.

The 3 Nov planning brief is historical: [`HANDOFF.md`](HANDOFF.md).

## Done

- Overview, To review, Capture, School, and chat, on the same actions.
- Receipts by photo (drafts until Add), by typing, or by chat.
- CSV import for the fee list, the simple MoMo layout, MTN's own export, and the demo bank layout.
- Check everything, including **Check without AI** (`pnpm demo:check`).
- Flag review and the shared resolve actions.
- Owing (`/owing`): name, class, fee, paid, balance, and any flagged receipt, grouped by class. Linked from Overview, To review, and the sidebar. No reminders.
- Decided items on To review, and Reopen for a flag kept as a real problem.
- Banknote design. Light by default, dark from the sidebar.
- Deployed on Netlify with Neon Postgres (Frankfurt). Invite-only sign-up.

## Not done

- Reminder drafts. Nothing is sent.
- Judges cannot sign up on the live site. The public demo is the recording.

## Verified

On 7 Nov 2026, against the fictional seed in an in-memory database (not the live database, and not `seed/answer-key.json`):

- Base load: 45 students, 113 receipts, 103 MoMo lines, 7 bank lines. Photo receipts are 1114–1119.
- Check on that base: `102 of 113 receipts verified · 11 flagged · 20 students owing`. The review list is 18 cards (the 11 receipt flags plus statement lines that have no receipt yet, including the six photo-page payments).
- After adding 1114–1119 and checking again: `108 of 119 receipts verified · 11 flagged · 17 students owing`, 12 cards.
- After resolving every open card the way the demo does: `118 of 120 receipts verified · 2 flagged · 12 students owing`, 0 cards.

`pnpm test`: 54 passed (9 files). `pnpm typecheck`: exit 0. `pnpm agent-native:doctor`: clean, no findings. `pnpm build`: exit 0 ("Build complete"). The build also printed a production configuration error because this laptop's `.env` sets `AUTH_DISABLED=true`. That is local only. Netlify must not set `AUTH_DISABLED`. Do not edit `seed/answer-key.json` to force a result.

The same local ledger, checked, shows on screen as **102 / 113**, **18 items to review** (9 about receipts, 11 receipts; 9 payments with no receipt), **20 students still owe**. Screenshots of sign-in, Overview, Flags, Capture, School, and chat at 1280px and 390px are in `docs/screenshots/`.

On a 390px Capture screen the chat panel is a bottom sheet. The page column ends at the top of that sheet, and the DD/MM/YYYY hint sits above it. The cookie banner stays on screen. The page column ends above it: at 390px **Type the rows** is fully above the banner, and at 1280px the review actions are fully above it.

## Unverified

- The live site was not opened, reset, or changed for this pass.
- A finished photo read was not repeated for this pass. While shooting Capture, a sample JPEG was attached and a read did start (the chat showed "Thinking"); the browser was then closed. The recorded photo pass is still [`PHOTO_TEST.md`](PHOTO_TEST.md).
- The hosted database was not touched.

## Local setup

Node.js 22.22+ and pnpm.

Generate the two secrets separately. Use each value in `.env` and again on Netlify. Do not commit them, and do not reuse one string for both.

```bash
openssl rand -hex 32
```

- First result → `BETTER_AUTH_SECRET` (signs logins; changing it signs everyone out)
- Second result → `SECRETS_ENCRYPTION_KEY` (encrypts stored provider keys)

```bash
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:8080. **Continue as local dev**, or set `AUTH_DISABLED=true` in `.env` for this machine only.

If the shell already has a `DATABASE_URL` that is not Postgres, `pnpm dev` names it. `unset DATABASE_URL` and try again. Local data then lives in `./data/pglite`.

## Reset

Local, fictional data only:

```bash
pnpm demo:load
```

Hosted, from a laptop, with `pnpm dev` stopped. Placeholders only:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST/DB?sslmode=require' AGENT_USER_EMAIL='you@example.com' pnpm demo:load
```

Expect: `Demo data loaded: 45 students, 113 receipts, 103 MoMo lines, 7 bank lines`.

## AI, and the check without it

Connect a provider in the app: **New chat → Connect AI → Use Builder.io**, or **Custom keys**. The live site has its own connection. A connection on a laptop does not carry over.

The match does not call a model. **Check without AI** on Overview, or `pnpm demo:check`, runs the same rules. Photo reading does need a connected provider. With no credits, type the rows on Capture instead. They go through the same checks.

## Known limitations

- One school per installation. The term on School is a label only.
- No reminder drafts. Who still owes is on Owing.
- The photo on Capture stays in that browser tab. After a reload the rows remain and the photo is gone.
- Handwriting can misread a name. The bursar's check is what catches it. A close spelling can be offered; a tie is not filled in.
- Two people running a check at the same moment could record the same match. Fine for one bursar.
- Seed dates are Sep–Oct 2026. `pnpm demo:load` starts failing when those dates are more than a year old (Sep 2027).
- Telecel, AirtelTigo, and real bank CSV layouts are not parsed. The agent can turn a PDF or another export into CSV first.
- The cookie banner still appears in consent regions. It is not hidden. The page column ends above it, and on a phone the chat panel is a sheet above that.
- **Continue as local dev** fails while this app loads `AUTH_SIGNUP=invited` from `netlify.toml` (email sign-up is off). The sign-in card still appears. Local work uses `AUTH_DISABLED=true` in `.env`, which skips that card and opens Overview.
- Invite-only sign-up on the live site. There is no email service, so verification mail is off.

## Four demo states

Base, after `pnpm demo:load` (photo-page receipts 1114–1119 are not in the book yet):

| | Count |
|---|---|
| Students | 45 |
| Receipts | 113 |
| MoMo lines | 103 |
| Bank lines | 7 |

After **Check without AI** on that base:

**102 / 113** receipts verified · **11** flagged · **20** students owing.

After receipts **1114–1119** are added and the check is run again:

**108 / 119** verified · **11** flagged · **17** owing · **12** review cards.

After every open card is resolved (fix the amount, void the extra receipt, confirm the later deposit, write a receipt for a statement line, mark the two with no matching line as a real problem):

**118 / 120** verified · **2** flagged · **12** owing.

The 2 that stay flagged are the two receipts with no matching line in the uploaded statements.

## Recording script

Use only what is built. Stay on the fictional school. Do not open reminders; nothing is sent. Resolving a card before the second check changes the **108 / 119** headline, so resolve only after that check.

1. Sign in on https://feedesk-gh.netlify.app (the bootstrap email). Land on Overview.
2. Show the base headline, then press **Check without AI**. Read **102 / 113**, 11 flagged, 20 owing.
3. Open **To review**. Read one card in the uploaded-statement wording. Do not resolve it yet.
4. Open **Capture**. Either snap the handwritten page of receipts 1114–1119 (only if AI is connected) or press **Type the rows** and enter those six. Check the rows against the page. Press **Add**.
5. Back on Overview, **Check without AI** again. Read **108 / 119**, 11 flagged, 17 owing, and the "items to review" breakdown.
6. Resolve the open cards. Show one stamp (fix an amount, or confirm the later deposit), then finish the rest the same way: fix amounts, void the extra receipt, confirm the later deposit, write a receipt for a statement line, and mark the two with no matching line as a real problem. Stop when To review says nothing is left, and the two kept problems are listed under Decided.
7. Open **Owing**. Say: everything checked; here are the 12 to chase. The total is GHS 5,000.00, and the two kept problems are marked on their students (receipt 1019 is GHS 250.00).
8. Open **School** and show the name, the term, and the MoMo number. Do not need to change them.
9. Open the chat panel from a flag (**Ask the agent**) only if a provider is connected. One sentence is enough. If it is not connected, skip chat and say the check does not need it.

Stop. Do not invent a sent reminder.

## Secrets

`BETTER_AUTH_SECRET` and `SECRETS_ENCRYPTION_KEY` are different values. Generate each with `openssl rand -hex 32`. Both are required locally and on Netlify. Placeholders only in git.

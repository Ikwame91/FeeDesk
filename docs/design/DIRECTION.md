# FeeDesk — Design direction

Working document for the redesign, following the App Designer method (concept → three rendered
directions → one chosen → content first → screens → shoot, scan, critique). App Designer targets iPhone
apps; FeeDesk is a laptop web app, so its device kit and renderer are not used. Its rules and rubric are.

## Brief

- **What and for whom:** a bursar at a Ghanaian private school (and the owner who wants assurance)
  checking that every fee receipt is backed by money that actually arrived.
- **Core action, first ten seconds:** see whether the money and the receipts agree, then deal with the
  few that don't.
- **Feel (Kwame):** *calm*, *trustworthy*, and memorable — Creativity & Design is scored.
- **References outside software (self-authored):** a Bank of Ghana cedi note held up to the light; an
  Accra harmattan morning; a banking hall after closing.
- **Existing assets:** none (fictional school "Adenta Hills Academy"). No logo, no brand colours.
- **Needs:** the Dashboard and the Flags screen redesigned in the real app (React + Tailwind), then the
  photo-capture screen built in the same direction.
- **Image generation:** none. Richness must come from shape, colour or material drawn in SVG/CSS.

Brief items 2–5 beyond Kwame's words are **self-authored**.

## The category default we refuse

School-fee and finance SaaS share one look: white page, navy or royal-blue primary, Inter, a greeting
("Welcome back, Admin"), a row of four stat tiles each with its own colour chip, a bar chart card, a
"Recent transactions" table with green/red pills. Ghanaian products add a second cliché: the flag's red,
gold and green, or kente stripes as decoration. Money apps reach for green.

FeeDesk today *is* the first default, minus the colours: grey shadcn cards, Inter, equal-weight stat
numbers, three equal upload boxes. We refuse: stat-tile rows, navy/royal blue, money-green, flag
colours, kente as wallpaper, Inter, cards around every section, confetti status colours.

## Three concepts

| | A. Banknote | B. Harmattan | C. Banking hall |
|---|---|---|---|
| Sentence | FeeDesk is a cedi note held up to the light. | FeeDesk is an Accra harmattan morning. | FeeDesk is a banking hall after closing time. |
| Family | object | nature | place |
| Ground | light (bone paper) | colour-field (dusty apricot haze) | dark (bottle green-black) |
| Type | serif (Bodoni Moda didone numerals) + Public Sans | expanded grotesque (Bricolage Grotesque) | condensed (Barlow Condensed) + IBM Plex Mono figures |
| Accent hue | red (intaglio oxblood) | orange (low sun) | yellow (brass) |
| Richness | shape: a guilloché security rosette, drawn | colour-material: layered haze bands and a pale sun disc | colour-material: brass rules, a teller-window arch |
| Why calm / trustworthy | Security printing is the oldest visual language of "this money is real" | Soft, warm, unhurried light; nothing shouts | Quiet authority of a bank after the noise has gone |
| Its own trap | Costume: fake money, too ornate | Wellness-app softness; sunset cliché | Sci-fi dark dashboard; brass kitsch |

## Content (real, from the demo data after "Check")

- School: Adenta Hills Academy · First term 2026/27 · statements to Fri 30 Oct
- 108 of 119 receipts verified · 11 receipts flagged · 12 flags to review · 17 students still owe
- Flag examples: Receipt 1031 Linda Asante wrote GHS 407.00, George Asante sent GHS 470.00 (Wed 23 Sept);
  Receipt 1019 Edem Kpodo GHS 250.00 cash never reached the bank (Thu 17 Sept); three Friday cash
  receipts, GHS 890.00, banked Mon 12 Oct; GHS 470.00 MoMo from Akosua Addo with no receipt.

## Exploration and decision

Rendered in `docs/design/explore/` (`explore.html` → `a-banknote.png`, `b-harmattan.png`,
`c-banking-hall.png`, 1280×800, same real content in each).

**Chosen: A. Banknote.** Cover the name and it still reads "this money is real": the guilloché seal and
the engraved numerals carry the concept, it is the calmest of the three, and the most trustworthy.

- **B. Harmattan lost:** warm and calm, but it slid toward the wellness-app sunset, the lower half had
  nothing to hold it, and it read soft rather than trustworthy.
- **C. Banking hall lost:** strong presence, but dark ground + all-caps condensed + mono reads as a
  trading terminal, which is tiring for a bursar all day and not calm.
- **Merged in from B:** plain sentences with the action word at the right of each row.

Risk named by the method (§7 "The overcorrection"): paper + one red + serif + ruled rows is close to the
skill's own austere rut. Answered with a richness source on the first screen: the guilloché seal and a
soft three-colour **underprint** behind the hero, as on real notes.

## Tokens (as built, `app/global.css`)

| Role | Light | Dark ("the same note under a desk lamp") |
|---|---|---|
| Paper (background) | `hsl(70 14% 92%)` bone | `hsl(150 10% 8%)` green-black |
| Ink (foreground) | `hsl(156 9% 11%)` | `hsl(45 25% 88%)` warm white |
| Secondary ink | `hsl(137 4% 36%)` | `hsl(135 5% 62%)` |
| Rule (hairlines) | `hsl(78 10% 80%)` | `hsl(147 8% 19%)` |
| **Oxblood** — the one accent: "act here" and "money missing" | `hsl(2 56% 35%)` | `hsl(7 52% 62%)` |
| Underprint tints (hero only) | peach `14 62% 70%`, sage `160 28% 62%`, gold `42 55% 70%`, at 16–26% | deepened, 12–22% |

- **Type:** Bodoni Moda (display: the big numeral, headings, receipt numbers as italic "№ 1031") and
  Public Sans (all UI text; a public-service face, chosen for plainness and trust). Tabular lining figures
  for every amount. Inter removed.
- **Scale:** hero numeral 96–168px (clamp), review heading 40–56px, section headings 24px, body 15px,
  metadata 13–14px, labels 12px.
- **Radius:** 4px (`--radius: 0.25rem`): printed matter, not pills.
- **Layout:** ruled sections (1.5px ink rule opens a section, hairlines between rows); no boxed cards; one
  hero per screen.

## Signature

**The stamp.** When the bursar settles a flag (fix the amount, confirm a deposit, void a duplicate, write
the missing receipt), the entry dims and a small guilloché seal reading *settled* stamps onto it
(420 ms, scale 1.6 → 0.94 → 1 with a slight rotation), then the entry leaves and the counts update.
"Mark as a real problem" deliberately gets no stamp. Reduced motion: no animation, the seal just appears.

## Screens built

- **Overview** (`/dashboard`): masthead with the school; hero numeral "108 / 119 receipts are backed by
  money that *actually arrived*" + totals; the seal; "Twelve need you" queue (4 rows, plain sentences,
  action at right); "Receipts and statements" (uploads as ruled lines, Write a receipt, Latest receipts with
  a status column).
- **To review** (`/flags`): "Twelve to review" heading; one ruled entry per flag: engraved receipt number,
  plain title, *written in the receipt book* vs *what actually arrived* side by side, what happened / what to
  do, one primary action, "Mark as a real problem", "Ask the agent", evidence folded away.
- Sidebar: **Fee*Desk*** wordmark replaces the template logo; Overview / To review (count) / New chat.

- **Capture** (`/capture`): "Read a receipt page"; the photo on one side (above the table when the agent
  panel leaves too little room), the rows as an editable table with unclear cells in oxblood and a
  plain note per row, "Add N receipts"; while the agent reads, the seal turns slowly.
- Review feedback applied (Grok): count breakdown under "12 to review", numerals not words, check buttons
  always visible, one wording per action, hint placeholders, secondary ink darkened (30% / 69%).

Not designed yet: Students, Reminders.

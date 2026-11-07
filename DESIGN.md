# Visual design contract

FeeDesk uses the **Banknote** direction: a cedi note held up to the light. Bone paper, near-black ink,
one oxblood accent, Bodoni Moda for the numeral and headings, Public Sans for everything else.
The full decision, including the two directions that lost, is in [`docs/design/DIRECTION.md`](docs/design/DIRECTION.md).

This file replaces the Chat template's "Quiet conversation library" contract. That contract is historical.

## Product

- Audience: a school bursar checking fee receipts against uploaded MoMo and bank statements.
- Primary screen: Overview (`/dashboard`). The hero is the verified count. The queue under it is the work.
- Other screens: To review (`/flags`), Capture (`/capture`), School (`/school`), Chat (`/chat` and the side panel).
- Not built: Students, reminder drafts. Do not add them as navigation.

## Colour

Roles, as set in `app/global.css`:

| Role | Light | Dark |
|---|---|---|
| Paper | `hsl(70 14% 92%)` | `hsl(150 10% 8%)` |
| Ink | `hsl(156 9% 11%)` | `hsl(45 25% 88%)` |
| Secondary ink | `hsl(137 5% 30%)` | `hsl(135 6% 69%)` |
| Example text (placeholders) | `hsl(137 8% 40%)` | `hsl(135 8% 52%)` |
| Rules | `hsl(78 10% 80%)` | `hsl(147 8% 19%)` |
| Oxblood, the one accent ("act here") | `hsl(2 56% 35%)` | `hsl(7 52% 62%)` |

Placeholders use the example-text token at full opacity, in italic. Do not fade them with a 50% alpha.
One accent. No stat-tile colours, no money-green, no flag colours, no indigo gradients.

## Type

- Display: Bodoni Moda. Hero numeral, screen titles, italic receipt numbers.
- UI: Public Sans. Inter is not the UI face.
- Figures that are amounts or counts: tabular lining numbers.
- Sentence case. A button is a short verb. Flag sentences describe the uploaded files only.

## Layout

- Ruled sections: a 1.5px ink rule opens a section, hairlines between rows. A card is not the default container.
- One hero per screen. The Overview hero is the big fraction. To review's hero is the count.
- Capture: the photo and the rows sit side by side when the column is at least 48rem, and stack when it is narrower. Stacked, the photo stays short so the rows remain on the page. Below 40rem each row is a block of fields, not a table that runs off the side.
- The chat panel on a phone is a sheet at the bottom. The page above it stays usable. The cookie banner stays visible and leaves space under the controls; it is not hidden.
- Radius is 4px.

## Copy that must stay

Flag titles, tags, and sentences come from `app/lib/explain-flag.ts`. They name what the uploaded receipt
and the uploaded statement show. They do not say the money is missing, and they do not say it arrived.
Overview says "N items to review" and the same breakdown as To review.

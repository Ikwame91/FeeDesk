# FeeDesk — Critique log

Rubric and stop rule from App Designer's `critique.md` (scores 1–5; done = no line below 3 and at least
9 of 12 at 4+). **Self-scored**: no separate critic agent was used, to save time and cost. Read these as
the designer's harsh self-assessment, not an independent review. "Native fluency" is judged as a laptop web
app, not iOS.

Screens: `shots/r1/` (first build), `shots/r3/` (after fixes, incl. `stamp-mid.png`).

| # | Line | R1 | R3 | Evidence (R3) |
|---|---|---|---|---|
| 1 | Concept on the pixel | 4 | 4 | Guilloché seal + engraved Bodoni numerals; reads "money that's real" without the name |
| 2 | Not the category average | 4 | 4 | No stat tiles, no navy/green, no flag colours, no card grid |
| 3 | Not this skill's average | 3 | 4 | Underprint tint and seal give the first screen something to look at; rows speak the direction's voice (№ numerals) |
| 4 | Hierarchy | 5 | 5 | Squint: the numeral lands first, then "Twelve need you" |
| 5 | Typography | 4 | 4 | Didone display vs 15px Public Sans; tabular figures; tight tracking on display |
| 6 | Colour | 4 | 4 | One oxblood with one job; dark mode designed (green-black paper, lifted oxblood) |
| 7 | Richness | 3 | 4 | Seal + soft underprint on screen one; still no imagery (none available) |
| 8 | Rhythm and space | 4 | 4 | 1.5px rules open sections, hairlines within; generous break under the hero |
| 9 | Craft details | 3 | 4 | Fixed: broken lede wrap, faded disabled button, CAPS payer names, cramped phone rows, hard-edged tint |
| 10 | Fluency (web) | 4 | 4 | Standard links/buttons, works at 390px, dark mode |
| 11 | Signature | 3 | 4 | The *settled* stamp, verified on screen (`stamp-mid.png`); was invisible in R2 because the list refreshed too fast |
| 12 | Feature test | 4 | 4 | "A fee checker that looks like the money it guards" |

**R3: done by the stop rule** (no line below 3, 11 of 12 at 4+).

## Changes R1 → R3
1. Disabled "Check new receipts" (looked broken) → "✓ Every receipt checked" when nothing is new.
2. "actually / arrived" split across lines → kept together, wider lede.
3. Underprint added behind the hero (richness, and out of the austere rut); then softened so no hard edge.
4. Payer names in normal case.
5. Phone: queue action moves under the sentence.
6. Stamp: list held while the seal plays, so the signature is actually seen.

## Not verified
Real-device feel and motion timing on a slow laptop; Bodoni rendering on Windows; colour contrast was
checked by eye, not measured.

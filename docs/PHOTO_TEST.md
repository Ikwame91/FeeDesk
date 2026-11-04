# Photo test (Tue 3 Nov)

Goal: prove the agent can read a handwritten receipt-book page into rows.
If it can't, fall back to typing + CSV (cut-list item 4).

## What we already know (from the installed framework, @agent-native/core 0.223.0)

- Image attachments in the chat are sent to the model **inline as base64 vision images**
  in the same request. No file storage (S3/R2/Builder) is needed for this test.
- File storage only matters later, for keeping the photo after the request
  (showing it beside the editable rows).
- PDFs are also passed through as file parts, so PDF statements are possible later.
- Limits: images over the per-image size limit are refused — take the photo at normal
  phone resolution, not "max". SVG is not read as an image.
- Vision depends on the model. Claude (Sonnet/Opus) and GPT-4o-class models can see images.

## Steps

1. `pnpm dev` and open http://localhost:8080
2. Choose **Continue as local dev**, then **Connect AI → Custom keys** and paste an
   Anthropic key (set a spending cap in the Anthropic console first).
3. Write one receipt-book page by hand, ~5 receipts, all fictional, e.g.

   | Receipt # | Date | Student | Class | Amount (GHS) | Method |
   | --- | --- | --- | --- | --- | --- |
   | 1041 | 02/11/26 | Ama Owusu | JHS 1 | 300.00 | Cash |
   | 1042 | 02/11/26 | Kofi Mensah | Basic 4 | 450.00 | MoMo |
   | 1043 | 02/11/26 | Esi Boateng | Basic 2 | 1,200.00 | Cash |
   | 1044 | 03/11/26 | Yaw Asante | JHS 3 | 250.50 | MoMo |
   | 1045 | 03/11/26 | Abena Darko | Basic 6 | 600.00 | Cash |

4. Photograph it with your phone (daylight, flat, whole page in frame).
5. Attach the photo in the chat and send:

   > This is a page from a school receipt book. List every receipt as a table with
   > columns: receipt number, date, student name, class, amount in GHS, method
   > (cash or momo). If any field is unclear, write "UNCLEAR" — do not guess.

6. Compare with what you wrote.

## Pass / fail

- **Pass:** every row found; ≥ 90% of fields exact; unclear fields marked UNCLEAR
  rather than invented. → keep the photo flow as the demo hero.
- **Soft pass:** rows found but a few misreads. → fine; the editable table catches them.
  Write the demo pages more neatly.
- **Fail:** rows missing or values invented. → try a printed page; if that also fails,
  drop photo capture and use typing + CSV.

Record the result here (date, model, what was misread).

## Result — 4 Nov 2026: PASS

- Ran in Builder.io (Builder-connected model, "Auto"), photo attached in chat.
- Page: handwritten, photo rotated 90°, table split across two pages of the book, old writing
  showing through the paper.
- 5 of 5 rows found. 29 of 30 fields exact. 0 wrong values.
- The one miss: student name on 1045 ("Abena Darko") returned as UNCLEAR, which is the
  behaviour we want (no guessing).
- Decision: keep photo → editable rows → confirm as the demo hero.

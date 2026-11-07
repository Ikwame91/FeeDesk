import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { parseCsvRecords } from "../server/lib/csv.js";
import { ImportError, isMtnLayout, parseBankCsv, parseMomoCsv, parseMtnMomoCsv } from "../server/lib/importers.js";
import { insertMoneyLines } from "../server/lib/ledger.js";
import { getSchool } from "../server/lib/school.js";

const errors = defineActionErrors("not_signed_in", "bad_file");

export default defineAction({
  description:
    'Import money that came in from a statement CSV. source "momo" accepts two layouts: MTN\'s own export (TRANSACTION DATE, FROM NO., TO NO., AMOUNT, F_ID, REF…; only money paid TO the school\'s MoMo number is kept, F_ID is the transaction ID, the real sender of bank/cross-network payments is read from REF) or a simple merchant layout (Transaction ID, Date/Time, From Name, From Number, Amount (GHS), Reference, Status). source "bank": Date, Description, Reference, Credit (GHS); debits skipped. Amounts become exact pesewas, phones 0XXXXXXXXX. Lines already imported are skipped. For a PDF statement, turn it into CSV text first.',
  schema: z.object({
    source: z.enum(["momo", "bank"]).describe('"momo" for a MoMo statement (MTN export or merchant layout), "bank" for the bank statement'),
    csv: z.string().min(1).max(2_000_000).describe("Full CSV text including the header row"),
    schoolMomoNumber: z
      .string()
      .max(20)
      .optional()
      .describe("MTN layout only: the school's MoMo number, if it differs from School settings. Normally omit it"),
  }),
  outputSchema: z.object({
    added: z.number().describe("New money lines"),
    skipped: z.number().describe("Lines already imported earlier"),
    layout: z.string().describe('"mtn", "merchant" or "bank"'),
    ignored: z.number().describe("MTN rows that were not money in to the school (withdrawals, fees, other numbers)"),
    message: z.string(),
  }),
  errors,
  maxBodyBytes: 2_100_000,
  run: async ({ source, csv, schoolMomoNumber }, ctx) => {
    const ownerEmail = ctx?.userEmail ?? errors.noWrite("Sign in to import statements.", "not_signed_in", { statusCode: 401 });
    let rows;
    let layout: "mtn" | "merchant" | "bank" = source === "bank" ? "bank" : "merchant";
    let ignored = 0;
    try {
      if (source === "bank") rows = parseBankCsv(csv);
      else if (isMtnLayout(parseCsvRecords(csv).header)) {
        layout = "mtn";
        const school = schoolMomoNumber ?? (await getSchool()).momoNumber;
        const parsed = parseMtnMomoCsv(csv, school);
        rows = parsed.rows;
        ignored = parsed.skipped.notToSchool + parsed.skipped.outgoing;
      } else rows = parseMomoCsv(csv);
    } catch (e) {
      if (e instanceof ImportError) errors.noWrite(e.message, "bad_file", { details: { problems: e.problems.slice(0, 20) } });
      throw e;
    }
    const { added, skipped } = await insertMoneyLines(rows, ownerEmail);
    const label = source === "momo" ? "MoMo" : "bank";
    return {
      added,
      skipped,
      layout,
      ignored,
      message:
        `Imported ${added} ${label} lines${skipped ? ` (${skipped} already there)` : ""}` +
        (layout === "mtn" ? ` from an MTN statement; ${ignored} rows were not money in to the school and were left out.` : "."),
    };
  },
});

import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { ImportError, parseBankCsv, parseMomoCsv } from "../server/lib/importers.js";
import { insertMoneyLines } from "../server/lib/ledger.js";

const errors = defineActionErrors("not_signed_in", "bad_file");

export default defineAction({
  description:
    'Import money that came in from a statement CSV. source "momo": MoMo merchant statement (Transaction ID, Date/Time, From Name, From Number, Amount (GHS), Reference, Status; only SUCCESSFUL lines). source "bank": bank statement (Date, Description, Reference, Credit (GHS); debits skipped). Amounts are stored as exact pesewas. Lines already imported (same transaction ID or bank reference) are skipped.',
  schema: z.object({
    source: z.enum(["momo", "bank"]).describe('"momo" for the MoMo merchant statement, "bank" for the bank statement'),
    csv: z.string().min(1).max(2_000_000).describe("Full CSV text including the header row"),
  }),
  outputSchema: z.object({
    added: z.number().describe("New money lines"),
    skipped: z.number().describe("Lines already imported earlier"),
    message: z.string(),
  }),
  errors,
  maxBodyBytes: 2_100_000,
  run: async ({ source, csv }, ctx) => {
    const ownerEmail = ctx?.userEmail ?? errors.noWrite("Sign in to import statements.", "not_signed_in", { statusCode: 401 });
    let rows;
    try {
      rows = source === "momo" ? parseMomoCsv(csv) : parseBankCsv(csv);
    } catch (e) {
      if (e instanceof ImportError) errors.noWrite(e.message, "bad_file", { details: { problems: e.problems.slice(0, 20) } });
      throw e;
    }
    const { added, skipped } = await insertMoneyLines(rows, ownerEmail);
    const label = source === "momo" ? "MoMo" : "bank";
    return { added, skipped, message: `Imported ${added} ${label} lines${skipped ? ` (${skipped} already there)` : ""}.` };
  },
});

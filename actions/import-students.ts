import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { ImportError, parseStudentsCsv } from "../server/lib/importers.js";
import { upsertStudents } from "../server/lib/ledger.js";

const errors = defineActionErrors("not_signed_in", "bad_file");

export default defineAction({
  description:
    "Import the school's fee list from CSV text (columns: student_id, full_name, class, term_fee_ghs, parent_name, parent_phone). Fees are GHS and stored as exact pesewas. Existing students with the same ID are updated. The whole file is rejected if any row is invalid.",
  schema: z.object({
    csv: z.string().min(1).max(1_000_000).describe("Full CSV text including the header row"),
  }),
  outputSchema: z.object({
    added: z.number().describe("New students"),
    updated: z.number().describe("Existing students whose details were replaced"),
    message: z.string(),
  }),
  errors,
  maxBodyBytes: 1_100_000,
  run: async ({ csv }, ctx) => {
    const ownerEmail = ctx?.userEmail ?? errors.noWrite("Sign in to import students.", "not_signed_in", { statusCode: 401 });
    let rows;
    try {
      rows = parseStudentsCsv(csv);
    } catch (e) {
      if (e instanceof ImportError) errors.noWrite(e.message, "bad_file", { details: { problems: e.problems.slice(0, 20) } });
      throw e;
    }
    const { added, updated } = await upsertStudents(rows, ownerEmail);
    return { added, updated, message: `Imported ${rows.length} students (${added} new, ${updated} updated).` };
  },
});

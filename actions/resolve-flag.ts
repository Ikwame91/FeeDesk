import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { LedgerError } from "../server/lib/ledger.js";
import { ReceiptRuleError } from "../server/lib/receipt-rules.js";
import { ReconcileError, RESOLUTIONS, resolveFlag } from "../server/lib/reconcile.js";

const errors = defineActionErrors("not_signed_in", "not_found", "already_resolved", "bad_resolution", "conflict", "bad_receipt");

export default defineAction({
  description:
    'Apply the bursar\'s decision on one flag (from a Flags-screen button or chat). Resolutions: "accept_match" — the money is there (confirms the proposed match, e.g. "those three were banked together Monday"; or pass moneyRef to link a line); "fix_amount" — receipt was written wrong, correct it to the money amount; "void_duplicate" — cancel a second receipt for the same payment; "add_receipt" — money with no receipt: write receipt receiptNo for it (student from the payer\'s phone, or pass studentId); "real_problem" — leave the receipt flagged as a real problem. Get flag ids from list-flags.',
  schema: z.object({
    flagId: z.string().describe("Flag id from list-flags"),
    resolution: z.enum(RESOLUTIONS).describe('"accept_match", "fix_amount", "void_duplicate", "add_receipt" or "real_problem"'),
    moneyRef: z.string().optional().describe('accept_match only, when there is no proposed match: "momo:<Transaction ID>" or "bank:<Reference>"'),
    receiptNo: z.string().optional().describe("add_receipt only: the number of the receipt being written"),
    studentId: z.string().optional().describe("add_receipt only, when the payer's phone doesn't identify the student"),
    note: z.string().max(300).optional().describe("What the bursar said, kept with the decision"),
  }),
  outputSchema: z.object({ flagId: z.string(), resolution: z.string(), message: z.string() }),
  errors,
  run: async (args, ctx) => {
    const who = ctx?.userEmail ?? errors.noWrite("Sign in to resolve flags.", "not_signed_in", { statusCode: 401 });
    try {
      const { message } = await resolveFlag(
        {
          flagId: args.flagId,
          resolution: args.resolution,
          ...(args.moneyRef ? { moneyRef: args.moneyRef } : {}),
          ...(args.receiptNo ? { receiptNo: args.receiptNo } : {}),
          ...(args.studentId ? { studentId: args.studentId } : {}),
          ...(args.note ? { note: args.note } : {}),
        },
        who,
      );
      return { flagId: args.flagId, resolution: args.resolution, message };
    } catch (e) {
      if (e instanceof ReconcileError) {
        return errors.noWrite(e.message, e.code, { statusCode: e.code === "not_found" ? 404 : 409 });
      }
      if (e instanceof ReceiptRuleError || e instanceof LedgerError) return errors.noWrite(e.message, "bad_receipt");
      throw e;
    }
  },
});

import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { raiseFlags } from "../server/lib/reconcile.js";

export default defineAction({
  description:
    'Put mismatches in the bursar\'s review queue. kind "no_money": receipt with no money found (needs receiptNo). "no_receipt": money with no receipt (needs moneyRef). "duplicate": same payment receipted twice (needs receiptNo of the extra receipt, plus moneyRef). For amount differences use record-match, which flags them. Notes are neutral: describe the mismatch, never accuse anyone. An identical open flag is skipped.',
  schema: z.object({
    flags: z
      .array(
        z.object({
          kind: z.enum(["no_money", "no_receipt", "duplicate"]).describe('"no_money", "no_receipt" or "duplicate"'),
          receiptNo: z.string().optional().describe("The receipt the flag is about (no_money, duplicate)"),
          moneyRef: z.string().optional().describe('The money line, "momo:<Transaction ID>" or "bank:<Reference>" (no_receipt, duplicate)'),
          note: z.string().min(3).max(500).describe("One or two neutral sentences the bursar will read"),
        }),
      )
      .min(1)
      .max(60),
  }),
  outputSchema: z.object({ raised: z.number(), skipped: z.array(z.string()), message: z.string() }),
  run: async ({ flags }, ctx) => {
    const who = ctx?.userEmail ?? fail("Sign in to raise flags.", { errorCode: "not_signed_in", statusCode: 401 });
    const { raised, skipped } = await raiseFlags(flags, who);
    return { raised, skipped, message: `${raised} flagged for review${skipped.length ? `, ${skipped.length} skipped` : ""}.` };
  },
});

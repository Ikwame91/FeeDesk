import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { recordMatches } from "../server/lib/reconcile.js";

export default defineAction({
  description:
    "Save matches between receipts and the money that paid for them (several cash receipts can share one bank deposit). Auto-accepted (receipts verified) only when confidence >= 0.9 AND the receipts add up exactly to the money line; otherwise saved as proposed and flagged for the bursar. Each item stands alone: bad items are rejected with a reason, the rest still save.",
  schema: z.object({
    matches: z
      .array(
        z.object({
          receiptNos: z.array(z.string()).min(1).max(12).describe('Receipt numbers covered by this money line, e.g. ["1012","1015"]'),
          moneyRef: z.string().describe('The money line: "momo:<Transaction ID>" or "bank:<Reference>", e.g. momo:94336846938'),
          confidence: z.number().min(0).max(1).describe("0 to 1. Use the suggestion's value unless you have a reason to change it"),
          reason: z.string().min(3).max(200).describe("Under 20 words naming the evidence, e.g. 'Same amount, same day, parent's phone ending 4417'"),
        }),
      )
      .min(1)
      .max(60),
  }),
  outputSchema: z.object({
    verified: z.number(),
    flagged: z.number(),
    rejected: z.array(z.object({ receiptNos: z.array(z.string()), detail: z.string() })),
    message: z.string(),
  }),
  run: async ({ matches }, ctx) => {
    const who = ctx?.userEmail ?? fail("Sign in to record matches.", { errorCode: "not_signed_in", statusCode: 401 });
    const out = await recordMatches(matches, who);
    const verified = out.filter((o) => o.outcome === "verified").reduce((a, o) => a + o.receiptNos.length, 0);
    const flagged = out.filter((o) => o.outcome === "flagged").reduce((a, o) => a + o.receiptNos.length, 0);
    const rejected = out.filter((o) => o.outcome === "rejected").map(({ receiptNos, detail }) => ({ receiptNos, detail }));
    return {
      verified,
      flagged,
      rejected,
      message: `${verified} receipts verified, ${flagged} flagged for review${rejected.length ? `, ${rejected.length} not saved` : ""}.`,
    };
  },
});

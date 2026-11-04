import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { listFlags } from "../server/lib/reconcile.js";

const receipt = z
  .object({
    receiptNo: z.string(),
    date: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    className: z.string(),
    amountGhs: z.string(),
    method: z.string(),
  })
  .nullable();

export default defineAction({
  description:
    "The bursar's review queue: open flags (oldest first) with the receipt, the money line, any proposed match, and the student the payer's phone belongs to. Use the flag id with resolve-flag.",
  schema: z.object({
    includeResolved: z
      .enum(["true", "false"])
      .default("false")
      .describe('"true" to include resolved flags; defaults to "false"'),
  }),
  outputSchema: z.object({
    flags: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        note: z.string(),
        createdAt: z.string(),
        resolution: z.string().nullable(),
        resolvedBy: z.string().nullable(),
        receipt,
        moneyLine: z
          .object({
            moneyRef: z.string(),
            source: z.string(),
            date: z.string(),
            payerName: z.string().nullable(),
            payerPhone: z.string().nullable(),
            amountGhs: z.string(),
            reference: z.string().nullable(),
          })
          .nullable(),
        proposedMatch: z.object({ receipts: z.array(receipt) }).nullable(),
        likelyStudent: z.object({ id: z.string(), name: z.string(), className: z.string() }).nullable(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ includeResolved }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to see flags.", { errorCode: "not_signed_in", statusCode: 401 });
    return { flags: await listFlags(includeResolved === "true") };
  },
});

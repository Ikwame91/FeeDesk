import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getSummary } from "../server/lib/reconcile.js";

export default defineAction({
  description:
    'The headline numbers: receipts verified out of total, receipts flagged, open flags by kind, students still owing (term fee minus verified receipts), unchecked receipts, unmatched money lines. headline reads e.g. "118 of 120 receipts verified · 2 flagged · 12 students owing".',
  schema: z.object({}),
  outputSchema: z.object({
    receipts: z.number(),
    verified: z.number(),
    flagged: z.number(),
    unchecked: z.number(),
    voided: z.number(),
    openFlags: z.number(),
    openFlagsByKind: z.record(z.string(), z.number()),
    studentsOwing: z.number(),
    students: z.number(),
    moneyLinesUnmatched: z.number(),
    verifiedGhs: z.string().describe("Total of verified receipts, GHS with 2 decimals"),
    owedGhs: z.string().describe("Total still owed by students (term fee minus verified receipts), GHS"),
    headline: z.string(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to see the summary.", { errorCode: "not_signed_in", statusCode: 401 });
    return getSummary();
  },
});

import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getCapture } from "../server/lib/capture.js";

const student = z.object({ id: z.string(), name: z.string(), className: z.string() });

export default defineAction({
  description: "The rows read from a receipt-book photo (by batchId, or the latest unfinished capture), each checked: ready, problems, warnings, and the fee-list student it matches.",
  schema: z.object({ batchId: z.string().optional().describe("Capture id; omit for the latest unfinished one") }),
  outputSchema: z.object({
    capture: z
      .object({
        batchId: z.string(),
        status: z.string(),
        rows: z.array(
          z.object({
            rowId: z.string(),
            receiptNo: z.string(),
            date: z.string(),
            studentName: z.string(),
            className: z.string(),
            amountGhs: z.string(),
            method: z.string(),
            unclear: z.array(z.string()),
            added: z.boolean(),
            check: z.object({
              ready: z.boolean(),
              problems: z.array(z.string()),
              warnings: z.array(z.string()),
              studentId: z.string().nullable(),
              studentMatch: z.string(),
              suggestions: z.array(student),
            }),
          }),
        ),
      })
      .nullable(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ batchId }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to see captures.", { errorCode: "not_signed_in", statusCode: 401 });
    return { capture: await getCapture(batchId) };
  },
});

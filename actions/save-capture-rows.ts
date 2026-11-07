import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { CAPTURE_FIELDS, CaptureError, getCapture, saveCaptureRows } from "../server/lib/capture.js";

const errors = defineActionErrors("not_signed_in", "capture_closed");

export default defineAction({
  description:
    'Put the rows you read from a photo of a receipt-book page onto the capture screen, for the bursar to check and confirm. Nothing becomes a receipt until they press Add. One entry per receipt row, values exactly as written; dates as written or YYYY-MM-DD (books write 28/10/26 = 28 Oct 2026); method "cash" or "momo". When you can\'t read a field, leave it empty and list it in unclear — never guess. Pass batchId from the request; omit it to start a new capture. Replaces any rows already saved for that capture.',
  schema: z.object({
    batchId: z.string().optional().describe("The capture id given with the photo; omit to start a new capture"),
    rows: z
      .array(
        z.object({
          receiptNo: z.string().optional().describe("Receipt number as written"),
          date: z.string().optional().describe("Date as written (28/10/26) or YYYY-MM-DD"),
          studentName: z.string().optional().describe("Student's name as written"),
          className: z.string().optional().describe('Class as written, e.g. "JHS 3"'),
          amountGhs: z.string().optional().describe("Amount as written, e.g. 460.00"),
          method: z.string().optional().describe('"cash" or "momo"'),
          unclear: z
            .array(z.string())
            .optional()
            .describe(`Fields you could not read with confidence (leave those values empty): any of ${CAPTURE_FIELDS.join(", ")}`),
        }),
      )
      .min(1)
      .max(60),
  }),
  outputSchema: z.object({
    batchId: z.string(),
    rows: z.number(),
    ready: z.number().describe("Rows that can be added as they are"),
    needAttention: z.number().describe("Rows with an unclear field, an unknown student, a used receipt number, etc."),
    message: z.string(),
  }),
  errors,
  run: async ({ batchId, rows }, ctx) => {
    const who = ctx?.userEmail ?? errors.noWrite("Sign in to capture receipts.", "not_signed_in", { statusCode: 401 });
    try {
      const id = await saveCaptureRows(batchId, rows, who);
      const c = await getCapture(id);
      const ready = c?.rows.filter((r) => r.check.ready).length ?? 0;
      const n = c?.rows.length ?? 0;
      return {
        batchId: id,
        rows: n,
        ready,
        needAttention: n - ready,
        message: `${n} rows are on the capture screen: ${ready} ready, ${n - ready} to check. Ask the bursar to compare them with the photo and press Add.`,
      };
    } catch (e) {
      if (e instanceof CaptureError) return errors.noWrite(e.message, "capture_closed");
      throw e;
    }
  },
});

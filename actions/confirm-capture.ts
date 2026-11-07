import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { CaptureError, confirmCapture } from "../server/lib/capture.js";

const errors = defineActionErrors("not_signed_in", "not_found");

export default defineAction({
  description:
    'Add the checked rows of a photo capture as receipts (source "photo"), with the bursar\'s edits. Each row goes through the normal receipt rules; rows that fail stay on the capture screen with the reason. Only call this when the bursar has confirmed the rows.',
  schema: z.object({
    batchId: z.string().describe("Capture id"),
    rows: z
      .array(
        z.object({
          rowId: z.string(),
          receiptNo: z.string(),
          date: z.string().describe("YYYY-MM-DD"),
          studentId: z.string().describe("Student ID from the fee list"),
          className: z.string().optional(),
          amountGhs: z.string(),
          method: z.enum(["cash", "momo"]),
        }),
      )
      .min(1)
      .max(60),
  }),
  outputSchema: z.object({
    added: z.array(z.string()).describe("Receipt numbers added"),
    failed: z.array(z.object({ rowId: z.string(), message: z.string() })),
    message: z.string(),
  }),
  errors,
  run: async ({ batchId, rows }, ctx) => {
    const who = ctx?.userEmail ?? errors.noWrite("Sign in to add receipts.", "not_signed_in", { statusCode: 401 });
    try {
      const { added, failed } = await confirmCapture(batchId, rows, who);
      return {
        added,
        failed,
        message:
          `${added.length} receipt${added.length === 1 ? "" : "s"} added` +
          (failed.length ? `; ${failed.length} still need fixing.` : "."),
      };
    } catch (e) {
      if (e instanceof CaptureError) return errors.noWrite(e.message, "not_found", { statusCode: 404 });
      throw e;
    }
  },
});

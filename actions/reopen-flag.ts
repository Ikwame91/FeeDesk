import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { ReconcileError, reopenFlag } from "../server/lib/reconcile.js";

const errors = defineActionErrors("not_signed_in", "not_found", "bad_resolution");

export default defineAction({
  description:
    'Put one flag back in the review queue. Only a decision that starts with "real_problem" can be reopened: this clears resolution, resolvedBy and resolvedAt. Other decisions (accept_match, fix_amount, void_duplicate, add_receipt) are refused because they already changed the receipt or the match.',
  schema: z.object({
    flagId: z.string().describe("Flag id from list-flags"),
  }),
  outputSchema: z.object({ flagId: z.string(), message: z.string() }),
  errors,
  run: async ({ flagId }, ctx) => {
    if (!ctx?.userEmail) return errors.noWrite("Sign in to reopen a flag.", "not_signed_in", { statusCode: 401 });
    try {
      const { message } = await reopenFlag(flagId);
      return { flagId, message };
    } catch (e) {
      if (e instanceof ReconcileError) {
        return errors.noWrite(e.message, e.code === "not_found" ? "not_found" : "bad_resolution", {
          statusCode: e.code === "not_found" ? 404 : 409,
        });
      }
      throw e;
    }
  },
});

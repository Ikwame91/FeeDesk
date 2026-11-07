import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getSummary, runFullCheck } from "../server/lib/reconcile.js";

export default defineAction({
  description:
    "Check every unchecked receipt in one go, without AI: records every suggested match from find-candidates (auto-accepted only at >= 0.9 with exact amounts) and raises every suggested flag, page after page, then returns the new headline. Use this for Check everything; use find-candidates only to explain specific receipts.",
  schema: z.object({}),
  outputSchema: z.object({
    pages: z.number(),
    verified: z.number().describe("Receipts verified in this run"),
    flaggedByMatch: z.number().describe("Receipts with a possible match that needs the bursar (amount differs, banked later)"),
    flagsRaised: z.number().describe("no_money / no_receipt / duplicate flags raised"),
    notSaved: z.array(z.string()).describe("Anything skipped, with the reason"),
    headline: z.string(),
    openFlagsByKind: z.record(z.string(), z.number()),
    message: z.string(),
  }),
  run: async (_args, ctx) => {
    const who = ctx?.userEmail ?? fail("Sign in to run the check.", { errorCode: "not_signed_in", statusCode: 401 });
    const r = await runFullCheck(who);
    const s = await getSummary();
    return {
      ...r,
      headline: s.headline,
      openFlagsByKind: s.openFlagsByKind,
      message:
        r.pages === 0
          ? `Nothing new to check. ${s.headline}.`
          : `Checked: ${r.verified} verified, ${s.openFlags} flag${s.openFlags === 1 ? "" : "s"} to review. ${s.headline}.`,
    };
  },
});

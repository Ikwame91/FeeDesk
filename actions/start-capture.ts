import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { createBatch } from "../server/lib/capture.js";

export default defineAction({
  description: "Start reading a photo of a receipt-book page on the capture screen. Returns the capture id the rows will be saved under.",
  schema: z.object({}),
  outputSchema: z.object({ batchId: z.string() }),
  agentTool: false,
  run: async (_args, ctx) => {
    const who = ctx?.userEmail ?? fail("Sign in to capture receipts.", { errorCode: "not_signed_in", statusCode: 401 });
    return { batchId: await createBatch(who) };
  },
});

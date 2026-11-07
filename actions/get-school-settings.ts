import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getSchool } from "../server/lib/school.js";

export default defineAction({
  description: "The school this FeeDesk belongs to: its name, the current term label, and the school's MoMo number (0XXXXXXXXX, \"\" if not set).",
  schema: z.object({}),
  outputSchema: z.object({ schoolName: z.string(), termLabel: z.string(), momoNumber: z.string() }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to see the school settings.", { errorCode: "not_signed_in", statusCode: 401 });
    return getSchool();
  },
});

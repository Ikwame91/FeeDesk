import { defineAction, fail } from "@agent-native/core/action";
import { asc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { pesewasToGhs } from "../server/lib/money.js";

export default defineAction({
  description: "List students on the fee list (ID, name, class, term fee in GHS, parent name and phone), ordered by ID.",
  schema: z.object({}),
  outputSchema: z.object({
    students: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        className: z.string(),
        termFeeGhs: z.string(),
        parentName: z.string(),
        parentPhone: z.string(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to see the fee list.", { errorCode: "not_signed_in", statusCode: 401 });
    const s = schema.students;
    const rows = await getDb()
      .select({
        id: s.id,
        name: s.name,
        className: s.className,
        termFeePesewas: s.termFeePesewas,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
      })
      .from(s)
      .orderBy(asc(s.id))
      .limit(2000);
    return {
      students: rows.map(({ termFeePesewas, ...r }) => ({ ...r, termFeeGhs: pesewasToGhs(termFeePesewas) })),
    };
  },
});

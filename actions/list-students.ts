import { defineAction, fail } from "@agent-native/core/action";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { pesewasToGhs } from "../server/lib/money.js";

export default defineAction({
  description:
    "List students on the fee list (ID, name, class, term fee, paid, and balance in GHS, parent name and phone), ordered by ID. Paid is the sum of that student's verified receipts; balance is the term fee minus that. This does not match receipts to statements.",
  schema: z.object({}),
  outputSchema: z.object({
    students: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        className: z.string(),
        termFeeGhs: z.string(),
        paidGhs: z.string(),
        balanceGhs: z.string(),
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
    const r = schema.receipts;
    const paidPesewas = sql<number>`coalesce(sum(${r.amountPesewas}), 0)::int`;
    const rows = await getDb()
      .select({
        id: s.id,
        name: s.name,
        className: s.className,
        termFeePesewas: s.termFeePesewas,
        paidPesewas,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
      })
      .from(s)
      .leftJoin(r, and(eq(r.studentId, s.id), eq(r.status, "verified")))
      .groupBy(s.id, s.name, s.className, s.termFeePesewas, s.parentName, s.parentPhone)
      .orderBy(asc(s.id))
      .limit(2000);
    return {
      students: rows.map((row) => {
        const paid = Number(row.paidPesewas);
        return {
          id: row.id,
          name: row.name,
          className: row.className,
          termFeeGhs: pesewasToGhs(row.termFeePesewas),
          paidGhs: pesewasToGhs(paid),
          balanceGhs: pesewasToGhs(row.termFeePesewas - paid),
          parentName: row.parentName,
          parentPhone: row.parentPhone,
        };
      }),
    };
  },
});

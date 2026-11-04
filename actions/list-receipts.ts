import { defineAction } from "@agent-native/core/action";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { pesewasToGhs } from "../server/lib/money.js";

export default defineAction({
  description:
    "List recorded receipts, newest receipt number first, with student name and amount in GHS. Also returns totals: how many receipts, students, MoMo lines and bank lines are recorded.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(500).default(50).describe("How many receipts to return; defaults to 50"),
  }),
  outputSchema: z.object({
    receipts: z.array(
      z.object({
        id: z.string(),
        receiptNo: z.string(),
        date: z.string(),
        studentId: z.string(),
        studentName: z.string(),
        className: z.string(),
        amountGhs: z.string(),
        method: z.string(),
        source: z.string(),
        status: z.string(),
      }),
    ),
    totals: z.object({ receipts: z.number(), students: z.number(), momoLines: z.number(), bankLines: z.number() }),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ limit }) => {
    const { receipts: r, students: s, moneyLines: m } = schema;
    const db = getDb();
    const rows = await db
      .select({
        id: r.id,
        receiptNo: r.receiptNo,
        date: r.date,
        studentId: r.studentId,
        studentName: s.name,
        className: s.className,
        amountPesewas: r.amountPesewas,
        method: r.method,
        source: r.source,
        status: r.status,
      })
      .from(r)
      .innerJoin(s, eq(s.id, r.studentId))
      .orderBy(desc(r.createdAt), desc(sql`length(${r.receiptNo})`), desc(r.receiptNo))
      .limit(limit);
    const n = sql<number>`count(*)`;
    const [[rc], [sc], lines] = await Promise.all([
      db.select({ n }).from(r),
      db.select({ n }).from(s),
      db.select({ source: m.source, n }).from(m).groupBy(m.source),
    ]);
    return {
      receipts: rows.map(({ amountPesewas, ...row }) => ({ ...row, amountGhs: pesewasToGhs(amountPesewas) })),
      totals: {
        receipts: Number(rc?.n ?? 0),
        students: Number(sc?.n ?? 0),
        momoLines: Number(lines.find((l) => l.source === "momo")?.n ?? 0),
        bankLines: Number(lines.find((l) => l.source === "bank")?.n ?? 0),
      },
    };
  },
});

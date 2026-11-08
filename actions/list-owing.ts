import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { pesewasToGhs } from "../server/lib/money.js";

const flaggedReceipt = z.object({
  receiptNo: z.string(),
  amountGhs: z.string(),
  mark: z.string().describe('e.g. "GHS 250.00 on receipt 1019, kept as a problem"'),
});

const owingStudent = z.object({
  id: z.string(),
  name: z.string(),
  className: z.string(),
  termFeeGhs: z.string(),
  paidGhs: z.string(),
  balanceGhs: z.string(),
  flaggedGhs: z.string().describe("Sum of this student's flagged receipts, GHS"),
  flaggedReceipts: z.array(flaggedReceipt),
});

/** Same words as the Owing page. Amounts use the GHS string from pesewas, so 25000 is GHS 250.00. */
export function keptProblemMark(amountGhs: string, receiptNo: string): string {
  const shown = Number(amountGhs).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `GHS ${shown} on receipt ${receiptNo}, kept as a problem`;
}

export default defineAction({
  description:
    "Who still owes: each student whose verified receipts do not cover the term fee (same balance as get-summary), with class, fee, paid, balance, and the GHS sitting on flagged receipts. Sorted by balance, largest first, with a subtotal per class and a grand total equal to get-summary owedGhs. Does not match receipts to statements.",
  schema: z.object({}),
  outputSchema: z.object({
    students: z.array(owingStudent).describe("Owing students, largest balance first"),
    classes: z.array(
      z.object({
        className: z.string(),
        subtotalGhs: z.string(),
        students: z.array(owingStudent),
      }),
    ),
    totalGhs: z.string(),
    studentsOwing: z.number(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to see who owes.", { errorCode: "not_signed_in", statusCode: 401 });
    const { students, receipts } = schema;
    const db = getDb();
    // Same balance as getSummary: term fee minus verified receipts only.
    const [owing, flagged] = await Promise.all([
      db
        .select({
          id: students.id,
          name: students.name,
          className: students.className,
          termFeePesewas: students.termFeePesewas,
          paidPesewas: sql<number>`coalesce(sum(${receipts.amountPesewas}), 0)::int`,
        })
        .from(students)
        .leftJoin(receipts, and(eq(receipts.studentId, students.id), eq(receipts.status, "verified")))
        .groupBy(students.id, students.name, students.className, students.termFeePesewas)
        .having(sql`${students.termFeePesewas} > coalesce(sum(${receipts.amountPesewas}), 0)`),
      db
        .select({
          studentId: receipts.studentId,
          receiptNo: receipts.receiptNo,
          amountPesewas: receipts.amountPesewas,
        })
        .from(receipts)
        .where(eq(receipts.status, "flagged")),
    ]);

    const flaggedByStudent = new Map<string, { receiptNo: string; amountPesewas: number }[]>();
    for (const row of flagged) {
      const list = flaggedByStudent.get(row.studentId) ?? [];
      list.push({ receiptNo: row.receiptNo, amountPesewas: row.amountPesewas });
      flaggedByStudent.set(row.studentId, list);
    }

    const rows = owing
      .map((row) => {
        const paid = Number(row.paidPesewas);
        const balance = row.termFeePesewas - paid;
        const problems = (flaggedByStudent.get(row.id) ?? []).sort((a, b) => a.receiptNo.localeCompare(b.receiptNo));
        const flaggedPesewas = problems.reduce((sum, item) => sum + item.amountPesewas, 0);
        return {
          id: row.id,
          name: row.name,
          className: row.className,
          termFeeGhs: pesewasToGhs(row.termFeePesewas),
          paidGhs: pesewasToGhs(paid),
          balanceGhs: pesewasToGhs(balance),
          balancePesewas: balance,
          flaggedGhs: pesewasToGhs(flaggedPesewas),
          flaggedReceipts: problems.map((item) => ({
            receiptNo: item.receiptNo,
            amountGhs: pesewasToGhs(item.amountPesewas),
            mark: keptProblemMark(pesewasToGhs(item.amountPesewas), item.receiptNo),
          })),
        };
      })
      .sort((a, b) => b.balancePesewas - a.balancePesewas || a.name.localeCompare(b.name));

    const byClass = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byClass.get(row.className) ?? [];
      list.push(row);
      byClass.set(row.className, list);
    }
    const classes = [...byClass.entries()]
      .map(([className, studentsInClass]) => {
        const ordered = [...studentsInClass].sort((a, b) => b.balancePesewas - a.balancePesewas || a.name.localeCompare(b.name));
        const subtotal = ordered.reduce((sum, student) => sum + student.balancePesewas, 0);
        return {
          className,
          subtotalPesewas: subtotal,
          subtotalGhs: pesewasToGhs(subtotal),
          students: ordered.map(({ balancePesewas: _balance, ...student }) => student),
        };
      })
      .sort((a, b) => b.subtotalPesewas - a.subtotalPesewas || a.className.localeCompare(b.className));

    const total = rows.reduce((sum, student) => sum + student.balancePesewas, 0);
    return {
      students: rows.map(({ balancePesewas: _balance, ...student }) => student),
      classes: classes.map(({ subtotalPesewas: _subtotal, ...group }) => group),
      totalGhs: pesewasToGhs(total),
      studentsOwing: rows.length,
    };
  },
});

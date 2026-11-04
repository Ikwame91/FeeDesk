import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { isIsoDate } from "../server/lib/importers.js";
import { addReceipts, findStudent, LedgerError } from "../server/lib/ledger.js";
import { ghsToPesewas, pesewasToGhs } from "../server/lib/money.js";

const errors = defineActionErrors(
  "not_signed_in",
  "student_not_found",
  "duplicate_receipt_no",
  "bad_amount",
  "bad_date",
);

export default defineAction({
  description:
    "Record one fee receipt the bursar wrote (from the form, chat, or a confirmed photo row). Identify the student by studentId or exact full name. Amount is GHS, e.g. 450.50, stored as exact pesewas. Fails if the receipt number is already recorded or the student is unknown (the error lists close name matches).",
  schema: z
    .object({
      receiptNo: z.string().trim().min(1).describe('Receipt number as written, e.g. "1050"'),
      date: z.string().describe("Date on the receipt as YYYY-MM-DD, e.g. 2026-11-02 (receipt books write 02/11/26 = day/month/year)"),
      studentId: z.string().trim().optional().describe('Student ID from the fee list, e.g. "S014". Give this or studentName'),
      studentName: z.string().trim().optional().describe("Student's full name exactly as on the fee list. Give this or studentId"),
      amountGhs: z.union([z.string(), z.number()]).describe("Amount in GHS with at most 2 decimals, e.g. 450.50"),
      method: z.enum(["cash", "momo"]).describe('"cash" or "momo"'),
      source: z
        .enum(["typed", "photo", "upload"])
        .default("typed")
        .describe('Where the receipt came from: "typed" (form or chat, the default), "photo" (a confirmed row read from a photo), "upload"'),
    })
    .refine((v) => v.studentId || v.studentName, { message: "Give studentId or studentName" }),
  outputSchema: z.object({
    id: z.string(),
    receiptNo: z.string(),
    studentId: z.string(),
    studentName: z.string(),
    amountGhs: z.string(),
    message: z.string(),
  }),
  errors,
  run: async (args, ctx) => {
    const ownerEmail = ctx?.userEmail ?? errors.noWrite("Sign in to add receipts.", "not_signed_in", { statusCode: 401 });
    if (!isIsoDate(args.date)) return errors.noWrite(`Date "${args.date}" must be YYYY-MM-DD, e.g. 2026-11-02.`, "bad_date");
    let amountPesewas: number;
    try {
      amountPesewas = ghsToPesewas(args.amountGhs);
    } catch (e) {
      return errors.noWrite((e as Error).message, "bad_amount");
    }
    if (amountPesewas <= 0) return errors.noWrite("Amount must be more than GHS 0.00.", "bad_amount");

    const { student, candidates } = await findStudent({
      ...(args.studentId ? { studentId: args.studentId } : {}),
      ...(args.studentName ? { studentName: args.studentName } : {}),
    });
    if (!student) {
      const who = args.studentId ?? args.studentName;
      return errors.noWrite(
        candidates.length
          ? `No student called "${who}". Did you mean: ${candidates.map((c) => `${c.name} (${c.className}, ${c.id})`).join("; ")}?`
          : `No student "${who}" on the fee list.`,
        "student_not_found",
        { statusCode: 404, details: { candidates } },
      );
    }

    try {
      const saved = (await addReceipts(
        [{ receiptNo: args.receiptNo, date: args.date, studentId: student.id, amountPesewas, method: args.method }],
        args.source,
        ownerEmail,
      ))[0]!;
      const amountGhs = pesewasToGhs(amountPesewas);
      return {
        id: saved.id,
        receiptNo: saved.receiptNo,
        studentId: student.id,
        studentName: student.name,
        amountGhs,
        message: `Receipt ${saved.receiptNo} added: ${student.name}, GHS ${amountGhs} ${args.method === "momo" ? "MoMo" : "cash"}.`,
      };
    } catch (e) {
      if (e instanceof LedgerError && e.code === "duplicate_receipt_no") {
        return errors.noWrite(e.message, "duplicate_receipt_no", { statusCode: 409, details: e.details });
      }
      throw e;
    }
  },
});

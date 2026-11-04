import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { addReceipts, findStudent, LedgerError } from "../server/lib/ledger.js";
import { ghsToPesewas, pesewasToGhs } from "../server/lib/money.js";
import {
  checkReceiptAmount,
  checkReceiptDate,
  normaliseReceiptNo,
  ReceiptRuleError,
  sameClass,
} from "../server/lib/receipt-rules.js";

const errors = defineActionErrors(
  "not_signed_in",
  "student_not_found",
  "duplicate_receipt_no",
  "bad_amount",
  "bad_date",
  "bad_receipt_no",
);

export default defineAction({
  description:
    "Record one fee receipt the bursar wrote (from the form, chat, or a confirmed photo row). Identify the student by studentId or exact full name; pass className too when the receipt shows it (a mismatch with the fee list is saved but returned as a warning). Amount is GHS, e.g. 450.50, up to 100,000. Date must be within the last year and not in the future. Receipt numbers ignore leading zeros (01120 = 1120) and must be unused.",
  schema: z
    .object({
      receiptNo: z.string().trim().min(1).describe('Receipt number as written, e.g. "1050"; leading zeros are ignored'),
      date: z
        .string()
        .describe("Date on the receipt as YYYY-MM-DD, e.g. 2026-11-02 (receipt books write 02/11/26 = day/month/year). Not in the future, not over a year old"),
      studentId: z.string().trim().optional().describe('Student ID from the fee list, e.g. "S014". Give this or studentName'),
      studentName: z.string().trim().optional().describe("Student's full name exactly as on the fee list. Give this or studentId"),
      className: z
        .string()
        .trim()
        .optional()
        .describe('Class written on the receipt, e.g. "JHS 1" or "Basic 4". Optional; checked against the fee list'),
      amountGhs: z.union([z.string(), z.number()]).describe("Amount in GHS with at most 2 decimals, e.g. 450.50; at most 100,000"),
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
    className: z.string(),
    amountGhs: z.string(),
    warnings: z.array(z.string()).describe("Saved anyway, but the bursar should look at these"),
    message: z.string(),
  }),
  errors,
  run: async (args, ctx) => {
    const ownerEmail = ctx?.userEmail ?? errors.noWrite("Sign in to add receipts.", "not_signed_in", { statusCode: 401 });

    // Validate everything before touching the database.
    let receiptNo: string;
    let amountPesewas: number;
    let date: string;
    try {
      receiptNo = normaliseReceiptNo(args.receiptNo);
      date = checkReceiptDate(args.date);
      try {
        amountPesewas = ghsToPesewas(args.amountGhs);
      } catch (e) {
        throw new ReceiptRuleError((e as Error).message, "bad_amount");
      }
      checkReceiptAmount(amountPesewas);
    } catch (e) {
      if (e instanceof ReceiptRuleError) return errors.noWrite(e.message, e.code);
      throw e;
    }

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

    const warnings: string[] = [];
    if (args.className && !sameClass(args.className, student.className)) {
      warnings.push(
        `Receipt says ${args.className}, but ${student.name} is in ${student.className} on the fee list. Check the class or the student.`,
      );
    }

    try {
      const saved = (
        await addReceipts([{ receiptNo, date, studentId: student.id, amountPesewas, method: args.method }], args.source, ownerEmail)
      )[0]!;
      const amountGhs = pesewasToGhs(amountPesewas);
      return {
        id: saved.id,
        receiptNo: saved.receiptNo,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        amountGhs,
        warnings,
        message:
          `Receipt ${saved.receiptNo} added: ${student.name}, GHS ${amountGhs} ${args.method === "momo" ? "MoMo" : "cash"}.` +
          (warnings.length ? ` Warning: ${warnings.join(" ")}` : ""),
      };
    } catch (e) {
      if (e instanceof LedgerError && e.code === "duplicate_receipt_no") {
        return errors.noWrite(e.message, "duplicate_receipt_no", { statusCode: 409, details: e.details });
      }
      if (e instanceof ReceiptRuleError) return errors.noWrite(e.message, e.code);
      throw e;
    }
  },
});

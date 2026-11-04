/**
 * Writes shared by the import actions, add-receipt, and the demo loader, so a row
 * gets into the database the same way whether it came from a click, the agent, or a file.
 */
import { eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { MoneyLineRow, ReceiptRow, StudentRow } from "./importers.js";
import { checkReceiptAmount, checkReceiptDate, normaliseReceiptNo } from "./receipt-rules.js";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const { students, receipts, moneyLines } = schema;

export async function upsertStudents(rows: StudentRow[], ownerEmail: string) {
  const db = getDb();
  const ids = rows.map((r) => r.id);
  return db.transaction(async (tx) => {
    const existing = ids.length
      ? await tx.select({ id: students.id }).from(students).where(inArray(students.id, ids))
      : [];
    for (const r of rows) {
      await tx
        .insert(students)
        .values({ ...r, ownerEmail })
        .onConflictDoUpdate({
          target: students.id,
          set: {
            name: r.name,
            className: r.className,
            termFeePesewas: r.termFeePesewas,
            parentName: r.parentName,
            parentPhone: r.parentPhone,
          },
        });
    }
    return { added: rows.length - existing.length, updated: existing.length };
  });
}

/** Statement lines already imported (same source + transaction ID) are skipped, not duplicated. */
export async function insertMoneyLines(rows: MoneyLineRow[], ownerEmail: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    let added = 0;
    for (const r of rows) {
      const inserted = await tx
        .insert(moneyLines)
        .values({ id: crypto.randomUUID(), ...r, ownerEmail })
        .onConflictDoNothing({ target: [moneyLines.source, moneyLines.txnId] })
        .returning({ id: moneyLines.id });
      added += inserted.length;
    }
    return { added, skipped: rows.length - added };
  });
}

export class LedgerError extends Error {
  constructor(
    message: string,
    public readonly code: "student_not_found" | "duplicate_receipt_no",
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Checks run before any write: every student exists, no receipt number is reused. */
async function checkReceipts(tx: Tx | Db, rows: ReceiptRow[]) {
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const found = studentIds.length
    ? await tx.select({ id: students.id }).from(students).where(inArray(students.id, studentIds))
    : [];
  const missing = studentIds.filter((id) => !found.some((f) => f.id === id));
  if (missing.length) {
    throw new LedgerError(`No student with ID ${missing.slice(0, 5).join(", ")}.`, "student_not_found", {
      studentIds: missing,
    });
  }
  const numbers = rows.map((r) => r.receiptNo);
  const repeatedInInput = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  const taken = numbers.length
    ? await tx
        .select({ receiptNo: receipts.receiptNo })
        .from(receipts)
        .where(inArray(receipts.receiptNo, numbers))
    : [];
  const clashes = [...new Set([...repeatedInInput, ...taken.map((t) => t.receiptNo)])];
  if (clashes.length) {
    throw new LedgerError(
      `Receipt number ${clashes.slice(0, 5).join(", ")} is already recorded.`,
      "duplicate_receipt_no",
      { receiptNos: clashes },
    );
  }
}

/**
 * The single way receipts enter the database. Applies the receipt rules (amount cap,
 * date window, receipt-number normalising) before anything is written; throws
 * ReceiptRuleError or LedgerError and writes nothing when any row fails.
 */
export async function addReceipts(
  input: ReceiptRow[],
  source: "photo" | "upload" | "typed",
  ownerEmail: string,
  options: { today?: string } = {},
) {
  const rows = input.map((r) => ({
    ...r,
    receiptNo: normaliseReceiptNo(r.receiptNo),
    amountPesewas: checkReceiptAmount(r.amountPesewas),
    date: checkReceiptDate(r.date, options.today),
  }));
  const db = getDb();
  return db.transaction(async (tx) => {
    await checkReceipts(tx, rows);
    const saved = rows.map((r) => ({ id: crypto.randomUUID(), ...r, source, ownerEmail }));
    if (saved.length) await tx.insert(receipts).values(saved);
    return saved.map((r) => ({ id: r.id, receiptNo: r.receiptNo }));
  });
}

/** Look a student up by ID, or by exact name (case-insensitive). */
export async function findStudent(by: { studentId?: string; studentName?: string }) {
  const db = getDb();
  if (by.studentId) {
    const [s] = await db.select().from(students).where(eq(students.id, by.studentId)).limit(1);
    return s ? { student: s, candidates: [] } : { student: null, candidates: [] };
  }
  const name = (by.studentName ?? "").trim().replace(/\s+/g, " ");
  const exact = await db
    .select()
    .from(students)
    .where(sql`lower(${students.name}) = lower(${name})`)
    .limit(2);
  if (exact.length === 1) return { student: exact[0], candidates: [] };
  // Not found (or ambiguous): offer students sharing a first or last name.
  const parts = name.toLowerCase().split(" ").filter(Boolean);
  const all = await db
    .select({ id: students.id, name: students.name, className: students.className })
    .from(students)
    .limit(2000);
  const candidates = all
    .filter((s) => s.name.toLowerCase().split(" ").some((p) => parts.includes(p)))
    .slice(0, 8);
  return { student: null, candidates };
}

export async function countLedger() {
  const db = getDb();
  const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const n = sql<number>`count(*)`;
  return {
    students: await count(db.select({ n }).from(students)),
    receipts: await count(db.select({ n }).from(receipts)),
    momoLines: await count(db.select({ n }).from(moneyLines).where(eq(moneyLines.source, "momo"))),
    bankLines: await count(db.select({ n }).from(moneyLines).where(eq(moneyLines.source, "bank"))),
  };
}


/**
 * Photo capture: rows read from a photo of a receipt-book page are kept as drafts, checked, edited
 * by the bursar, and only become receipts when confirmed. The agent writes the rows (it can see the
 * photo); this file never reads images.
 */
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { addReceipts, LedgerError } from "./ledger.js";
import { ghsToPesewas } from "./money.js";
import { checkReceiptAmount, checkReceiptDate, normaliseReceiptNo, ReceiptRuleError, sameClass } from "./receipt-rules.js";

const { captureBatches, captureRows, receipts, students } = schema;

export const CAPTURE_FIELDS = ["receiptNo", "date", "studentName", "className", "amountGhs", "method"] as const;
export type CaptureField = (typeof CAPTURE_FIELDS)[number];

export interface CaptureRowInput {
  receiptNo?: string | undefined;
  date?: string | undefined;
  studentName?: string | undefined;
  className?: string | undefined;
  amountGhs?: string | undefined;
  method?: string | undefined;
  unclear?: CaptureField[] | undefined;
}

export class CaptureError extends Error {}

/** "28/10/26", "28-10-2026", "2026-10-28" → "2026-10-28". Receipt books write day/month/year. */
export function writtenDateToIso(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return t;
  const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

function normaliseMethod(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (/^mo\s?mo|^mom|^mobile/.test(t)) return "momo";
  if (/^cash|^csh/.test(t)) return "cash";
  return t;
}

export async function createBatch(ownerEmail: string): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().insert(captureBatches).values({ id, status: "reading", ownerEmail });
  return id;
}

/** Replaces the rows of a batch (creating the batch when none is given). */
export async function saveCaptureRows(batchId: string | undefined, rows: CaptureRowInput[], ownerEmail: string) {
  const db = getDb();
  const id = batchId ?? (await createBatch(ownerEmail));
  const [batch] = await db.select().from(captureBatches).where(eq(captureBatches.id, id)).limit(1);
  if (!batch) throw new CaptureError(`No capture ${id}.`);
  if (batch.status === "done") throw new CaptureError("That capture is already finished; start a new one.");
  await db.transaction(async (tx) => {
    await tx.delete(captureRows).where(eq(captureRows.batchId, id));
    if (rows.length) {
      await tx.insert(captureRows).values(
        rows.map((r, i) => ({
          id: crypto.randomUUID(),
          batchId: id,
          position: i,
          receiptNo: (r.receiptNo ?? "").trim(),
          date: writtenDateToIso(r.date ?? ""),
          studentName: (r.studentName ?? "").trim().replace(/\s+/g, " "),
          className: (r.className ?? "").trim(),
          amountGhs: (r.amountGhs ?? "").trim(),
          method: normaliseMethod(r.method ?? ""),
          unclear: JSON.stringify((r.unclear ?? []).filter((f) => (CAPTURE_FIELDS as readonly string[]).includes(f))),
          ownerEmail,
        })),
      );
    }
    await tx.update(captureBatches).set({ status: "ready" }).where(eq(captureBatches.id, id));
  });
  return id;
}

// ---------- checking a row ----------
interface StudentLite {
  id: string;
  name: string;
  className: string;
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1);

/** Exact name → match; one clearly closest name → suggested; otherwise up to 3 suggestions. */
export function matchStudent(name: string, all: StudentLite[]) {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return { student: null, how: "none" as const, suggestions: [] as StudentLite[] };
  const exact = all.filter((s) => s.name.toLowerCase() === n);
  if (exact.length === 1) return { student: exact[0]!, how: "exact" as const, suggestions: [] };
  const want = tokens(n);
  const scored = all
    .map((s) => ({ s, score: tokens(s.name).filter((t) => want.includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && best.score >= 2 && (scored[1]?.score ?? 0) < best.score) {
    return { student: best.s, how: "close" as const, suggestions: scored.slice(1, 3).map((x) => x.s) };
  }
  return { student: null, how: "none" as const, suggestions: scored.slice(0, 3).map((x) => x.s) };
}

export interface RowCheck {
  ready: boolean;
  problems: string[];
  warnings: string[];
  studentId: string | null;
  studentMatch: "exact" | "close" | "none";
  suggestions: StudentLite[];
}

export function checkRow(
  row: { receiptNo: string; date: string; studentName: string; className: string; amountGhs: string; method: string; unclear: CaptureField[] },
  all: StudentLite[],
  takenReceiptNos: Set<string>,
  today?: string,
): RowCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (row.unclear.length) problems.push(`Check ${row.unclear.map(fieldLabel).join(", ")} against the photo.`);
  let no = "";
  try {
    no = normaliseReceiptNo(row.receiptNo);
    if (takenReceiptNos.has(no)) problems.push(`Receipt ${no} is already recorded.`);
  } catch {
    if (!row.unclear.includes("receiptNo")) problems.push("Receipt number is missing.");
  }
  if (row.date) {
    try {
      checkReceiptDate(row.date, today);
    } catch (e) {
      problems.push((e as Error).message);
    }
  } else if (!row.unclear.includes("date")) problems.push("Date is missing.");
  if (row.amountGhs) {
    try {
      checkReceiptAmount(ghsToPesewas(row.amountGhs));
    } catch (e) {
      problems.push((e as Error).message);
    }
  } else if (!row.unclear.includes("amountGhs")) problems.push("Amount is missing.");
  if (row.method !== "cash" && row.method !== "momo" && !row.unclear.includes("method")) problems.push("Say cash or MoMo.");
  const m = matchStudent(row.studentName, all);
  if (!m.student && !row.unclear.includes("studentName")) {
    problems.push(row.studentName ? `No student called "${row.studentName}" on the fee list.` : "Student is missing.");
  }
  if (m.how === "close" && m.student) warnings.push(`Read as "${row.studentName}"; closest on the fee list is ${m.student.name}.`);
  if (m.student && row.className && !sameClass(row.className, m.student.className)) {
    warnings.push(`Receipt says ${row.className}; ${m.student.name} is in ${m.student.className}.`);
  }
  return {
    ready: problems.length === 0,
    problems,
    warnings,
    studentId: m.student?.id ?? null,
    studentMatch: m.how,
    suggestions: m.suggestions,
  };
}

function fieldLabel(f: string) {
  return ({ receiptNo: "the receipt number", date: "the date", studentName: "the name", className: "the class", amountGhs: "the amount", method: "cash or MoMo" } as Record<string, string>)[f] ?? f;
}

/** The batch (or the latest unfinished one) with every row checked. */
export async function getCapture(batchId?: string) {
  const db = getDb();
  const [batch] = batchId
    ? await db.select().from(captureBatches).where(eq(captureBatches.id, batchId)).limit(1)
    : await db.select().from(captureBatches).where(ne(captureBatches.status, "done")).orderBy(desc(captureBatches.createdAt)).limit(1);
  if (!batch) return null;
  const rows = await db.select().from(captureRows).where(eq(captureRows.batchId, batch.id)).orderBy(asc(captureRows.position));
  const all = await db.select({ id: students.id, name: students.name, className: students.className }).from(students).limit(5000);
  const nos = rows.map((r) => r.receiptNo.trim().replace(/^0+(?=.)/, "")).filter(Boolean);
  const taken = new Set(
    nos.length ? (await db.select({ no: receipts.receiptNo }).from(receipts).where(inArray(receipts.receiptNo, nos))).map((r) => r.no) : [],
  );
  return {
    batchId: batch.id,
    status: batch.status,
    rows: rows.map((r) => {
      const unclear = JSON.parse(r.unclear) as CaptureField[];
      const view = { receiptNo: r.receiptNo, date: r.date, studentName: r.studentName, className: r.className, amountGhs: r.amountGhs, method: r.method, unclear };
      const added = !!r.addedReceiptNo;
      return {
        rowId: r.id,
        ...view,
        added,
        check: added
          ? { ready: false, problems: [], warnings: [], studentId: null, studentMatch: "exact" as const, suggestions: [] }
          : checkRow(view, all, taken),
      };
    }),
  };
}

export interface ConfirmRow {
  rowId: string;
  receiptNo: string;
  date: string;
  studentId: string;
  className?: string | undefined;
  amountGhs: string;
  method: "cash" | "momo";
}

/** Adds each edited row as a receipt (source "photo"). Rows that fail stay as drafts with the reason. */
export async function confirmCapture(batchId: string, rows: ConfirmRow[], ownerEmail: string) {
  const db = getDb();
  const [batch] = await db.select().from(captureBatches).where(eq(captureBatches.id, batchId)).limit(1);
  if (!batch) throw new CaptureError(`No capture ${batchId}.`);
  const added: string[] = [];
  const failed: { rowId: string; message: string }[] = [];
  for (const r of rows) {
    const [draft] = await db.select().from(captureRows).where(and(eq(captureRows.id, r.rowId), eq(captureRows.batchId, batchId))).limit(1);
    if (!draft) {
      failed.push({ rowId: r.rowId, message: "That row isn't part of this capture." });
      continue;
    }
    if (draft.addedReceiptNo) continue;
    // Keep the bursar's edits on the draft whatever happens next.
    await db
      .update(captureRows)
      .set({ receiptNo: r.receiptNo, date: r.date, className: r.className ?? draft.className, amountGhs: r.amountGhs, method: r.method, unclear: "[]" })
      .where(eq(captureRows.id, r.rowId));
    try {
      const [st] = await db.select().from(students).where(eq(students.id, r.studentId)).limit(1);
      if (!st) throw new CaptureError("Choose the student from the fee list.");
      await db.update(captureRows).set({ studentName: st.name }).where(eq(captureRows.id, r.rowId));
      const [saved] = await addReceipts(
        [{ receiptNo: r.receiptNo, date: r.date, studentId: st.id, amountPesewas: ghsToPesewas(r.amountGhs), method: r.method }],
        "photo",
        ownerEmail,
      );
      await db.update(captureRows).set({ addedReceiptNo: saved!.receiptNo }).where(eq(captureRows.id, r.rowId));
      added.push(saved!.receiptNo);
    } catch (e) {
      if (e instanceof ReceiptRuleError || e instanceof LedgerError || e instanceof CaptureError) failed.push({ rowId: r.rowId, message: e.message });
      else if (e instanceof Error && /GHS amount/.test(e.message)) failed.push({ rowId: r.rowId, message: e.message });
      else throw e;
    }
  }
  const left = await db
    .select({ id: captureRows.id, added: captureRows.addedReceiptNo })
    .from(captureRows)
    .where(eq(captureRows.batchId, batchId));
  if (left.every((x) => x.added)) await db.update(captureBatches).set({ status: "done" }).where(eq(captureBatches.id, batchId));
  return { added, failed };
}

/**
 * Rules every receipt must pass, wherever it comes from (form, chat, photo, CSV).
 * Kept pure (today is passed in) so they are easy to test.
 */
import { pesewasToGhs } from "./money.js";

/** GHS 100,000.00 — far above any term fee, well inside the database's integer range. */
export const MAX_RECEIPT_PESEWAS = 10_000_000;
/** Statement lines can be lump deposits, so allow more: GHS 1,000,000.00. */
export const MAX_MONEY_LINE_PESEWAS = 100_000_000;

export type ReceiptRuleCode = "bad_amount" | "bad_date" | "bad_receipt_no";

export class ReceiptRuleError extends Error {
  constructor(
    message: string,
    public readonly code: ReceiptRuleCode,
  ) {
    super(message);
  }
}

/** " 01120 " → "1120". Leading zeros never make a different receipt. "0" stays "0". */
export function normaliseReceiptNo(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new ReceiptRuleError("Receipt number is empty.", "bad_receipt_no");
  return trimmed.replace(/^0+(?=.)/, "");
}

export function checkReceiptAmount(pesewas: number): number {
  if (!Number.isSafeInteger(pesewas) || pesewas <= 0) {
    throw new ReceiptRuleError("Amount must be more than GHS 0.00.", "bad_amount");
  }
  if (pesewas > MAX_RECEIPT_PESEWAS) {
    throw new ReceiptRuleError(
      `GHS ${formatGhs(pesewas)} is more than the GHS ${formatGhs(MAX_RECEIPT_PESEWAS)} limit for one receipt. Check the amount.`,
      "bad_amount",
    );
  }
  return pesewas;
}

/** Today's date in Accra (UTC+0) as YYYY-MM-DD. */
export function todayAccra(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Receipt dates must be real, not in the future, and at most a year old. */
export function checkReceiptDate(date: string, today: string = todayAccra()): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new ReceiptRuleError(`Date "${date}" must be YYYY-MM-DD, e.g. 2026-11-02.`, "bad_date");
  }
  if (date > today) {
    throw new ReceiptRuleError(`${date} is in the future (today is ${today}).`, "bad_date");
  }
  const t = new Date(`${today}T00:00:00Z`);
  const oneYearAgo = new Date(Date.UTC(t.getUTCFullYear() - 1, t.getUTCMonth(), t.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  if (date < oneYearAgo) {
    throw new ReceiptRuleError(`${date} is more than a year ago (earliest allowed is ${oneYearAgo}).`, "bad_date");
  }
  return date;
}

/** "jhs1", "JHS 1", " Jhs  1 " all compare equal. */
export function sameClass(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(a) === norm(b);
}

function formatGhs(pesewas: number): string {
  const [whole, dec] = pesewasToGhs(pesewas).split(".");
  return `${Number(whole).toLocaleString("en-US")}.${dec}`;
}

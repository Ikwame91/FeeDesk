/**
 * Pure CSV → row parsers used by the import actions. Every amount leaves here as
 * integer pesewas. A file with any bad row is rejected as a whole, with row numbers.
 */
import { parseCsvRecords } from "./csv.js";
import { ghsToPesewas } from "./money.js";
import { findPhoneIn, isGhanaMobile, normalisePhone } from "./phone.js";
import { checkReceiptAmount, MAX_MONEY_LINE_PESEWAS, MAX_RECEIPT_PESEWAS, normaliseReceiptNo } from "./receipt-rules.js";

function capped(pesewas: number, max: number, label: string): number {
  if (pesewas > max) throw new Error(`${label} is over the GHS ${(max / 100).toLocaleString("en-US")} limit`);
  return pesewas;
}

export interface StudentRow {
  id: string;
  name: string;
  className: string;
  termFeePesewas: number;
  parentName: string;
  parentPhone: string;
}

export interface MoneyLineRow {
  source: "momo" | "bank";
  date: string;
  time: string | null;
  payerName: string | null;
  payerPhone: string | null;
  amountPesewas: number;
  txnId: string;
  reference: string | null;
}

export interface ReceiptRow {
  receiptNo: string;
  date: string;
  studentId: string;
  amountPesewas: number;
  method: "cash" | "momo";
}

export class ImportError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `${problems.length} problem${problems.length === 1 ? "" : "s"} in the file: ` +
        problems.slice(0, 5).join("; ") +
        (problems.length > 5 ? `; and ${problems.length - 5} more` : ""),
    );
  }
}

/** First header present out of the accepted spellings. */
function col(header: string[], names: string[], label: string): string {
  const found = names.find((n) => header.includes(n));
  if (!found) throw new ImportError([`missing column "${label}" (expected one of: ${names.join(", ")})`]);
  return found;
}

export { normalisePhone } from "./phone.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function collect<T>(records: Record<string, string>[], parse: (r: Record<string, string>) => T | null): T[] {
  const rows: T[] = [];
  const problems: string[] = [];
  records.forEach((r, i) => {
    try {
      const row = parse(r);
      if (row) rows.push(row);
    } catch (e) {
      problems.push(`row ${i + 2}: ${(e as Error).message}`); // +2: header is row 1
    }
  });
  if (problems.length) throw new ImportError(problems);
  return rows;
}

function required(r: Record<string, string>, key: string, label: string): string {
  const v = r[key];
  if (!v) throw new Error(`${label} is empty`);
  return v;
}

function date(value: string, label = "date"): string {
  if (!isIsoDate(value)) throw new Error(`${label} "${value}" is not a date like 2026-10-14`);
  return value;
}

export function parseStudentsCsv(text: string): StudentRow[] {
  const { header, records } = parseCsvRecords(text);
  const c = {
    id: col(header, ["student_id", "id"], "student_id"),
    name: col(header, ["full_name", "name", "student_name"], "full_name"),
    cls: col(header, ["class", "class_name"], "class"),
    fee: col(header, ["term_fee_ghs", "term_fee", "fee"], "term_fee_ghs"),
    parent: col(header, ["parent_name"], "parent_name"),
    phone: col(header, ["parent_phone"], "parent_phone"),
  };
  return collect(records, (r) => ({
    id: required(r, c.id, "student_id"),
    name: required(r, c.name, "full_name"),
    className: required(r, c.cls, "class"),
    termFeePesewas: capped(ghsToPesewas(required(r, c.fee, "term_fee_ghs")), MAX_RECEIPT_PESEWAS, "term fee"),
    parentName: required(r, c.parent, "parent_name"),
    parentPhone: normalisePhone(required(r, c.phone, "parent_phone")),
  }));
}

/** True when the header is MTN's own statement export (TRANSACTION DATE … F_ID, REF, OVA). */
export function isMtnLayout(header: string[]): boolean {
  return header.includes("f_id") && header.includes("to_no") && header.includes("trans_type");
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "06-Nov-2026 11:00:13 PM" → { date: "2026-11-06", time: "23:00:13" }. */
export function parseMtnDateTime(raw: string): { date: string; time: string | null } {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(raw.trim());
  const month = m ? MONTHS[m[2]!.toLowerCase()] : undefined;
  if (!m || !month) throw new Error(`date "${raw}" is not like 06-Nov-2026 11:00:13 PM`);
  const date = `${m[3]}-${month}-${m[1]!.padStart(2, "0")}`;
  if (!isIsoDate(date)) throw new Error(`date "${raw}" is not a real date`);
  if (m[4] === undefined) return { date, time: null };
  let h = Number(m[4]);
  const ampm = m[7]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (h > 23) throw new Error(`time in "${raw}" is not valid`);
  return { date, time: `${String(h).padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}` };
}

/** Banks, other networks and aggregators that pass a payment on; the real sender is then in REF. */
const PASS_THROUGH_SENDER = /\b(bank|plc|ltd|limited|ghipss|telecel|vodafone|airteltigo|at money|transflow|hubtel|expresspay|zeepay|interpay|g-money|gmoney|cash|transfer|services)\b/i;

export interface MtnParseResult {
  rows: MoneyLineRow[];
  skipped: { notToSchool: number; outgoing: number };
}

/**
 * MTN MoMo statement export. Keeps only money coming in to the school's own number (TO NO.),
 * uses F_ID as the transaction ID, and for bank or cross-network payments takes the real
 * sender's phone from REF. Rows that are not money in to the school are skipped, not parsed,
 * so their odd values (negative amounts, fees) can't reject the file.
 */
export function parseMtnMomoCsv(text: string, schoolNumber: string | null | undefined): MtnParseResult {
  const { records } = parseCsvRecords(text);
  const school = normalisePhone(schoolNumber);
  const seen = new Map<string, number>();
  for (const r of records) {
    const to = normalisePhone(r.to_no);
    if (to) seen.set(to, (seen.get(to) ?? 0) + 1);
  }
  const likely = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} (${c} rows)`);
  if (!school) {
    throw new ImportError([
      `this is an MTN statement, so FeeDesk needs the school's MoMo number to tell money coming in from money going out. Set it in School settings${likely.length ? `; the most common receiving numbers here are ${likely.join(", ")}` : ""}`,
    ]);
  }
  if (!seen.has(school)) {
    throw new ImportError([
      `no row in this statement pays the school's number ${school}${likely.length ? `; the most common receiving numbers are ${likely.join(", ")}` : ""}. Check the number in School settings`,
    ]);
  }
  let notToSchool = 0;
  let outgoing = 0;
  const rows = collect<MoneyLineRow>(records, (r) => {
    const to = normalisePhone(r.to_no);
    const from = normalisePhone(r.from_no);
    if (from === school) {
      outgoing++;
      return null;
    }
    if (to !== school) {
      notToSchool++;
      return null;
    }
    const { date, time } = parseMtnDateTime(required(r, "transaction_date", "TRANSACTION DATE"));
    const amountPesewas = capped(ghsToPesewas(required(r, "amount", "AMOUNT").replace(/^-/, "")), MAX_MONEY_LINE_PESEWAS, "amount");
    if (amountPesewas <= 0) throw new Error("amount must be more than 0");
    const ref = r.ref || null;
    const fromName = r.from_name || null;
    const passThrough = !isGhanaMobile(from) || (fromName ? PASS_THROUGH_SENDER.test(fromName) : false);
    const payerPhone = (passThrough ? findPhoneIn(ref) : null) ?? (from || null);
    return {
      source: "momo",
      date,
      time,
      payerName: fromName,
      payerPhone,
      amountPesewas,
      txnId: required(r, "f_id", "F_ID"),
      reference: ref,
    };
  });
  return { rows, skipped: { notToSchool, outgoing } };
}

/** MoMo merchant statement. Only successful incoming payments become money lines. */
export function parseMomoCsv(text: string): MoneyLineRow[] {
  const { header, records } = parseCsvRecords(text);
  const c = {
    txn: col(header, ["transaction_id", "txn_id"], "Transaction ID"),
    when: col(header, ["date_time", "date"], "Date/Time"),
    name: col(header, ["from_name", "payer_name"], "From Name"),
    phone: col(header, ["from_number", "payer_phone"], "From Number"),
    amount: col(header, ["amount_ghs", "amount"], "Amount (GHS)"),
  };
  const ref = header.includes("reference") ? "reference" : null;
  const status = header.includes("status") ? "status" : null;
  return collect(records, (r) => {
    if (status && r[status] && r[status].toUpperCase() !== "SUCCESSFUL") return null;
    const [d, t] = required(r, c.when, "Date/Time").split(/[ T]/);
    const amountPesewas = capped(ghsToPesewas(required(r, c.amount, "Amount (GHS)")), MAX_MONEY_LINE_PESEWAS, "amount");
    if (amountPesewas <= 0) throw new Error("amount must be more than 0");
    return {
      source: "momo",
      date: date(d ?? "", "Date/Time"),
      time: t ?? null,
      payerName: r[c.name] || null,
      payerPhone: r[c.phone] ? normalisePhone(r[c.phone]!) : null,
      amountPesewas,
      txnId: required(r, c.txn, "Transaction ID"),
      reference: (ref && r[ref]) || null,
    };
  });
}

/** Bank statement. Only credits (money in) become money lines; debits are skipped. */
export function parseBankCsv(text: string): MoneyLineRow[] {
  const { header, records } = parseCsvRecords(text);
  const c = {
    date: col(header, ["date", "value_date"], "Date"),
    credit: col(header, ["credit_ghs", "credit"], "Credit (GHS)"),
    ref: col(header, ["reference", "ref"], "Reference"),
  };
  const desc = header.includes("description") ? "description" : null;
  return collect(records, (r) => {
    const credit = r[c.credit];
    if (!credit) return null; // a debit line
    const amountPesewas = capped(ghsToPesewas(credit), MAX_MONEY_LINE_PESEWAS, "credit");
    if (amountPesewas <= 0) return null;
    return {
      source: "bank",
      date: date(required(r, c.date, "Date"), "Date"),
      time: null,
      payerName: (desc && r[desc]) || null,
      payerPhone: null,
      amountPesewas,
      txnId: required(r, c.ref, "Reference"),
      reference: (desc && r[desc]) || null,
    };
  });
}

/** Receipt book exported/typed as CSV (used for the demo seed). */
export function parseReceiptsCsv(text: string): ReceiptRow[] {
  const { header, records } = parseCsvRecords(text);
  const c = {
    no: col(header, ["receipt_no", "receipt_number"], "receipt_no"),
    date: col(header, ["date"], "date"),
    student: col(header, ["student_id"], "student_id"),
    amount: col(header, ["amount_ghs", "amount"], "amount_ghs"),
    method: col(header, ["method"], "method"),
  };
  return collect(records, (r) => {
    const method = required(r, c.method, "method").toLowerCase();
    if (method !== "cash" && method !== "momo") throw new Error(`method "${method}" must be cash or momo`);
    const amountPesewas = checkReceiptAmount(ghsToPesewas(required(r, c.amount, "amount_ghs")));
    return {
      receiptNo: normaliseReceiptNo(required(r, c.no, "receipt_no")),
      date: date(required(r, c.date, "date")),
      studentId: required(r, c.student, "student_id"),
      amountPesewas,
      method,
    };
  });
}

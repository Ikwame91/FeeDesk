/**
 * Deterministic matching evidence for FeeDesk. Pure: give it the ledger, get back
 * suggestions. The agent reviews these and records them with record-match / raise-flag;
 * record-match (not this file) enforces the auto-accept rule.
 *
 * MoMo receipts are matched one-to-one with MoMo lines from the parent's number or name.
 * Cash receipts are matched as a day's group against a bank deposit that adds up exactly.
 */
import { pesewasToGhs } from "./money.js";
import { samePhone } from "./phone.js";

export interface MStudent {
  id: string;
  name: string;
  className: string;
  parentName: string;
  parentPhone: string;
}
export interface MReceipt {
  id: string;
  receiptNo: string;
  date: string;
  studentId: string;
  amountPesewas: number;
  method: "cash" | "momo";
  status: string;
}
export interface MLine {
  id: string;
  source: "momo" | "bank";
  date: string;
  payerName: string | null;
  payerPhone: string | null;
  amountPesewas: number;
  txnId: string;
  reference: string | null;
}
export interface MMatch {
  id: string;
  receiptIds: string[];
  moneyLineId: string;
  state: string;
}
export interface MFlag {
  kind: string;
  receiptId: string | null;
  moneyLineId: string | null;
  resolvedAt: string | null;
}

export interface ProposedMatch {
  receiptNos: string[];
  moneyRef: string;
  confidence: number;
  reason: string;
}
export interface ProposedFlag {
  kind: "no_money" | "no_receipt" | "duplicate";
  receiptNo?: string | undefined;
  moneyRef?: string | undefined;
  note: string;
}

export const AUTO_ACCEPT = 0.9;
const DATE_WINDOW_DAYS = 3;
const DEPOSIT_WINDOW_DAYS = 4; // Friday cash banked on Monday is 3 days later

export const moneyRef = (l: Pick<MLine, "source" | "txnId">) => `${l.source}:${l.txnId}`;
export function parseMoneyRef(ref: string): { source: "momo" | "bank"; txnId: string } | null {
  const m = /^(momo|bank):(.+)$/.exec(ref.trim());
  return m ? { source: m[1] as "momo" | "bank", txnId: m[2]!.trim() } : null;
}

const ghs = (p: number) => `GHS ${Number(pesewasToGhs(p)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const dayMs = 86_400_000;
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);
const niceDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const byReceiptOrder = (a: MReceipt, b: MReceipt) =>
  a.date.localeCompare(b.date) || a.receiptNo.length - b.receiptNo.length || a.receiptNo.localeCompare(b.receiptNo);

/** Lines already spoken for by a live (not rejected) match. */
export function takenLines(matches: MMatch[]): Map<string, string[]> {
  const taken = new Map<string, string[]>();
  for (const m of matches) if (m.state !== "rejected") taken.set(m.moneyLineId, m.receiptIds);
  return taken;
}

// ---------- MoMo evidence ----------
const tokens = (s: string | null | undefined) =>
  new Set((s ?? "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1));

export interface MomoEvidence {
  phone: boolean;
  name: boolean;
  ref: boolean;
  amountEqual: boolean;
  dayGap: number;
  score: number;
  reason: string;
}

export function momoEvidence(r: MReceipt, s: MStudent, l: MLine): MomoEvidence | null {
  const dayGap = Math.abs(daysBetween(r.date, l.date));
  if (l.source !== "momo" || dayGap > DATE_WINDOW_DAYS) return null;
  const phone = samePhone(l.payerPhone, s.parentPhone);
  const parentTokens = tokens(s.parentName);
  // MTN puts the real sender of a bank or cross-network payment in REF, so look there too.
  const nameIn = (text: string | null | undefined) => [...tokens(text)].filter((t) => parentTokens.has(t)).length >= 2;
  const name = nameIn(l.payerName) || nameIn(l.reference);
  const ref = refNamesStudent(l.reference, s);
  // Without the parent's phone, name or the student's name, a same-amount line is a coincidence.
  if (!phone && !name && !ref) return null;
  const amountEqual = r.amountPesewas === l.amountPesewas;

  let score = amountEqual ? 0.5 : 0;
  score += [0.2, 0.12, 0.06, 0.03][dayGap] ?? 0;
  score += phone ? 0.25 : name ? 0.15 : 0.1;
  if (ref && (phone || name)) score += 0.04;
  score = Math.min(0.99, Math.round(score * 100) / 100);

  const parts = [
    amountEqual ? "same amount" : `amount differs: receipt ${ghs(r.amountPesewas)}, MoMo ${ghs(l.amountPesewas)};`,
    dayGap === 0 ? "same day" : `${dayGap} day${dayGap === 1 ? "" : "s"} apart`,
    phone ? `parent's phone ending ${s.parentPhone.slice(-4)}` : name ? `payer ${l.payerName} is the parent` : null,
    ref ? `reference names ${s.name.split(" ")[0]}` : null,
  ].filter(Boolean);
  const reason = parts.join(", ").replace(/;,/, ";").replace(/^./, (c) => c.toUpperCase());
  return { phone, name, ref, amountEqual, dayGap, score, reason };
}

function refNamesStudent(reference: string | null, s: MStudent): boolean {
  if (!reference) return false;
  const ref = reference.toLowerCase();
  const first = s.name.split(" ")[0]!.toLowerCase();
  return ref.includes(s.name.toLowerCase()) || (first.length >= 3 && new RegExp(`\\b${first}\\b`).test(ref));
}

// ---------- cash evidence ----------
/** The subsets of `amounts` adding up to `target` (indexes). Small n only. */
export function subsetsSummingTo(amounts: number[], target: number, max = 2): number[][] {
  const n = Math.min(amounts.length, 16);
  const found: number[][] = [];
  for (let mask = 1; mask < 1 << n && found.length < max; mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += amounts[i]!;
    if (sum === target) found.push([...Array(n).keys()].filter((i) => mask & (1 << i)));
  }
  return found;
}

// ---------- the page of suggestions ----------
export interface Ledger {
  students: MStudent[];
  receipts: MReceipt[];
  lines: MLine[];
  matches: MMatch[];
  flags: MFlag[];
}

export interface Suggestions {
  toRecord: ProposedMatch[];
  toFlag: ProposedFlag[];
  receiptsInPage: number;
  remainingAfterPage: number;
  done: boolean;
}

/**
 * Suggestions for the next `limit` unchecked receipts (cash receipts come with the rest
 * of their day). When no unchecked receipts are left, suggests no_receipt flags for
 * money lines nothing has claimed.
 */
export function suggestNextPage(ledger: Ledger, limit = 40): Suggestions {
  const studentById = new Map(ledger.students.map((s) => [s.id, s]));
  const receiptById = new Map(ledger.receipts.map((r) => [r.id, r]));
  const taken = takenLines(ledger.matches); // lineId -> receiptIds
  const unchecked = ledger.receipts.filter((r) => r.status === "unchecked").sort(byReceiptOrder);

  // Build the page: MoMo receipts one by one, cash receipts as whole days.
  const page: MReceipt[] = [];
  const cashDays = new Set<string>();
  for (const r of unchecked) {
    if (page.length >= limit) break;
    if (r.method === "momo") page.push(r);
    else if (!cashDays.has(r.date)) {
      cashDays.add(r.date);
      page.push(...unchecked.filter((c) => c.method === "cash" && c.date === r.date));
    }
  }

  const toRecord: ProposedMatch[] = [];
  const toFlag: ProposedFlag[] = [];

  if (page.length === 0) {
    const flaggedLines = new Set(ledger.flags.filter((f) => !f.resolvedAt && f.moneyLineId).map((f) => f.moneyLineId));
    const free = ledger.lines
      .filter((l) => !taken.has(l.id) && !flaggedLines.has(l.id))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const l of free.slice(0, limit)) {
      const parentOf = l.payerPhone ? ledger.students.find((s) => samePhone(s.parentPhone, l.payerPhone)) : undefined;
      toFlag.push({
        kind: "no_receipt",
        moneyRef: moneyRef(l),
        note:
          `${l.source === "momo" ? "MoMo payment" : "Bank credit"} of ${ghs(l.amountPesewas)} on ${niceDate(l.date)}` +
          `${l.payerName ? ` from ${l.payerName}` : ""} has no receipt.` +
          (parentOf ? ` The number belongs to the parent of ${parentOf.name} (${parentOf.className}, ${parentOf.id}).` : ""),
      });
    }
    return { toRecord, toFlag, receiptsInPage: 0, remainingAfterPage: 0, done: free.length <= limit };
  }

  // MoMo: score every (receipt, line) pair, then assign greedily, best first.
  const momoReceipts = page.filter((r) => r.method === "momo");
  const pairs: { r: MReceipt; l: MLine; e: MomoEvidence }[] = [];
  for (const r of momoReceipts) {
    const s = studentById.get(r.studentId);
    if (!s) continue;
    for (const l of ledger.lines) {
      if (taken.has(l.id)) continue;
      const e = momoEvidence(r, s, l);
      if (e) pairs.push({ r, l, e });
    }
  }
  pairs.sort((a, b) => b.e.score - a.e.score);
  const assigned = new Map<string, { l: MLine; e: MomoEvidence }>(); // receiptId -> line
  const usedLines = new Map<string, string>(); // lineId -> receiptId (this page)
  for (const p of pairs) {
    if (assigned.has(p.r.id) || usedLines.has(p.l.id)) continue;
    assigned.set(p.r.id, { l: p.l, e: p.e });
    usedLines.set(p.l.id, p.r.id);
  }
  for (const r of momoReceipts) {
    const a = assigned.get(r.id);
    if (a) {
      toRecord.push({ receiptNos: [r.receiptNo], moneyRef: moneyRef(a.l), confidence: a.e.score, reason: a.e.reason });
      continue;
    }
    // No free line. Is the payment already claimed by another receipt for the same student?
    const s = studentById.get(r.studentId);
    const twin = s
      ? ledger.lines
          .map((l) => {
            const holders = taken.get(l.id) ?? (usedLines.has(l.id) ? [usedLines.get(l.id)!] : null);
            const e = holders ? momoEvidence(r, s, l) : null;
            return e?.amountEqual ? { l, holders: holders!.map((id) => receiptById.get(id)).filter(Boolean) as MReceipt[] } : null;
          })
          .find((x) => x && x.holders.some((h) => h.studentId === r.studentId && h.amountPesewas === r.amountPesewas))
      : undefined;
    if (twin) {
      const original = twin.holders[0]!;
      toFlag.push({
        kind: "duplicate",
        receiptNo: r.receiptNo,
        moneyRef: moneyRef(twin.l),
        note: `Looks like a second receipt for the same payment: receipt ${original.receiptNo} (${niceDate(original.date)}) already covers MoMo ${twin.l.txnId}, same student and ${ghs(r.amountPesewas)}.`,
      });
    } else {
      toFlag.push({
        kind: "no_money",
        receiptNo: r.receiptNo,
        note: `No MoMo payment of ${ghs(r.amountPesewas)} found within ${DATE_WINDOW_DAYS} days of ${niceDate(r.date)} from the parent's number or name.`,
      });
    }
  }

  // Cash: each day's receipts against bank deposits that add up exactly.
  const deposits = ledger.lines
    .filter((l) => l.source === "bank" && !taken.has(l.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  const usedDeposits = new Set<string>();
  for (const day of [...cashDays].sort()) {
    let group = page.filter((r) => r.method === "cash" && r.date === day);
    for (const d of deposits) {
      if (usedDeposits.has(d.id) || group.length === 0) continue;
      const gap = daysBetween(day, d.date);
      if (gap < 0 || gap > DEPOSIT_WINDOW_DAYS) continue;
      const subsets = subsetsSummingTo(group.map((r) => r.amountPesewas), d.amountPesewas);
      if (subsets.length === 0) continue;
      const covered = subsets[0]!.map((i) => group[i]!);
      const unique = subsets.length === 1;
      const nos = covered.map((r) => r.receiptNo);
      const confidence = gap === 0 && unique ? 0.95 : gap === 0 ? 0.6 : 0.7;
      const reason =
        gap === 0
          ? `${niceDate(d.date)} deposit ${ghs(d.amountPesewas)} equals ${covered.length === 1 ? "this cash receipt" : `these ${covered.length} cash receipts`}${unique ? "" : " (another combination also fits)"}`
          : `No deposit on ${niceDate(day)}; the ${niceDate(d.date)} deposit ${ghs(d.amountPesewas)} equals these ${covered.length} receipts`;
      toRecord.push({ receiptNos: nos, moneyRef: moneyRef(d), confidence, reason });
      usedDeposits.add(d.id);
      group = group.filter((r) => !nos.includes(r.receiptNo));
    }
    for (const r of group) {
      const sameDay = toRecord.find((m) => m.moneyRef.startsWith("bank:") && m.receiptNos.some((no) => page.find((p) => p.receiptNo === no)?.date === day));
      toFlag.push({
        kind: "no_money",
        receiptNo: r.receiptNo,
        note: sameDay
          ? `Cash receipt not covered: ${sameDay.reason.split(" equals")[0]} matches receipts ${sameDay.receiptNos.join(", ")} without it.`
          : `No bank deposit within ${DEPOSIT_WINDOW_DAYS} days of ${niceDate(day)} adds up to include this cash receipt.`,
      });
    }
  }

  const pageIds = new Set(page.map((r) => r.id));
  const remainingAfterPage = unchecked.filter((r) => !pageIds.has(r.id)).length;
  return { toRecord, toFlag, receiptsInPage: page.length, remainingAfterPage, done: false };
}

/** Ranked evidence for specific receipts (any status), for answering "why?" questions. */
export function explainReceipts(ledger: Ledger, receiptNos: string[]) {
  const studentById = new Map(ledger.students.map((s) => [s.id, s]));
  const taken = takenLines(ledger.matches);
  const receiptById = new Map(ledger.receipts.map((r) => [r.id, r]));
  return receiptNos.map((no) => {
    const r = ledger.receipts.find((x) => x.receiptNo === no);
    if (!r) return { receiptNo: no, found: false, candidates: [] };
    const s = studentById.get(r.studentId);
    const holders = (l: MLine) => (taken.get(l.id) ?? []).map((id) => receiptById.get(id)?.receiptNo).filter(Boolean) as string[];
    const candidates =
      r.method === "momo" && s
        ? ledger.lines
            .map((l) => ({ l, e: momoEvidence(r, s, l) }))
            .filter((x) => x.e)
            .sort((a, b) => b.e!.score - a.e!.score)
            .slice(0, 3)
            .map(({ l, e }) => ({ moneyRef: moneyRef(l), amountGhs: pesewasToGhs(l.amountPesewas), date: l.date, score: e!.score, evidence: e!.reason, matchedTo: holders(l) }))
        : ledger.lines
            .filter((l) => l.source === "bank" && daysBetween(r.date, l.date) >= 0 && daysBetween(r.date, l.date) <= DEPOSIT_WINDOW_DAYS)
            .slice(0, 3)
            .map((l) => ({
              moneyRef: moneyRef(l),
              amountGhs: pesewasToGhs(l.amountPesewas),
              date: l.date,
              score: 0,
              evidence: `Deposit ${daysBetween(r.date, l.date)} day(s) after; cash receipts that day: ${ledger.receipts
                .filter((c) => c.method === "cash" && c.date === r.date && c.status !== "void")
                .map((c) => `${c.receiptNo} (${pesewasToGhs(c.amountPesewas)})`)
                .join(", ")}`,
              matchedTo: holders(l),
            }));
    return {
      receiptNo: no,
      found: true,
      status: r.status,
      date: r.date,
      amountGhs: pesewasToGhs(r.amountPesewas),
      method: r.method,
      student: s ? `${s.name} (${s.className}), parent ${s.parentName} ${s.parentPhone}` : r.studentId,
      candidates,
    };
  });
}

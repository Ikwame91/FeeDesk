/**
 * Database side of matching: record matches, raise and resolve flags, summarise.
 * Shared by the actions (agent + UI) and the tests.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { addReceipts } from "./ledger.js";
import {
  AUTO_ACCEPT,
  moneyRef,
  suggestNextPage,
  parseMoneyRef,
  type Ledger,
  type MReceipt,
  type ProposedFlag,
  type ProposedMatch,
} from "./matching.js";
import { pesewasToGhs } from "./money.js";
import { normaliseReceiptNo } from "./receipt-rules.js";

const { students, receipts, moneyLines, matches, flags } = schema;

export class ReconcileError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "already_resolved" | "bad_resolution" | "conflict",
  ) {
    super(message);
  }
}

const ghs = (p: number) => `GHS ${Number(pesewasToGhs(p)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const now = () => new Date().toISOString();

export async function loadLedger(): Promise<Ledger> {
  const db = getDb();
  const [s, r, l, m, f] = await Promise.all([
    db
      .select({ id: students.id, name: students.name, className: students.className, parentName: students.parentName, parentPhone: students.parentPhone })
      .from(students),
    db
      .select({ id: receipts.id, receiptNo: receipts.receiptNo, date: receipts.date, studentId: receipts.studentId, amountPesewas: receipts.amountPesewas, method: receipts.method, status: receipts.status })
      .from(receipts),
    db
      .select({ id: moneyLines.id, source: moneyLines.source, date: moneyLines.date, payerName: moneyLines.payerName, payerPhone: moneyLines.payerPhone, amountPesewas: moneyLines.amountPesewas, txnId: moneyLines.txnId, reference: moneyLines.reference })
      .from(moneyLines),
    db.select({ id: matches.id, receiptIds: matches.receiptIds, moneyLineId: matches.moneyLineId, state: matches.state }).from(matches),
    db.select({ kind: flags.kind, receiptId: flags.receiptId, moneyLineId: flags.moneyLineId, resolvedAt: flags.resolvedAt }).from(flags),
  ]);
  return {
    students: s,
    receipts: r,
    lines: l,
    matches: m.map((x) => ({ ...x, receiptIds: JSON.parse(x.receiptIds) as string[] })),
    flags: f,
  };
}

async function findLine(ref: string) {
  const parsed = parseMoneyRef(ref);
  if (!parsed) throw new ReconcileError(`"${ref}" is not a money reference like momo:94336846938 or bank:DEP20260917.`, "not_found");
  const [line] = await getDb()
    .select()
    .from(moneyLines)
    .where(and(eq(moneyLines.source, parsed.source), eq(moneyLines.txnId, parsed.txnId)))
    .limit(1);
  if (!line) throw new ReconcileError(`No ${parsed.source === "momo" ? "MoMo" : "bank"} line ${parsed.txnId}.`, "not_found");
  return line;
}

// ---------- record-match ----------
export interface RecordOutcome {
  receiptNos: string[];
  outcome: "verified" | "flagged" | "rejected";
  detail: string;
}

/**
 * Saves each proposed match. Auto-accepts only when confidence >= 0.9 AND the receipts
 * add up exactly to the money line AND the method fits (MoMo↔MoMo, cash↔bank).
 * Anything else is saved as "proposed" with a flag for the bursar. Bad items are
 * rejected individually; the rest still save.
 */
export async function recordMatches(items: ProposedMatch[], ownerEmail: string): Promise<RecordOutcome[]> {
  const db = getDb();
  const out: RecordOutcome[] = [];
  for (const item of items) {
    const receiptNos = item.receiptNos.map(normaliseReceiptNo);
    try {
      const line = await findLine(item.moneyRef);
      const rs = await db.select().from(receipts).where(inArray(receipts.receiptNo, receiptNos));
      const missing = receiptNos.filter((no) => !rs.some((r) => r.receiptNo === no));
      if (missing.length) throw new ReconcileError(`Receipt ${missing.join(", ")} not found.`, "not_found");
      const notOpen = rs.filter((r) => r.status !== "unchecked");
      if (notOpen.length) {
        throw new ReconcileError(
          `Receipt ${notOpen.map((r) => `${r.receiptNo} is already ${r.status}`).join("; ")}. Use resolve-flag for flagged receipts.`,
          "conflict",
        );
      }
      const live = await db
        .select({ receiptIds: matches.receiptIds })
        .from(matches)
        .where(and(eq(matches.moneyLineId, line.id), sql`${matches.state} <> 'rejected'`))
        .limit(1);
      if (live.length) {
        const holders = await db
          .select({ receiptNo: receipts.receiptNo })
          .from(receipts)
          .where(inArray(receipts.id, JSON.parse(live[0]!.receiptIds) as string[]));
        throw new ReconcileError(
          `${moneyRef(line)} is already matched to receipt ${holders.map((h) => h.receiptNo).join(", ")}. If this is a second receipt for the same payment, raise a duplicate flag.`,
          "conflict",
        );
      }

      const sum = rs.reduce((a, r) => a + r.amountPesewas, 0);
      const methodFits = rs.every((r) => (line.source === "momo" ? r.method === "momo" : r.method === "cash"));
      const confidence = Math.max(0, Math.min(1, item.confidence));
      const auto = confidence >= AUTO_ACCEPT && sum === line.amountPesewas && methodFits;
      const matchId = crypto.randomUUID();
      const reason = item.reason.trim().slice(0, 200);

      await db.transaction(async (tx) => {
        await tx.insert(matches).values({
          id: matchId,
          receiptIds: JSON.stringify(rs.map((r) => r.id)),
          moneyLineId: line.id,
          confidence,
          reason,
          state: auto ? "auto" : "proposed",
          ownerEmail,
        });
        await tx
          .update(receipts)
          .set({ status: auto ? "verified" : "flagged" })
          .where(inArray(receipts.id, rs.map((r) => r.id)));
        if (!auto) {
          const kind = sum !== line.amountPesewas ? "amount_diff" : "no_money";
          const lineLabel = line.source === "momo" ? "the MoMo payment" : "the bank deposit";
          const why =
            sum !== line.amountPesewas
              ? /differs/i.test(item.reason)
                ? "" // the reason already states both amounts
                : `Receipt${rs.length > 1 ? "s total" : " says"} ${ghs(sum)}; ${lineLabel} is ${ghs(line.amountPesewas)}.`
              : !methodFits
                ? `Payment method doesn't fit (${rs[0]!.method} receipt vs ${line.source} line).`
                : `Possible match at ${Math.round(confidence * 100)}% confidence needs a person to confirm.`;
          await tx.insert(flags).values({
            id: crypto.randomUUID(),
            kind,
            receiptId: rs[0]!.id,
            moneyLineId: line.id,
            matchId,
            note: `${why} ${reason}`.trim().slice(0, 500),
            ownerEmail,
          });
        }
      });
      out.push({
        receiptNos,
        outcome: auto ? "verified" : "flagged",
        detail: auto ? `matched ${moneyRef(line)}` : `flagged for review against ${moneyRef(line)}`,
      });
    } catch (e) {
      if (!(e instanceof ReconcileError)) throw e;
      out.push({ receiptNos, outcome: "rejected", detail: e.message });
    }
  }
  return out;
}

// ---------- raise-flag ----------
export async function raiseFlags(items: ProposedFlag[], ownerEmail: string) {
  const db = getDb();
  let raised = 0;
  const skipped: string[] = [];
  for (const f of items) {
    const label = f.receiptNo ? `receipt ${f.receiptNo}` : (f.moneyRef ?? "?");
    let receiptId: string | null = null;
    let lineId: string | null = null;
    if (f.receiptNo) {
      const [r] = await db.select().from(receipts).where(eq(receipts.receiptNo, normaliseReceiptNo(f.receiptNo))).limit(1);
      if (!r) {
        skipped.push(`${label}: not found`);
        continue;
      }
      if (r.status === "verified" || r.status === "void") {
        skipped.push(`${label}: already ${r.status}`);
        continue;
      }
      receiptId = r.id;
    }
    if (f.moneyRef) {
      try {
        lineId = (await findLine(f.moneyRef)).id;
      } catch (e) {
        skipped.push(`${label}: ${(e as Error).message}`);
        continue;
      }
    }
    if (f.kind === "no_receipt" ? !lineId : !receiptId) {
      skipped.push(`${label}: ${f.kind === "no_receipt" ? "needs moneyRef" : "needs receiptNo"}`);
      continue;
    }
    const open = await db
      .select({ id: flags.id })
      .from(flags)
      .where(
        and(
          eq(flags.kind, f.kind),
          isNull(flags.resolvedAt),
          receiptId ? eq(flags.receiptId, receiptId) : eq(flags.moneyLineId, lineId!),
        ),
      )
      .limit(1);
    if (open.length) {
      skipped.push(`${label}: already flagged`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.insert(flags).values({
        id: crypto.randomUUID(),
        kind: f.kind,
        receiptId,
        moneyLineId: lineId,
        note: f.note.trim().slice(0, 500),
        ownerEmail,
      });
      if (receiptId) await tx.update(receipts).set({ status: "flagged" }).where(eq(receipts.id, receiptId));
    });
    raised++;
  }
  return { raised, skipped };
}

// ---------- resolve-flag ----------
export const RESOLUTIONS = ["accept_match", "fix_amount", "void_duplicate", "add_receipt", "real_problem"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export interface ResolveInput {
  flagId: string;
  resolution: Resolution;
  moneyRef?: string;
  receiptNo?: string;
  studentId?: string;
  note?: string;
}

export async function resolveFlag(input: ResolveInput, who: string): Promise<{ message: string }> {
  const db = getDb();
  const [flag] = await db.select().from(flags).where(eq(flags.id, input.flagId)).limit(1);
  if (!flag) throw new ReconcileError(`No flag ${input.flagId}.`, "not_found");
  if (flag.resolvedAt) throw new ReconcileError(`That flag was already resolved (${flag.resolution}).`, "already_resolved");
  const [receipt] = flag.receiptId ? await db.select().from(receipts).where(eq(receipts.id, flag.receiptId)).limit(1) : [];
  const [proposed] = flag.matchId ? await db.select().from(matches).where(eq(matches.id, flag.matchId)).limit(1) : [];
  const bad = (msg: string): never => {
    throw new ReconcileError(msg, "bad_resolution");
  };
  const stamp = (resolution: string) => ({
    resolution: input.note ? `${resolution}: ${input.note.slice(0, 300)}` : resolution,
    resolvedBy: who,
    resolvedAt: now(),
  });

  switch (input.resolution) {
    case "accept_match": {
      // "Banked together/separately", "yes that's the one": confirm the proposed match, or link a line.
      if (proposed) {
        const rs = await db.select().from(receipts).where(inArray(receipts.id, JSON.parse(proposed.receiptIds) as string[]));
        const [line] = await db.select().from(moneyLines).where(eq(moneyLines.id, proposed.moneyLineId));
        const sum = rs.reduce((a, r) => a + r.amountPesewas, 0);
        if (line && sum !== line.amountPesewas) bad(`Amounts differ (${ghs(sum)} vs ${ghs(line.amountPesewas)}); use fix_amount or real_problem.`);
        await db.transaction(async (tx) => {
          await tx.update(matches).set({ state: "accepted" }).where(eq(matches.id, proposed.id));
          await tx.update(receipts).set({ status: "verified" }).where(inArray(receipts.id, rs.map((r) => r.id)));
          await tx.update(flags).set(stamp("accept_match")).where(eq(flags.id, flag.id));
        });
        return { message: `Confirmed: receipt${rs.length > 1 ? "s" : ""} ${rs.map((r) => r.receiptNo).join(", ")} verified.` };
      }
      if (!receipt) bad("This flag has no receipt to match.");
      if (!input.moneyRef) bad("Say which money line covers it: pass moneyRef, e.g. bank:DEP20261012.");
      const line = await findLine(input.moneyRef!);
      const live = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.moneyLineId, line.id), sql`${matches.state} <> 'rejected'`))
        .limit(1);
      if (live.length) bad(`${moneyRef(line)} is already matched to other receipts.`);
      if (line.amountPesewas !== receipt!.amountPesewas) {
        bad(`${moneyRef(line)} is ${ghs(line.amountPesewas)} but the receipt is ${ghs(receipt!.amountPesewas)}.`);
      }
      await db.transaction(async (tx) => {
        await tx.insert(matches).values({
          id: crypto.randomUUID(),
          receiptIds: JSON.stringify([receipt!.id]),
          moneyLineId: line.id,
          confidence: 1,
          reason: `Confirmed by ${who}${input.note ? `: ${input.note.slice(0, 120)}` : ""}`,
          state: "accepted",
          ownerEmail: who,
        });
        await tx.update(receipts).set({ status: "verified" }).where(eq(receipts.id, receipt!.id));
        await tx.update(flags).set(stamp("accept_match")).where(eq(flags.id, flag.id));
      });
      return { message: `Receipt ${receipt!.receiptNo} verified against ${moneyRef(line)}.` };
    }

    case "fix_amount": {
      // The receipt was written wrong; the money is the truth.
      if (!receipt || !flag.moneyLineId) bad("fix_amount needs a flag with both a receipt and a money line.");
      const [line] = await db.select().from(moneyLines).where(eq(moneyLines.id, flag.moneyLineId!));
      if (proposed && (JSON.parse(proposed.receiptIds) as string[]).length > 1) bad("Fix amounts one receipt at a time.");
      const from = receipt!.amountPesewas;
      const to = line!.amountPesewas;
      await db.transaction(async (tx) => {
        await tx.update(receipts).set({ amountPesewas: to, status: "verified" }).where(eq(receipts.id, receipt!.id));
        if (proposed) await tx.update(matches).set({ state: "accepted" }).where(eq(matches.id, proposed.id));
        else
          await tx.insert(matches).values({
            id: crypto.randomUUID(),
            receiptIds: JSON.stringify([receipt!.id]),
            moneyLineId: line!.id,
            confidence: 1,
            reason: `Amount corrected by ${who}`,
            state: "accepted",
            ownerEmail: who,
          });
        await tx
          .update(flags)
          .set(stamp(`fix_amount: corrected from ${pesewasToGhs(from)} to ${pesewasToGhs(to)}`))
          .where(eq(flags.id, flag.id));
      });
      return { message: `Receipt ${receipt!.receiptNo} corrected from ${ghs(from)} to ${ghs(to)} and verified.` };
    }

    case "void_duplicate": {
      if (!receipt) bad("This flag has no receipt to void.");
      await db.transaction(async (tx) => {
        await tx.update(receipts).set({ status: "void" }).where(eq(receipts.id, receipt!.id));
        if (proposed) await tx.update(matches).set({ state: "rejected" }).where(eq(matches.id, proposed.id));
        await tx.update(flags).set(stamp("void_duplicate")).where(eq(flags.id, flag.id));
      });
      return { message: `Receipt ${receipt!.receiptNo} voided as a duplicate.` };
    }

    case "add_receipt": {
      // Money came in with no receipt: write the receipt now, from the money line.
      if (flag.kind !== "no_receipt" || !flag.moneyLineId) bad("add_receipt is for no_receipt flags.");
      if (!input.receiptNo) bad("Give the receipt number to write, e.g. receiptNo 1120.");
      const [line] = await db.select().from(moneyLines).where(eq(moneyLines.id, flag.moneyLineId!));
      let studentId = input.studentId;
      if (!studentId && line!.payerPhone) {
        const owners = await db.select({ id: students.id }).from(students).where(eq(students.parentPhone, line!.payerPhone));
        if (owners.length === 1) studentId = owners[0]!.id;
      }
      if (!studentId) bad("Couldn't tell which student this is for from the payer's number; pass studentId.");
      const [saved] = await addReceipts(
        [{ receiptNo: input.receiptNo!, date: line!.date, studentId: studentId!, amountPesewas: line!.amountPesewas, method: line!.source === "momo" ? "momo" : "cash" }],
        "typed",
        who,
      );
      await db.transaction(async (tx) => {
        await tx.insert(matches).values({
          id: crypto.randomUUID(),
          receiptIds: JSON.stringify([saved!.id]),
          moneyLineId: line!.id,
          confidence: 1,
          reason: `Receipt written by ${who} for this payment`,
          state: "accepted",
          ownerEmail: who,
        });
        await tx.update(receipts).set({ status: "verified" }).where(eq(receipts.id, saved!.id));
        await tx.update(flags).set(stamp(`add_receipt: ${saved!.receiptNo}`)).where(eq(flags.id, flag.id));
      });
      return { message: `Receipt ${saved!.receiptNo} written for ${ghs(line!.amountPesewas)} and verified.` };
    }

    case "real_problem": {
      // Stays flagged on the receipt (and in the header); the flag leaves the review queue.
      await db.transaction(async (tx) => {
        if (proposed) await tx.update(matches).set({ state: "rejected" }).where(eq(matches.id, proposed.id));
        await tx.update(flags).set(stamp("real_problem")).where(eq(flags.id, flag.id));
      });
      return { message: `Marked as a real problem${receipt ? `: receipt ${receipt.receiptNo} stays flagged` : ""}.` };
    }
  }
}

// ---------- the whole check, no AI ----------
/**
 * Runs every page of suggestions through record-match and raise-flag, exactly as the
 * agent does when it passes suggestions through. Deterministic: no model involved.
 */
export async function runFullCheck(who: string, pageSize = 40) {
  let pages = 0;
  let verified = 0;
  let flaggedByMatch = 0;
  let flagsRaised = 0;
  const notSaved: string[] = [];
  for (; pages < 20; ) {
    const page = suggestNextPage(await loadLedger(), pageSize);
    if (page.toRecord.length === 0 && page.toFlag.length === 0 && page.receiptsInPage === 0) break;
    pages++;
    for (const o of await recordMatches(page.toRecord, who)) {
      if (o.outcome === "verified") verified += o.receiptNos.length;
      else if (o.outcome === "flagged") flaggedByMatch += o.receiptNos.length;
      else notSaved.push(`${o.receiptNos.join(", ")}: ${o.detail}`);
    }
    if (page.toFlag.length) {
      const r = await raiseFlags(page.toFlag, who);
      flagsRaised += r.raised;
      notSaved.push(...r.skipped);
    }
    if (page.receiptsInPage === 0 && page.done) break;
  }
  return { pages, verified, flaggedByMatch, flagsRaised, notSaved };
}

// ---------- summary ----------
export async function getSummary() {
  const db = getDb();
  const n = sql<number>`count(*)::int`;
  const statusRows = await db.select({ status: receipts.status, n }).from(receipts).groupBy(receipts.status);
  const by = (s: string) => Number(statusRows.find((r) => r.status === s)?.n ?? 0);
  const openFlagRows = await db.select({ kind: flags.kind, n }).from(flags).where(isNull(flags.resolvedAt)).groupBy(flags.kind);
  const owing = await db
    .select({ id: students.id })
    .from(students)
    .leftJoin(receipts, and(eq(receipts.studentId, students.id), eq(receipts.status, "verified")))
    .groupBy(students.id, students.termFeePesewas)
    .having(sql`${students.termFeePesewas} > coalesce(sum(${receipts.amountPesewas}), 0)`);
  const ledger = await loadLedger();
  const taken = new Set(ledger.matches.filter((m) => m.state !== "rejected").map((m) => m.moneyLineId));
  const receiptsTotal = by("unchecked") + by("verified") + by("flagged");
  return {
    receipts: receiptsTotal,
    verified: by("verified"),
    flagged: by("flagged"),
    unchecked: by("unchecked"),
    voided: by("void"),
    openFlags: openFlagRows.reduce((a, r) => a + Number(r.n), 0),
    openFlagsByKind: Object.fromEntries(openFlagRows.map((r) => [r.kind, Number(r.n)])) as Record<string, number>,
    studentsOwing: owing.length,
    students: ledger.students.length,
    moneyLinesUnmatched: ledger.lines.filter((l) => !taken.has(l.id)).length,
    headline: `${by("verified")} of ${receiptsTotal} receipts verified · ${by("flagged")} flagged · ${owing.length} students owing`,
  };
}

// ---------- list flags ----------
export async function listFlags(includeResolved = false, limit = 100) {
  const db = getDb();
  const rows = await db
    .select()
    .from(flags)
    .where(includeResolved ? undefined : isNull(flags.resolvedAt))
    .orderBy(flags.createdAt)
    .limit(limit);
  const ledger = await loadLedger();
  const studentById = new Map(ledger.students.map((s) => [s.id, s]));
  const receiptById = new Map(ledger.receipts.map((r) => [r.id, r]));
  const lineById = new Map(ledger.lines.map((l) => [l.id, l]));
  const matchById = new Map(ledger.matches.map((m) => [m.id, m]));
  const describeReceipt = (r: MReceipt | undefined) => {
    if (!r) return null;
    const s = studentById.get(r.studentId);
    return {
      receiptNo: r.receiptNo,
      date: r.date,
      studentId: r.studentId,
      studentName: s?.name ?? r.studentId,
      className: s?.className ?? "",
      amountGhs: pesewasToGhs(r.amountPesewas),
      method: r.method,
    };
  };
  return rows.map((f) => {
    const line = f.moneyLineId ? lineById.get(f.moneyLineId) : undefined;
    const match = f.matchId ? matchById.get(f.matchId) : undefined;
    const matchReceipts = match ? match.receiptIds.map((id) => describeReceipt(receiptById.get(id))!).filter(Boolean) : [];
    const payerStudent = line?.payerPhone ? ledger.students.find((s) => s.parentPhone === line.payerPhone) : undefined;
    return {
      id: f.id,
      kind: f.kind,
      note: f.note,
      createdAt: f.createdAt,
      resolution: f.resolution,
      resolvedBy: f.resolvedBy,
      receipt: describeReceipt(f.receiptId ? receiptById.get(f.receiptId) : undefined),
      moneyLine: line
        ? {
            moneyRef: moneyRef(line),
            source: line.source,
            date: line.date,
            payerName: line.payerName,
            payerPhone: line.payerPhone,
            amountGhs: pesewasToGhs(line.amountPesewas),
            reference: line.reference,
          }
        : null,
      proposedMatch: match ? { receipts: matchReceipts } : null,
      likelyStudent: payerStudent ? { id: payerStudent.id, name: payerStudent.name, className: payerStudent.className } : null,
    };
  });
}

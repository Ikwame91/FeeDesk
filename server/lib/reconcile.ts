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
  type MLine,
  type MReceipt,
  type ProposedFlag,
  type ProposedMatch,
} from "./matching.js";
import { pesewasToGhs } from "./money.js";
import { normalisePhone, samePhone } from "./phone.js";
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
    db.select({ id: flags.id, kind: flags.kind, receiptId: flags.receiptId, moneyLineId: flags.moneyLineId, resolvedAt: flags.resolvedAt }).from(flags),
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

// ---------- record-match / raise-flag: decide in memory, write once ----------
export interface RecordOutcome {
  receiptNos: string[];
  outcome: "verified" | "flagged" | "rejected";
  detail: string;
}

type NewMatch = typeof matches.$inferInsert;
type NewFlag = typeof flags.$inferInsert;

/**
 * Every matching write goes through a CheckPlan. It works on a ledger read once, applies each
 * record-match / raise-flag decision in memory (and to that ledger, so later suggestions see it),
 * and `commit()` writes everything in ONE transaction with bulk statements. On a database across an
 * ocean that is a handful of round trips instead of a dozen per receipt.
 *
 * The rules are unchanged: a match is auto-accepted only when confidence >= 0.9 AND the receipts add
 * up exactly to the money line AND the method fits (MoMo↔MoMo, cash↔bank); anything else is saved as
 * "proposed" with a flag. Bad items are rejected one by one; the rest still save.
 */
export class CheckPlan {
  private readonly receiptByNo = new Map<string, MReceipt>();
  private readonly lineByRef = new Map<string, MLine>();
  private readonly lineHolders = new Map<string, string[]>(); // lineId -> receiptIds of its live match
  private readonly newMatches: NewMatch[] = [];
  private readonly newFlags: NewFlag[] = [];
  private readonly statusChanges = new Map<string, string>(); // receiptId -> new status
  private readonly resolvedFlagIds = new Set<string>(); // existing no_receipt flags now answered
  private readonly stamp = now();

  constructor(
    readonly ledger: Ledger,
    private readonly owner: string,
  ) {
    for (const r of ledger.receipts) this.receiptByNo.set(r.receiptNo, r);
    for (const l of ledger.lines) this.lineByRef.set(moneyRef(l), l);
    for (const m of ledger.matches) if (m.state !== "rejected") this.lineHolders.set(m.moneyLineId, m.receiptIds);
  }

  private line(ref: string): MLine {
    const parsed = parseMoneyRef(ref);
    if (!parsed) throw new ReconcileError(`"${ref}" is not a money reference like momo:94336846938 or bank:DEP20260917.`, "not_found");
    const line = this.lineByRef.get(moneyRef(parsed));
    if (!line) throw new ReconcileError(`No ${parsed.source === "momo" ? "MoMo" : "bank"} line ${parsed.txnId}.`, "not_found");
    return line;
  }

  private setStatus(r: MReceipt, status: string) {
    r.status = status;
    this.statusChanges.set(r.id, status);
  }

  recordMatch(item: ProposedMatch): RecordOutcome {
    const receiptNos = item.receiptNos.map(normaliseReceiptNo);
    try {
      const line = this.line(item.moneyRef);
      const missing = receiptNos.filter((no) => !this.receiptByNo.has(no));
      if (missing.length) throw new ReconcileError(`Receipt ${missing.join(", ")} not found.`, "not_found");
      const rs = receiptNos.map((no) => this.receiptByNo.get(no)!);
      const notOpen = rs.filter((r) => r.status !== "unchecked");
      if (notOpen.length) {
        throw new ReconcileError(
          `Receipt ${notOpen.map((r) => `${r.receiptNo} is already ${r.status}`).join("; ")}. Use resolve-flag for flagged receipts.`,
          "conflict",
        );
      }
      const holders = this.lineHolders.get(line.id);
      if (holders) {
        const nos = holders.map((id) => this.ledger.receipts.find((r) => r.id === id)?.receiptNo).filter(Boolean);
        throw new ReconcileError(
          `${moneyRef(line)} is already matched to receipt ${nos.join(", ")}. If this is a second receipt for the same payment, raise a duplicate flag.`,
          "conflict",
        );
      }

      const sum = rs.reduce((a, r) => a + r.amountPesewas, 0);
      const methodFits = rs.every((r) => (line.source === "momo" ? r.method === "momo" : r.method === "cash"));
      const confidence = Math.max(0, Math.min(1, item.confidence));
      const auto = confidence >= AUTO_ACCEPT && sum === line.amountPesewas && methodFits;
      const matchId = crypto.randomUUID();
      const reason = item.reason.trim().slice(0, 200);
      const receiptIds = rs.map((r) => r.id);

      this.newMatches.push({ id: matchId, receiptIds: JSON.stringify(receiptIds), moneyLineId: line.id, confidence, reason, state: auto ? "auto" : "proposed", ownerEmail: this.owner });
      this.ledger.matches.push({ id: matchId, receiptIds, moneyLineId: line.id, state: auto ? "auto" : "proposed" });
      this.lineHolders.set(line.id, receiptIds);
      for (const r of rs) this.setStatus(r, auto ? "verified" : "flagged");

      // A receipt has now turned up for this money, so an earlier "no receipt" flag is answered.
      for (const f of this.ledger.flags) {
        if (f.kind !== "no_receipt" || f.moneyLineId !== line.id || f.resolvedAt) continue;
        f.resolvedAt = this.stamp;
        const fresh = this.newFlags.find((n) => n.id === f.id);
        if (fresh) Object.assign(fresh, { resolution: `auto: receipt ${receiptNos.join(", ")} found for this payment`, resolvedBy: this.owner, resolvedAt: this.stamp });
        else if (f.id) this.resolvedFlagIds.add(f.id);
      }

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
        this.addFlag({ kind, receiptId: rs[0]!.id, moneyLineId: line.id, matchId, note: `${why} ${reason}`.trim().slice(0, 500) });
      }
      return {
        receiptNos,
        outcome: auto ? "verified" : "flagged",
        detail: auto ? `matched ${moneyRef(line)}` : `flagged for review against ${moneyRef(line)}`,
      };
    } catch (e) {
      if (!(e instanceof ReconcileError)) throw e;
      return { receiptNos, outcome: "rejected", detail: e.message };
    }
  }

  private addFlag(f: { kind: string; receiptId: string | null; moneyLineId: string | null; matchId?: string; note: string }) {
    const id = crypto.randomUUID();
    this.newFlags.push({ id, kind: f.kind as NewFlag["kind"], receiptId: f.receiptId, moneyLineId: f.moneyLineId, matchId: f.matchId ?? null, note: f.note, ownerEmail: this.owner });
    this.ledger.flags.push({ id, kind: f.kind, receiptId: f.receiptId, moneyLineId: f.moneyLineId, resolvedAt: null });
  }

  /** Returns null when raised, or why it was skipped. */
  raiseFlag(f: ProposedFlag): string | null {
    const label = f.receiptNo ? `receipt ${f.receiptNo}` : (f.moneyRef ?? "?");
    let receipt: MReceipt | undefined;
    let lineId: string | null = null;
    if (f.receiptNo) {
      receipt = this.receiptByNo.get(normaliseReceiptNo(f.receiptNo));
      if (!receipt) return `${label}: not found`;
      if (receipt.status === "verified" || receipt.status === "void") return `${label}: already ${receipt.status}`;
    }
    if (f.moneyRef) {
      try {
        lineId = this.line(f.moneyRef).id;
      } catch (e) {
        return `${label}: ${(e as Error).message}`;
      }
    }
    if (f.kind === "no_receipt" ? !lineId : !receipt) return `${label}: ${f.kind === "no_receipt" ? "needs moneyRef" : "needs receiptNo"}`;
    const open = this.ledger.flags.some(
      (x) => x.kind === f.kind && !x.resolvedAt && (receipt ? x.receiptId === receipt.id : x.moneyLineId === lineId),
    );
    if (open) return `${label}: already flagged`;
    this.addFlag({ kind: f.kind, receiptId: receipt?.id ?? null, moneyLineId: lineId, note: f.note.trim().slice(0, 500) });
    if (receipt) this.setStatus(receipt, "flagged");
    return null;
  }

  /** Writes every decision in one transaction: a few bulk statements, whatever the number of receipts. */
  async commit(): Promise<void> {
    if (!this.newMatches.length && !this.newFlags.length && !this.statusChanges.size && !this.resolvedFlagIds.size) return;
    const byStatus = new Map<string, string[]>();
    for (const [id, status] of this.statusChanges) byStatus.set(status, [...(byStatus.get(status) ?? []), id]);
    await getDb().transaction(async (tx) => {
      if (this.newMatches.length) await tx.insert(matches).values(this.newMatches);
      if (this.newFlags.length) await tx.insert(flags).values(this.newFlags);
      for (const [status, ids] of byStatus) {
        await tx.update(receipts).set({ status: status as "unchecked" | "verified" | "flagged" | "void" }).where(inArray(receipts.id, ids));
      }
      if (this.resolvedFlagIds.size) {
        await tx
          .update(flags)
          .set({ resolution: "auto: a receipt was found for this payment", resolvedBy: this.owner, resolvedAt: this.stamp })
          .where(and(inArray(flags.id, [...this.resolvedFlagIds]), isNull(flags.resolvedAt)));
      }
    });
  }
}

export async function recordMatches(items: ProposedMatch[], ownerEmail: string): Promise<RecordOutcome[]> {
  const plan = new CheckPlan(await loadLedger(), ownerEmail);
  const out = items.map((item) => plan.recordMatch(item));
  await plan.commit();
  return out;
}

export async function raiseFlags(items: ProposedFlag[], ownerEmail: string) {
  const plan = new CheckPlan(await loadLedger(), ownerEmail);
  const skipped: string[] = [];
  let raised = 0;
  for (const f of items) {
    const why = plan.raiseFlag(f);
    if (why) skipped.push(why);
    else raised++;
  }
  await plan.commit();
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
        const owners = await db.select({ id: students.id }).from(students).where(eq(students.parentPhone, normalisePhone(line!.payerPhone)));
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
  const plan = new CheckPlan(await loadLedger(), who);
  let pages = 0;
  let verified = 0;
  let flaggedByMatch = 0;
  let flagsRaised = 0;
  const notSaved: string[] = [];
  for (; pages < 50; ) {
    const page = suggestNextPage(plan.ledger, pageSize);
    if (page.toRecord.length === 0 && page.toFlag.length === 0 && page.receiptsInPage === 0) break;
    pages++;
    for (const item of page.toRecord) {
      const o = plan.recordMatch(item);
      if (o.outcome === "verified") verified += o.receiptNos.length;
      else if (o.outcome === "flagged") flaggedByMatch += o.receiptNos.length;
      else notSaved.push(`${o.receiptNos.join(", ")}: ${o.detail}`);
    }
    for (const f of page.toFlag) {
      const why = plan.raiseFlag(f);
      if (why) notSaved.push(why);
      else flagsRaised++;
    }
    if (page.receiptsInPage === 0 && page.done) break;
  }
  await plan.commit();
  return { pages, verified, flaggedByMatch, flagsRaised, notSaved };
}

// ---------- summary ----------
export async function getSummary() {
  const db = getDb();
  const n = sql<number>`count(*)::int`;
  // Independent reads, sent together: on a remote database this is one wait, not several.
  const [statusRows, openFlagRows, owing, [verifiedSum], studentCount, lineRows] = await Promise.all([
    db.select({ status: receipts.status, n }).from(receipts).groupBy(receipts.status),
    db.select({ kind: flags.kind, n }).from(flags).where(isNull(flags.resolvedAt)).groupBy(flags.kind),
    db
      .select({
        id: students.id,
        balance: sql<number>`(${students.termFeePesewas} - coalesce(sum(${receipts.amountPesewas}), 0))::int`,
      })
      .from(students)
      .leftJoin(receipts, and(eq(receipts.studentId, students.id), eq(receipts.status, "verified")))
      .groupBy(students.id, students.termFeePesewas)
      .having(sql`${students.termFeePesewas} > coalesce(sum(${receipts.amountPesewas}), 0)`),
    db
      .select({ total: sql<number>`coalesce(sum(${receipts.amountPesewas}), 0)::int` })
      .from(receipts)
      .where(eq(receipts.status, "verified")),
    db.select({ n }).from(students),
    db
      .select({ n })
      .from(moneyLines)
      .where(sql`not exists (select 1 from ${matches} where ${matches.moneyLineId} = ${moneyLines.id} and ${matches.state} <> 'rejected')`),
  ]);
  const by = (s: string) => Number(statusRows.find((r) => r.status === s)?.n ?? 0);
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
    students: Number(studentCount[0]?.n ?? 0),
    moneyLinesUnmatched: Number(lineRows[0]?.n ?? 0),
    verifiedGhs: pesewasToGhs(Number(verifiedSum?.total ?? 0)),
    owedGhs: pesewasToGhs(owing.reduce((t, o) => t + Number(o.balance), 0)),
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
    const payerStudent = line?.payerPhone ? ledger.students.find((s) => samePhone(s.parentPhone, line.payerPhone)) : undefined;
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

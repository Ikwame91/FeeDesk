/**
 * The four demo states, in recording order, on the fictional seed.
 * Photo receipts 1114–1119 stay out until after the first check.
 * Does not edit seed/answer-key.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDbExec } from "@agent-native/core/db";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import listOwing from "../actions/list-owing";
import listReceipts from "../actions/list-receipts";
import reopenFlagAction from "../actions/reopen-flag";
import { ghsToPesewas } from "../server/lib/money";
import { parseBankCsv, parseMomoCsv, parseReceiptsCsv, parseStudentsCsv } from "../server/lib/importers";
import { addReceipts, insertMoneyLines, upsertStudents } from "../server/lib/ledger";
import { getSummary, listFlags, reopenFlag, resolveFlag, runFullCheck } from "../server/lib/reconcile";
import { getDb, schema } from "../server/db/index";
import { FEEDESK_MIGRATIONS } from "../server/plugins/db";

const seed = (f: string) => readFileSync(join(__dirname, "..", "seed", f), "utf8");
const who = "bursar@example.test";
const TODAY = "2026-11-04";
const ctx = { userEmail: who };

beforeAll(async () => {
  for (const m of FEEDESK_MIGRATIONS) for (const stmt of m.sql.split(/;\s*\n/)) await getDbExec().execute(stmt);
  await upsertStudents(parseStudentsCsv(seed("students.csv")), who);
  await addReceipts(parseReceiptsCsv(seed("receipts.csv")), "upload", who, { today: TODAY });
  await insertMoneyLines(parseMomoCsv(seed("momo-merchant-statement.csv")), who);
  await insertMoneyLines(parseBankCsv(seed("bank-statement.csv")), who);
});

async function lineCounts() {
  const rows = await getDb()
    .select({ source: schema.moneyLines.source, n: sql<number>`count(*)::int` })
    .from(schema.moneyLines)
    .groupBy(schema.moneyLines.source);
  return {
    momo: Number(rows.find((row) => row.source === "momo")?.n ?? 0),
    bank: Number(rows.find((row) => row.source === "bank")?.n ?? 0),
  };
}

describe("four demo states", () => {
  it("loads 45 students, 113 receipts, 103 MoMo lines and 7 bank lines", async () => {
    const s = await getSummary();
    const lines = await lineCounts();
    expect(s.students).toBe(45);
    expect(s.receipts).toBe(113);
    expect(s.unchecked).toBe(113);
    expect(lines).toEqual({ momo: 103, bank: 7 });
  });

  it("checks the base book to 102 of 113, 11 flagged, 20 owing, GHS 10,630.00", async () => {
    await runFullCheck(who);
    const s = await getSummary();
    expect(s.headline).toBe("102 of 113 receipts verified · 11 flagged · 20 students owing");
    expect(s.verified).toBe(102);
    expect(s.flagged).toBe(11);
    expect(s.studentsOwing).toBe(20);
    expect(s.owedGhs).toBe("10630.00");

    const owing = await listOwing.run({}, ctx);
    expect(owing.studentsOwing).toBe(20);
    expect(owing.students).toHaveLength(20);
    expect(owing.totalGhs).toBe(s.owedGhs);
    const subtotal = owing.classes.reduce((sum, group) => sum + ghsToPesewas(group.subtotalGhs), 0);
    expect(subtotal).toBe(ghsToPesewas(owing.totalGhs));
    for (const group of owing.classes) {
      const balances = group.students.map((student) => ghsToPesewas(student.balanceGhs));
      expect(balances).toEqual([...balances].sort((a, b) => b - a));
    }
    const edem = owing.students.find((student) => student.name === "Edem Kpodo");
    expect(edem?.flaggedReceipts.map((row) => row.mark)).toContain("GHS 250.00 on receipt 1019, under review");
  });

  it("after 1114–1119 is 108 of 119, 11 flagged, 17 owing, 12 cards", async () => {
    await addReceipts(parseReceiptsCsv(seed("photo-page-receipts.csv")), "photo", who, { today: TODAY });
    await runFullCheck(who);
    const s = await getSummary();
    expect(s.headline).toBe("108 of 119 receipts verified · 11 flagged · 17 students owing");
    expect(s.verified).toBe(108);
    expect(s.flagged).toBe(11);
    expect(s.studentsOwing).toBe(17);
    expect(s.openFlags).toBe(12);
  });

  it("reopens a real problem back to the pre-resolve numbers, then finishes at 12 owing GHS 5,000.00", async () => {
    const before = await getSummary();
    const open = await listFlags();
    const problem = open.find((flag) => flag.kind === "no_money" && !flag.proposedMatch && flag.receipt);
    expect(problem?.receipt?.receiptNo).toBeTruthy();
    await resolveFlag({ flagId: problem!.id, resolution: "real_problem" }, who);
    expect((await getSummary()).openFlags).toBe(before.openFlags - 1);
    await reopenFlag(problem!.id);
    expect(await getSummary()).toEqual(before);
    const restored = (await listFlags()).find((flag) => flag.id === problem!.id);
    expect(restored?.resolution).toBeNull();
    expect(restored?.resolvedBy).toBeNull();
    expect(restored?.resolvedAt).toBeNull();

    const typo = (await listFlags()).find((flag) => flag.kind === "amount_diff");
    expect(typo).toBeTruthy();
    await resolveFlag({ flagId: typo!.id, resolution: "fix_amount" }, who);
    await expect(reopenFlagAction.run({ flagId: typo!.id }, ctx)).rejects.toThrow(/real problem/i);

    let nextNo = 1120;
    for (const flag of await listFlags()) {
      if (flag.kind === "amount_diff") await resolveFlag({ flagId: flag.id, resolution: "fix_amount" }, who);
      else if (flag.kind === "duplicate") await resolveFlag({ flagId: flag.id, resolution: "void_duplicate" }, who);
      else if (flag.kind === "no_receipt") await resolveFlag({ flagId: flag.id, resolution: "add_receipt", receiptNo: String(nextNo++) }, who);
      else if (flag.kind === "no_money" && flag.proposedMatch) await resolveFlag({ flagId: flag.id, resolution: "accept_match", note: "banked together Monday" }, who);
      else await resolveFlag({ flagId: flag.id, resolution: "real_problem" }, who);
    }

    const s = await getSummary();
    expect(s.headline).toBe("118 of 120 receipts verified · 2 flagged · 12 students owing");
    expect(s.verified).toBe(118);
    expect(s.flagged).toBe(2);
    expect(s.studentsOwing).toBe(12);
    expect(s.owedGhs).toBe("5000.00");
    expect(s.openFlags).toBe(0);

    const owing = await listOwing.run({}, ctx);
    expect(owing.students).toHaveLength(12);
    expect(owing.totalGhs).toBe("5000.00");
    expect(owing.totalGhs).toBe(s.owedGhs);

    const edem = owing.students.find((student) => student.name === "Edem Kpodo");
    expect(edem?.flaggedReceipts.map((row) => row.mark)).toContain("GHS 250.00 on receipt 1019, kept as a problem");
    const his = await listReceipts.run({ studentId: edem!.id, limit: 50 }, ctx);
    expect(his.receipts.every((row) => row.studentId === edem!.id)).toBe(true);
    expect(his.receipts.some((row) => row.receiptNo === "1019" && row.status === "flagged")).toBe(true);
  });
});

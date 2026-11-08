/**
 * The whole check on the real seed data, as the agent and bursar would run it:
 * suggestions → record-match / raise-flag until done → compare with seed/answer-key.json
 * → resolve every flag → the finish line "118 of 120 verified · 2 flagged · 12 owing".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDbExec } from "@agent-native/core/db";
import { eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { getDb, schema } from "../server/db/index";
import { parseBankCsv, parseMomoCsv, parseReceiptsCsv, parseStudentsCsv } from "../server/lib/importers";
import { addReceipts, insertMoneyLines, upsertStudents } from "../server/lib/ledger";
import { suggestNextPage } from "../server/lib/matching";
import listStudents from "../actions/list-students";
import { owingList } from "../app/lib/owing";
import { getSummary, listFlags, loadLedger, raiseFlags, recordMatches, resolveFlag } from "../server/lib/reconcile";
import { FEEDESK_MIGRATIONS } from "../server/plugins/db";

const seed = (f: string) => readFileSync(join(__dirname, "..", "seed", f), "utf8");
const key = JSON.parse(seed("answer-key.json")) as {
  receipts: { receipt_no: number; case: string; money: { source: string; txn_id?: string; reference?: string } | null }[];
};
const who = "bursar@example.test";
const TODAY = "2026-11-04";

beforeAll(async () => {
  for (const m of FEEDESK_MIGRATIONS) for (const stmt of m.sql.split(/;\s*\n/)) await getDbExec().execute(stmt);
  await upsertStudents(parseStudentsCsv(seed("students.csv")), who);
  await addReceipts(parseReceiptsCsv(seed("receipts.csv")), "upload", who, { today: TODAY });
  await addReceipts(parseReceiptsCsv(seed("photo-page-receipts.csv")), "photo", who, { today: TODAY });
  await insertMoneyLines(parseMomoCsv(seed("momo-merchant-statement.csv")), who);
  await insertMoneyLines(parseBankCsv(seed("bank-statement.csv")), who);
});

describe("check everything on the demo data", () => {
  it("finds exactly the planted mismatches", async () => {
    let pages = 0;
    for (;;) {
      const page = suggestNextPage(await loadLedger(), 40);
      expect(JSON.stringify(page).length).toBeLessThan(12_000); // fits the agent's tool-result limit
      const recorded = await recordMatches(page.toRecord, who);
      expect(recorded.filter((r) => r.outcome === "rejected")).toEqual([]);
      await raiseFlags(page.toFlag, who);
      pages++;
      if (page.receiptsInPage === 0 && page.done) break;
      expect(pages).toBeLessThan(10);
    }

    const ledger = await loadLedger();
    const statusOf = new Map(ledger.receipts.map((r) => [r.receiptNo, r.status]));
    const expectedStatus: Record<string, string> = {
      clean_momo: "verified",
      cash_same_day: "verified",
      cash_banked_monday: "flagged",
      amount_typo: "flagged",
      duplicate: "flagged",
      no_money_momo: "flagged",
      no_money_cash: "flagged",
    };
    const wrong = key.receipts
      .map((r) => ({ no: String(r.receipt_no), case: r.case, want: expectedStatus[r.case], got: statusOf.get(String(r.receipt_no)) }))
      .filter((r) => r.want !== r.got);
    expect(wrong).toEqual([]);

    // Clean receipts matched to exactly the right money line.
    const lineById = new Map(ledger.lines.map((l) => [l.id, l]));
    const receiptByNo = new Map(ledger.receipts.map((r) => [r.receiptNo, r]));
    for (const r of key.receipts.filter((r) => r.case === "clean_momo" || r.case === "cash_same_day")) {
      const id = receiptByNo.get(String(r.receipt_no))!.id;
      const m = ledger.matches.find((x) => x.receiptIds.includes(id) && x.state === "auto")!;
      const line = lineById.get(m.moneyLineId)!;
      expect(line.txnId).toBe(r.money!.txn_id ?? r.money!.reference);
    }

    const flags = await listFlags();
    const kinds = flags.reduce<Record<string, number>>((a, f) => ({ ...a, [f.kind]: (a[f.kind] ?? 0) + 1 }), {});
    // 1 Friday group + 1 MoMo + 1 cash with no money; 4 typos; 2 duplicates; 3 payments with no receipt.
    expect(kinds).toEqual({ no_money: 3, amount_diff: 4, duplicate: 2, no_receipt: 3 });

    const s = await getSummary();
    expect(s.headline).toBe("108 of 119 receipts verified · 11 flagged · 17 students owing");
    expect(s.openFlags).toBe(12);
    expect(s.verified).toBe(108);
  });

  it("reaches 118 of 120 verified · 2 flagged · 12 students owing after the bursar resolves every flag", async () => {
    let nextNo = 1120;
    for (const f of await listFlags()) {
      if (f.kind === "amount_diff") await resolveFlag({ flagId: f.id, resolution: "fix_amount" }, who);
      else if (f.kind === "duplicate") await resolveFlag({ flagId: f.id, resolution: "void_duplicate" }, who);
      else if (f.kind === "no_receipt") await resolveFlag({ flagId: f.id, resolution: "add_receipt", receiptNo: String(nextNo++) }, who);
      else if (f.kind === "no_money" && f.proposedMatch) await resolveFlag({ flagId: f.id, resolution: "accept_match", note: "banked together Monday" }, who);
      else await resolveFlag({ flagId: f.id, resolution: "real_problem" }, who);
    }
    const s = await getSummary();
    expect(s.headline).toBe("118 of 120 receipts verified · 2 flagged · 12 students owing");
    expect(s.studentsOwing).toBe(12);
    expect(s.owedGhs).toBe("5000.00");
    expect(s.openFlags).toBe(0);
    expect(s.moneyLinesUnmatched).toBe(0);

    const listed = owingList((await listStudents.run({}, { userEmail: who })).students);
    expect(listed.rows).toHaveLength(12);
    expect(listed.totalGhs).toBe(s.owedGhs);

    // The two left are the planted real problems.
    const flagged = (await getDb().select().from(schema.receipts).where(eq(schema.receipts.status, "flagged"))).map((r) => r.receiptNo).sort();
    const planted = key.receipts.filter((r) => r.case.startsWith("no_money")).map((r) => String(r.receipt_no)).sort();
    expect(flagged).toEqual(planted);
    expect(await getDb().select().from(schema.flags).where(isNull(schema.flags.resolvedAt))).toEqual([]);
  });
});

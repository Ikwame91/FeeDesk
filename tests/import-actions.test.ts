/**
 * End-to-end through the real actions on an in-memory database: GHS 450.50 sent to
 * each import action and to add-receipt must be stored as exactly 45050 pesewas.
 */
import { getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import addReceipt from "../actions/add-receipt";
import importStatement from "../actions/import-statement";
import importStudents from "../actions/import-students";
import listReceipts from "../actions/list-receipts";
import listStudents from "../actions/list-students";
import { getDb, schema } from "../server/db/index";
import { FEEDESK_MIGRATIONS } from "../server/plugins/db";

const ctx = { userEmail: "bursar@example.test" } as const;

beforeAll(async () => {
  for (const m of FEEDESK_MIGRATIONS) {
    // Our migration SQL has no semicolons inside strings, so a plain split is safe here.
    for (const stmt of m.sql.split(/;\s*\n/)) await getDbExec().execute(stmt);
  }
});

describe("import actions convert GHS to integer pesewas", () => {
  it("import-students stores a 450.50 fee as 45050", async () => {
    await importStudents.run(
      { csv: "student_id,full_name,class,term_fee_ghs,parent_name,parent_phone\nT001,Test Pupil,JHS 1,450.50,Test Parent,0240000001\n" },
      ctx as never,
    );
    const [s] = await getDb().select().from(schema.students).where(eq(schema.students.id, "T001"));
    expect(s.termFeePesewas).toBe(45050);
  });

  it("import-statement (momo and bank) stores 450.50 as 45050", async () => {
    await importStatement.run(
      {
        source: "momo",
        csv: "Transaction ID,Date/Time,From Name,From Number,Amount (GHS),Reference,Status\nTX450,2026-10-14 10:00:00,TEST PARENT,0240000001,450.50,Test Pupil fees,SUCCESSFUL\n",
      },
      ctx as never,
    );
    await importStatement.run(
      { source: "bank", csv: "Date,Description,Reference,Credit (GHS)\n2026-10-15,CASH DEPOSIT,DEP450,450.50\n" },
      ctx as never,
    );
    const lines = await getDb().select().from(schema.moneyLines);
    expect(lines.find((l) => l.txnId === "TX450")?.amountPesewas).toBe(45050);
    expect(lines.find((l) => l.txnId === "DEP450")?.amountPesewas).toBe(45050);
  });

  it("add-receipt stores 450.50 as 45050 and rejects a reused receipt number", async () => {
    const input = { receiptNo: "9001", date: "2026-11-02", studentName: "test pupil", amountGhs: "450.50", method: "cash" as const, source: "typed" as const };
    const saved = await addReceipt.run(input, ctx as never);
    expect(saved.amountGhs).toBe("450.50");
    const [r] = await getDb().select().from(schema.receipts).where(eq(schema.receipts.receiptNo, "9001"));
    expect(r.amountPesewas).toBe(45050);
    expect(r.studentId).toBe("T001");
    await expect(addReceipt.run(input, ctx as never)).rejects.toThrow(/already recorded/);
  });
});

const isoDaysFromToday = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const base = { studentId: "T001", method: "cash" as const, source: "typed" as const };

/** The action's failure code, or "ok". */
async function outcome(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { errorCode?: string }).errorCode ?? `raw: ${(e as Error).message}`;
  }
}

describe("add-receipt rules (through the action)", () => {
  it("1. GHS 99,999,999 is a friendly bad_amount, not a database crash", async () => {
    const r = await outcome(addReceipt.run({ ...base, receiptNo: "9100", date: isoDaysFromToday(0), amountGhs: "99999999" }, ctx as never));
    expect(r).toBe("bad_amount");
    expect(await outcome(addReceipt.run({ ...base, receiptNo: "9101", date: isoDaysFromToday(0), amountGhs: "100000.00" }, ctx as never))).toBe("ok");
  });

  it("2. 01120 and 1120 are the same receipt", async () => {
    const first = await addReceipt.run({ ...base, receiptNo: " 01120 ", date: isoDaysFromToday(0), amountGhs: "10" }, ctx as never);
    expect(first.receiptNo).toBe("1120");
    expect(await outcome(addReceipt.run({ ...base, receiptNo: "1120", date: isoDaysFromToday(0), amountGhs: "10" }, ctx as never))).toBe(
      "duplicate_receipt_no",
    );
  });

  it("3. rejects future dates and dates more than a year back", async () => {
    expect(await outcome(addReceipt.run({ ...base, receiptNo: "9200", date: isoDaysFromToday(1), amountGhs: "10" }, ctx as never))).toBe("bad_date");
    expect(await outcome(addReceipt.run({ ...base, receiptNo: "9201", date: isoDaysFromToday(-400), amountGhs: "10" }, ctx as never))).toBe("bad_date");
    expect(await outcome(addReceipt.run({ ...base, receiptNo: "9202", date: isoDaysFromToday(-300), amountGhs: "10" }, ctx as never))).toBe("ok");
  });

  it("4. a class that doesn't match the fee list is saved with a warning", async () => {
    const r = await addReceipt.run({ ...base, receiptNo: "9300", date: isoDaysFromToday(0), amountGhs: "10", className: "Basic 2" }, ctx as never);
    expect(r.warnings[0]).toMatch(/Receipt says Basic 2, but Test Pupil is in JHS 1/);
    const ok = await addReceipt.run({ ...base, receiptNo: "9301", date: isoDaysFromToday(0), amountGhs: "10", className: "jhs1" }, ctx as never);
    expect(ok.warnings).toEqual([]);
  });

  it("5. list actions refuse callers who are not signed in", async () => {
    expect(await outcome(listStudents.run({}, {} as never))).toBe("not_signed_in");
    expect(await outcome(listReceipts.run({ limit: 5 }, undefined))).toBe("not_signed_in");
  });
});

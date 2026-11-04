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

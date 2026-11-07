/** Photo capture: rows read from a receipt-book photo are drafts, checked, and only added on confirm. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import confirmCapture from "../actions/confirm-capture";
import getCapture from "../actions/get-capture";
import saveCaptureRows from "../actions/save-capture-rows";
import { getDb, schema } from "../server/db/index";
import { matchStudent, normaliseUnclear, writtenDateToIso } from "../server/lib/capture";
import { parseStudentsCsv } from "../server/lib/importers";
import { addReceipts, upsertStudents } from "../server/lib/ledger";
import { FEEDESK_MIGRATIONS } from "../server/plugins/db";

const ctx = { userEmail: "bursar@example.test" } as never;
const seed = (f: string) => readFileSync(join(__dirname, "..", "seed", f), "utf8");
const recent = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  for (const m of FEEDESK_MIGRATIONS) for (const stmt of m.sql.split(/;\s*\n/)) await getDbExec().execute(stmt);
  await upsertStudents(parseStudentsCsv(seed("students.csv")), "bursar@example.test");
  await addReceipts([{ receiptNo: "5000", date: recent(3), studentId: "S001", amountPesewas: 10000, method: "cash" }], "typed", "bursar@example.test");
});

describe("reading what's written in a receipt book", () => {
  it("turns day/month/year into ISO dates", () => {
    expect(writtenDateToIso("28/10/26")).toBe("2026-10-28");
    expect(writtenDateToIso("2-11-2026")).toBe("2026-11-02");
    expect(writtenDateToIso("2026-10-28")).toBe("2026-10-28");
  });

  it("matches names exactly, suggests a clearly close one, and never picks among ties", () => {
    const all = [
      { id: "S1", name: "Kweku Osei", className: "JHS 3" },
      { id: "S2", name: "Akua Mensah", className: "JHS 2" },
      { id: "S3", name: "Ama Mensah", className: "Basic 1" },
    ];
    expect(matchStudent("kweku  osei", all).how).toBe("exact");
    expect(matchStudent("Mensah", all)).toMatchObject({ student: null, how: "none" }); // two Mensahs: no guess
    expect(matchStudent("Kweku Osei Jnr", all)).toMatchObject({ how: "close", student: { id: "S1" } });
  });

  it("uses the class and near-spellings, like the real misreads from Kwame's photo", () => {
    const roll = [
      { id: "A", name: "Ama Frimpong", className: "Basic 4" },
      { id: "B", name: "Kofi Frimpong", className: "JHS 2" },
      { id: "C", name: "Ekow Afful", className: "Basic 6" },
      { id: "D", name: "Linda Appiah", className: "Basic 4" },
      { id: "E", name: "Esi Owusu", className: "Basic 4" },
    ];
    // "Ama" read as "Anna": surname + near-spelling + class → Ama Frimpong, not Kofi.
    expect(matchStudent("Anna Frimpong", roll, "Basic 4")).toMatchObject({ how: "close", student: { id: "A" } });
    // "Afful" read as "Appiah": first name + class → Ekow Afful, not Linda Appiah.
    expect(matchStudent("Ekow Appiah", roll, "Basic 6")).toMatchObject({ how: "close", student: { id: "C" } });
    // The class alone is never enough.
    expect(matchStudent("Yaw Boateng", roll, "Basic 4")).toMatchObject({ how: "none", student: null });
    // Without the class to break the tie, two Frimpongs stay a question.
    expect(matchStudent("Anna Frimpong", roll)).toMatchObject({ how: "none" });
  });

  it("accepts the agent's near-miss names for unclear fields", () => {
    expect(normaliseUnclear(["student", "Amount", "class_name", "nonsense"])).toEqual(["studentName", "amountGhs", "className"]);
  });
});

describe("capture → check → confirm", () => {
  it("saves the agent's rows as drafts and says what needs a look", async () => {
    const saved = await saveCaptureRows.run(
      {
        rows: [
          { receiptNo: "6001", date: "", studentName: "Efua Sarpong", className: "Basic 1", amountGhs: "300.00", method: "MoMo", unclear: ["date"] },
          { receiptNo: "5000", date: recent(1), studentName: "Efua Sarpong", className: "Basic 1", amountGhs: "100", method: "cash" },
          { receiptNo: "6003", date: recent(1), studentName: "Nobody Here", className: "JHS 1", amountGhs: "50", method: "cash" },
          { receiptNo: "6004", date: recent(1), studentName: "Efua Sarpong", className: "JHS 2", amountGhs: "200", method: "cash" },
        ],
      },
      ctx,
    );
    expect(saved).toMatchObject({ rows: 4, ready: 1, needAttention: 3 });
    expect(await getDb().select().from(schema.receipts).where(eq(schema.receipts.receiptNo, "6004"))).toEqual([]); // nothing added yet

    const { capture } = await getCapture.run({ batchId: saved.batchId }, ctx);
    const byNo = Object.fromEntries(capture!.rows.map((r) => [r.receiptNo, r.check]));
    expect(byNo["6001"]!.problems[0]).toMatch(/Check the date against the photo/);
    expect(byNo["5000"]!.problems).toContain("Receipt 5000 is already recorded.");
    expect(byNo["6003"]!.problems[0]).toMatch(/No student called "Nobody Here"/);
    expect(byNo["6004"]!.ready).toBe(true);
    expect(byNo["6004"]!.warnings[0]).toMatch(/Receipt says JHS 2; Efua Sarpong is in Basic 1/);
  });

  it("adds the confirmed rows as photo receipts; a bad row stays with its reason", async () => {
    const { capture } = await getCapture.run({}, ctx);
    const row = (no: string) => capture!.rows.find((r) => r.receiptNo === no)!;
    const res = await confirmCapture.run(
      {
        batchId: capture!.batchId,
        rows: [
          { rowId: row("6001").rowId, receiptNo: "6001", date: recent(2), studentId: "S001", amountGhs: "300.00", method: "momo" }, // date fixed by the bursar
          { rowId: row("5000").rowId, receiptNo: "5000", date: recent(1), studentId: "S001", amountGhs: "100", method: "cash" },
          { rowId: row("6004").rowId, receiptNo: "6004", date: recent(1), studentId: "S001", amountGhs: "200", method: "cash" },
        ],
      },
      ctx,
    );
    expect(res.added.sort()).toEqual(["6001", "6004"]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0]!.message).toMatch(/already recorded/);
    const [r] = await getDb().select().from(schema.receipts).where(eq(schema.receipts.receiptNo, "6001"));
    expect(r).toMatchObject({ source: "photo", amountPesewas: 30000, studentId: "S001" });

    const after = await getCapture.run({ batchId: capture!.batchId }, ctx);
    expect(after.capture!.status).toBe("ready"); // two rows still open
    expect(after.capture!.rows.filter((x) => x.added).map((x) => x.receiptNo).sort()).toEqual(["6001", "6004"]);
  });
});

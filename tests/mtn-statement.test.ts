import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDbExec } from "@agent-native/core/db";
import { beforeAll, describe, expect, it } from "vitest";

import importStatement from "../actions/import-statement";
import updateSchool from "../actions/update-school-settings";
import { ImportError, isMtnLayout, parseMtnDateTime, parseMtnMomoCsv, parseStudentsCsv } from "../server/lib/importers";
import { parseCsvRecords } from "../server/lib/csv";
import { momoEvidence } from "../server/lib/matching";
import { ghsToPesewas } from "../server/lib/money";
import { findPhoneIn, normalisePhone, samePhone } from "../server/lib/phone";
import { FEEDESK_MIGRATIONS } from "../server/plugins/db";

const csv = readFileSync(join(__dirname, "fixtures", "mtn-momo-statement.csv"), "utf8");
const ctx = { userEmail: "bursar@example.test" } as never;

describe("1. phone numbers become 0XXXXXXXXX everywhere", () => {
  it("normalises every common way of writing a Ghana number", () => {
    for (const raw of ["233244123456", "+233 24 412 3456", "00233244123456", "244123456", "024-412-3456", "0244123456"]) {
      expect(normalisePhone(raw)).toBe("0244123456");
    }
    expect(normalisePhone("")).toBe("");
    expect(normalisePhone("12345")).toBe("12345"); // not a Ghana number: left as digits, not invented
  });

  it("finds a phone written inside a REF and compares phones in any format", () => {
    expect(findPhoneIn("PAYMENT FROM ABENA DARKO 0244123999 SCH FEES")).toBe("0244123999");
    expect(findPhoneIn("from 233 50 123 4567 fees")).toBe("0501234567");
    expect(findPhoneIn("Ama fees JHS1")).toBeNull();
    expect(samePhone("233244123456", "0244123456")).toBe(true);
    expect(samePhone("", "")).toBe(false);
  });

  it("the fee list import stores parent phones as 0XXXXXXXXX", () => {
    const [s] = parseStudentsCsv("student_id,full_name,class,term_fee_ghs,parent_name,parent_phone\nS1,Ama Mensah,JHS 1,900,Kofi Mensah,233244417001\n");
    expect(s!.parentPhone).toBe("0244417001");
  });

  it("matching links a payment to the parent whatever format either side was stored in", () => {
    const student = { id: "S1", name: "Ama Mensah", className: "JHS 1", parentName: "Kofi Mensah", parentPhone: "233244417001" };
    const receipt = { id: "r", receiptNo: "1", date: "2026-11-02", studentId: "S1", amountPesewas: 45000, method: "momo" as const, status: "unchecked" };
    const line = { id: "l", source: "momo" as const, date: "2026-11-02", payerName: "SOMEONE ELSE", payerPhone: "0244417001", amountPesewas: 45000, txnId: "t", reference: null };
    expect(momoEvidence(receipt, student, line)?.phone).toBe(true);
  });
});

describe("2. MTN MoMo statement layout", () => {
  it("is recognised by its columns", () => {
    expect(isMtnLayout(parseCsvRecords(csv).header)).toBe(true);
  });

  it("reads MTN dates, including 12 AM and 12 PM", () => {
    expect(parseMtnDateTime("06-Nov-2026 11:00:13 PM")).toEqual({ date: "2026-11-06", time: "23:00:13" });
    expect(parseMtnDateTime("02-Nov-2026 12:05:00 AM")).toEqual({ date: "2026-11-02", time: "00:05:00" });
    expect(parseMtnDateTime("02-Nov-2026 12:30:00 PM")).toEqual({ date: "2026-11-02", time: "12:30:00" });
    expect(() => parseMtnDateTime("31-Feb-2026 10:00:00 AM")).toThrow();
  });

  it("reads amounts with no fixed decimals, but never rounds a real third decimal", () => {
    expect(ghsToPesewas("450")).toBe(45000);
    expect(ghsToPesewas("450.5")).toBe(45050);
    expect(ghsToPesewas("1200.000")).toBe(120000);
    expect(() => ghsToPesewas("450.505")).toThrow();
  });

  it("keeps only money in to the school's number, uses F_ID, and finds the real sender in REF", () => {
    const { rows, skipped } = parseMtnMomoCsv(csv, "0559000111");
    expect(skipped).toEqual({ outgoing: 2, notToSchool: 1 });
    expect(rows.map((r) => [r.txnId, r.date, r.time, r.amountPesewas, r.payerPhone])).toEqual([
      ["63100000001", "2026-11-02", "08:14:52", 45000, "0244417001"],
      ["63100000002", "2026-11-02", "00:05:00", 45050, "0245550002"],
      ["63100000004", "2026-11-03", "14:47:10", 120000, "0244123999"], // GCB transfer: sender's phone from REF
      ["63100000005", "2026-11-04", "21:02:33", 30000, "0501234567"], // Telecel cross-network: from REF
      ["63100000008", "2026-11-06", "23:00:13", 62050, "0277654321"],
    ]);
    expect(rows[2]!.reference).toBe("PAYMENT FROM ABENA DARKO 0244123999 SCH FEES");
  });

  it("asks for the school's number when it isn't set, and suggests the likely one", () => {
    expect(() => parseMtnMomoCsv(csv, "")).toThrow(ImportError);
    expect(() => parseMtnMomoCsv(csv, "")).toThrow(/0559000111 \(5 rows\)/);
    expect(() => parseMtnMomoCsv(csv, "0244000000")).toThrow(/no row in this statement pays the school's number 0244000000/);
  });

  it("a payer named only in REF still counts as the parent", () => {
    const student = { id: "S2", name: "Esi Darko", className: "Basic 2", parentName: "Abena Darko", parentPhone: "0200000001" };
    const receipt = { id: "r", receiptNo: "2", date: "2026-11-03", studentId: "S2", amountPesewas: 120000, method: "momo" as const, status: "unchecked" };
    const line = { id: "l", source: "momo" as const, date: "2026-11-03", payerName: "GCB BANK PLC", payerPhone: "0244123999", amountPesewas: 120000, txnId: "t", reference: "PAYMENT FROM ABENA DARKO 0244123999 SCH FEES" };
    const e = momoEvidence(receipt, student, line);
    expect(e?.name).toBe(true);
    expect(e!.score).toBeGreaterThanOrEqual(0.8);
  });
});

describe("through the real actions", () => {
  beforeAll(async () => {
    for (const m of FEEDESK_MIGRATIONS) for (const stmt of m.sql.split(/;\s*\n/)) await getDbExec().execute(stmt);
  });

  it("imports the MTN file once the school's number is in School settings, and not twice", async () => {
    await expect(importStatement.run({ source: "momo", csv }, ctx)).rejects.toThrow(/School settings/);
    const saved = await updateSchool.run({ momoNumber: "233 55 900 0111" }, ctx);
    expect(saved.momoNumber).toBe("0559000111");
    const first = await importStatement.run({ source: "momo", csv }, ctx);
    expect(first).toMatchObject({ layout: "mtn", added: 5, ignored: 3, skipped: 0 });
    const again = await importStatement.run({ source: "momo", csv }, ctx);
    expect(again).toMatchObject({ added: 0, skipped: 5 });
  });

  it("refuses a school number that isn't a Ghana mobile", async () => {
    await expect(updateSchool.run({ momoNumber: "12345" }, ctx)).rejects.toThrow(/isn't a Ghana mobile number/);
  });
});

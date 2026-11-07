/** The no-AI check gives exactly the same result as the agent passing suggestions through. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDbExec } from "@agent-native/core/db";
import { beforeAll, expect, it } from "vitest";

import runCheck from "../actions/run-check";
import { parseBankCsv, parseMomoCsv, parseReceiptsCsv, parseStudentsCsv } from "../server/lib/importers";
import { addReceipts, insertMoneyLines, upsertStudents } from "../server/lib/ledger";
import { FEEDESK_MIGRATIONS } from "../server/plugins/db";

const seed = (f: string) => readFileSync(join(__dirname, "..", "seed", f), "utf8");
const who = "bursar@example.test";

beforeAll(async () => {
  for (const m of FEEDESK_MIGRATIONS) for (const stmt of m.sql.split(/;\s*\n/)) await getDbExec().execute(stmt);
  await upsertStudents(parseStudentsCsv(seed("students.csv")), who);
  await addReceipts(parseReceiptsCsv(seed("receipts.csv")), "upload", who, { today: "2026-11-04" });
  await addReceipts(parseReceiptsCsv(seed("photo-page-receipts.csv")), "photo", who, { today: "2026-11-04" });
  await insertMoneyLines(parseMomoCsv(seed("momo-merchant-statement.csv")), who);
  await insertMoneyLines(parseBankCsv(seed("bank-statement.csv")), who);
});

it("run-check reaches the same mid-check state in one call, and a second run changes nothing", async () => {
  const first = await runCheck.run({}, { userEmail: who } as never);
  expect(first.headline).toBe("108 of 119 receipts verified · 11 flagged · 17 students owing");
  expect(first.openFlagsByKind).toEqual({ amount_diff: 4, duplicate: 2, no_money: 3, no_receipt: 3 });
  expect(first.notSaved).toEqual([]);

  const again = await runCheck.run({}, { userEmail: who } as never);
  expect(again.pages).toBe(0);
  expect(again.headline).toBe(first.headline);
});

it("refuses callers who are not signed in", async () => {
  await expect(runCheck.run({}, undefined)).rejects.toThrow(/Sign in/);
});

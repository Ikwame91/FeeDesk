/**
 * Resets FeeDesk to a clean demo state from seed/ (fictional data):
 *
 *   pnpm demo:load
 *   AGENT_USER_EMAIL=you@example.com pnpm demo:load   (hosted database: load as your account)
 *
 * CLI only (no HTTP, hidden from the agent). Clears the five FeeDesk tables, then loads
 * students, receipts and both statements through the same parsers and writes the
 * import actions use. Prints the row counts at the end.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { parseBankCsv, parseMomoCsv, parseReceiptsCsv, parseStudentsCsv } from "../server/lib/importers.js";
import { addReceipts, countLedger, insertMoneyLines, upsertStudents } from "../server/lib/ledger.js";

const EXPECTED = { students: 45, receipts: 113, momoLines: 103, bankLines: 7 };

export default defineAction({
  description: "Developer CLI: wipe FeeDesk's tables and load the fictional demo data from seed/.",
  schema: z.object({}),
  outputSchema: z.object({
    counts: z.object({ students: z.number(), receipts: z.number(), momoLines: z.number(), bankLines: z.number() }),
    message: z.string(),
  }),
  http: false,
  agentTool: false,
  run: async (_args, ctx) => {
    // Rows belong to whoever runs the loader (AGENT_USER_EMAIL or the signed-in CLI
    // session); locally that is the auto dev account the app signs you in as.
    const owner = ctx?.userEmail ?? "dev@local.test";
    const seed = (name: string) => readFile(join(process.cwd(), "seed", name), "utf8");

    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.delete(schema.flags);
      await tx.delete(schema.matches);
      await tx.delete(schema.receipts);
      await tx.delete(schema.moneyLines);
      await tx.delete(schema.students);
    });

    await upsertStudents(parseStudentsCsv(await seed("students.csv")), owner);
    await addReceipts(parseReceiptsCsv(await seed("receipts.csv")), "upload", owner);
    await insertMoneyLines(parseMomoCsv(await seed("momo-merchant-statement.csv")), owner);
    await insertMoneyLines(parseBankCsv(await seed("bank-statement.csv")), owner);

    const counts = await countLedger();
    const wrong = (Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]).filter((k) => counts[k] !== EXPECTED[k]);
    const table =
      `  students     ${counts.students}\n  receipts     ${counts.receipts}\n` +
      `  MoMo lines   ${counts.momoLines}\n  bank lines   ${counts.bankLines}`;
    if (wrong.length) fail(`Demo data loaded but counts are off (${wrong.join(", ")}):\n${table}`);
    console.log(`Demo data loaded (owner ${owner}):\n${table}`);
    return {
      counts,
      message:
        `Demo data loaded: ${counts.students} students, ${counts.receipts} receipts, ` +
        `${counts.momoLines} MoMo lines, ${counts.bankLines} bank lines. ` +
        "(The 6 photo-page receipts are left out on purpose.)",
    };
  },
});

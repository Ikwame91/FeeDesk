import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { explainReceipts, suggestNextPage } from "../server/lib/matching.js";
import { normaliseReceiptNo } from "../server/lib/receipt-rules.js";
import { loadLedger } from "../server/lib/reconcile.js";

const proposedMatch = z.object({
  receiptNos: z.array(z.string()),
  moneyRef: z.string(),
  confidence: z.number(),
  reason: z.string(),
});
const proposedFlag = z.object({
  kind: z.enum(["no_money", "no_receipt", "duplicate"]),
  receiptNo: z.string().optional(),
  moneyRef: z.string().optional(),
  note: z.string(),
});

export default defineAction({
  description:
    "Matching evidence. Without receiptNos: the next page of unchecked receipts with suggested matches (toRecord → pass to record-match) and suggested flags (toFlag → pass to raise-flag); call again until done is true. With receiptNos: ranked candidate money lines and evidence for those receipts, to explain or re-check them.",
  schema: z.object({
    receiptNos: z.array(z.string()).max(20).optional().describe("Specific receipt numbers to explain. Omit to get the next page of the check"),
    limit: z.coerce.number().int().min(5).max(50).default(40).describe("Receipts per page; defaults to 40"),
  }),
  outputSchema: z.object({
    toRecord: z.array(proposedMatch).describe("Suggested matches: review, then pass to record-match"),
    toFlag: z.array(proposedFlag).describe("Suggested flags: review, then pass to raise-flag"),
    receiptsInPage: z.number(),
    remainingAfterPage: z.number().describe("Unchecked receipts not in this page"),
    done: z.boolean().describe("True when every receipt and money line has been handled"),
    explained: z.array(z.any()).describe("Evidence for the requested receiptNos"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ receiptNos, limit }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in to check receipts.", { errorCode: "not_signed_in", statusCode: 401 });
    const ledger = await loadLedger();
    if (receiptNos?.length) {
      return {
        toRecord: [],
        toFlag: [],
        receiptsInPage: 0,
        remainingAfterPage: ledger.receipts.filter((r) => r.status === "unchecked").length,
        done: false,
        explained: explainReceipts(ledger, receiptNos.map(normaliseReceiptNo)),
      };
    }
    return { ...suggestNextPage(ledger, limit), explained: [] };
  },
});

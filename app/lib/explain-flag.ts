/**
 * Plain-language wording for a flag card: a title, what the uploads show, and what to do.
 * Kept separate from the card's styling so the words can be tested and reused
 * (e.g. by the photo screen or a future email summary).
 *
 * The words stay inside the uploaded receipts and statements. They do not say
 * money is missing, or that it arrived, beyond what those files show.
 */

export interface ExplainReceipt {
  receiptNo: string;
  date: string;
  studentName: string;
  className: string;
  amountGhs: string;
  method: string;
}

export interface ExplainFlagInput {
  kind: string;
  note: string;
  receipt: ExplainReceipt | null;
  moneyLine: { source: string; date: string; payerName: string | null; amountGhs: string } | null;
  proposedMatch: { receipts: (ExplainReceipt | null)[] } | null;
  likelyStudent: { name: string; className: string } | null;
}

export type FlagTone = "amber" | "red" | "blue";

export interface FlagExplanation {
  title: string;
  happened: string;
  todo: string;
  tone: FlagTone;
}

export const ghsText = (amount: string) =>
  `GHS ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dayText = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const statementName = (source: string) => (source === "momo" ? "MoMo statement" : "bank statement");

export function explainFlag(f: ExplainFlagInput): FlagExplanation {
  const r = f.receipt;
  const m = f.moneyLine;
  const payer = m?.payerName ? titleCase(m.payerName) : "the parent";

  if (f.kind === "amount_diff" && r && m) {
    return {
      tone: "amber",
      title: "The amounts don't agree",
      happened: `Receipt ${r.receiptNo} says ${ghsText(r.amountGhs)}. The uploaded ${statementName(m.source)} shows ${ghsText(m.amountGhs)} from ${payer} on ${dayText(m.date)}.`,
      todo: `If the receipt should match the statement, fix it to ${ghsText(m.amountGhs)}. Otherwise mark it as a problem.`,
    };
  }

  if (f.kind === "duplicate" && r) {
    const original = /receipt (\d+)/i.exec(f.note)?.[1];
    return {
      tone: "amber",
      title: "Two receipts match one statement line",
      happened: `Receipt ${r.receiptNo} (${r.studentName}, ${ghsText(r.amountGhs)}) matches the same uploaded MoMo payment as ${original ? `receipt ${original}` : "another receipt"}.`,
      todo: "If it is a second receipt for that payment, void the extra one so it is only counted once.",
    };
  }

  if (f.kind === "no_money" && f.proposedMatch && m) {
    const rs = f.proposedMatch.receipts.filter((x): x is ExplainReceipt => !!x);
    const day = rs[0] ? dayText(rs[0].date) : "that day";
    const which = rs.length === 1 ? "This cash receipt" : `These ${rs.length} cash receipts`;
    return {
      tone: "red",
      title: "No deposit on the receipt day",
      happened: `${which} from ${day} ${rs.length === 1 ? "has" : "have"} no matching bank deposit that day in the uploaded statements. A deposit of ${ghsText(m.amountGhs)} on ${dayText(m.date)} equals ${rs.length === 1 ? "it" : "them"} exactly.`,
      todo: "If they were banked together on that day, confirm the deposit. If not, mark it as a problem.",
    };
  }

  if (f.kind === "no_money" && r) {
    return r.method === "cash"
      ? {
          tone: "red",
          title: "No matching bank deposit",
          happened: `Receipt ${r.receiptNo} is ${ghsText(r.amountGhs)} cash from ${r.studentName} on ${dayText(r.date)}. No matching bank deposit found in the uploaded statements.`,
          todo: "If it was banked separately, tell the agent which deposit. Otherwise mark it as a problem.",
        }
      : {
          tone: "red",
          title: "No matching MoMo payment",
          happened: `Receipt ${r.receiptNo} says ${r.studentName}'s parent paid ${ghsText(r.amountGhs)} by MoMo on ${dayText(r.date)}. No matching payment found in the uploaded statements.`,
          todo: "Check the uploaded MoMo statement, or ask the parent. If it still doesn't match, mark it as a problem.",
        };
  }

  if (f.kind === "no_receipt" && m) {
    const who = f.likelyStudent ? ` — the parent of ${f.likelyStudent.name} (${f.likelyStudent.className})` : "";
    return {
      tone: "blue",
      title: "No matching receipt found",
      happened: `The uploaded ${statementName(m.source)} shows ${ghsText(m.amountGhs)} on ${dayText(m.date)} from ${payer}${who}. No matching receipt found.`,
      todo: "If you have the receipt number, add it. Otherwise mark it as a problem.",
    };
  }

  return { tone: "amber", title: "Needs a look", happened: f.note, todo: "Ask the agent about this one, or mark it as a problem." };
}

/** The words for each decision, shared by the Overview list and the review page so they always agree. */
export const ACTION = {
  fixTo: (amountGhs: string) => `Fix to ${ghsText(amountGhs)}`,
  voidDuplicate: "Void the extra receipt",
  confirmDeposit: "Confirm the deposit",
  bankedSeparately: "It was banked separately…",
  writeReceipt: "Write the receipt",
  realProblem: "Mark as a real problem",
} as const;

/** The short tag beside a flag's receipt number. */
export function flagTag(f: ExplainFlagInput): string {
  if (f.kind === "amount_diff") return "Amount differs";
  if (f.kind === "duplicate") return "Possible duplicate";
  if (f.kind === "no_receipt") return "No matching receipt";
  if (f.kind === "no_money" && f.proposedMatch) return "Deposit on another day";
  if (f.kind === "no_money" && f.receipt?.method === "momo") return "No matching payment";
  return "No matching deposit";
}

/** One line and an action word, for the Overview queue and the review page. */
export function flagLine(f: ExplainFlagInput): { ref: string; line: string; action: string; missingMoney: boolean } {
  const r = f.receipt;
  const m = f.moneyLine;
  const payer = m?.payerName ? titleCase(m.payerName) : "the parent";
  if (f.kind === "amount_diff" && r && m) {
    return {
      ref: r.receiptNo,
      line: `${r.studentName}'s receipt says ${ghsText(r.amountGhs)}; the uploaded statement shows ${ghsText(m.amountGhs)} from ${payer}, ${dayText(m.date)}.`,
      action: ACTION.fixTo(m.amountGhs),
      missingMoney: false,
    };
  }
  if (f.kind === "duplicate" && r) {
    return {
      ref: r.receiptNo,
      line: `${r.studentName}: receipt ${r.receiptNo} matches the same uploaded payment as another receipt.`,
      action: ACTION.voidDuplicate,
      missingMoney: false,
    };
  }
  if (f.kind === "no_money" && f.proposedMatch && m) {
    const rs = f.proposedMatch.receipts.filter((x): x is ExplainReceipt => !!x);
    const nos = rs.map((x) => x.receiptNo);
    return {
      ref: nos.length > 1 ? `${nos[0]}–${nos[nos.length - 1]!.slice(-2)}` : (nos[0] ?? ""),
      line: `${rs.length} cash receipts from ${rs[0] ? dayText(rs[0].date) : "one day"} have no deposit that day. The uploaded statements include a ${ghsText(m.amountGhs)} deposit on ${dayText(m.date)}.`,
      action: ACTION.confirmDeposit,
      missingMoney: false,
    };
  }
  if (f.kind === "no_money" && r) {
    return {
      ref: r.receiptNo,
      line:
        r.method === "cash"
          ? `${ghsText(r.amountGhs)} cash from ${r.studentName}, ${dayText(r.date)}. No matching bank deposit found in the uploaded statements.`
          : `${ghsText(r.amountGhs)} MoMo for ${r.studentName}, ${dayText(r.date)}. No matching payment found in the uploaded statements.`,
      action: ACTION.realProblem,
      missingMoney: true,
    };
  }
  if (f.kind === "no_receipt" && m) {
    return {
      ref: "—",
      line: `${ghsText(m.amountGhs)} from ${payer}, ${dayText(m.date)}, in the uploaded statements. No matching receipt found.`,
      action: ACTION.writeReceipt,
      missingMoney: false,
    };
  }
  return { ref: r?.receiptNo ?? "—", line: f.note, action: "Review", missingMoney: false };
}

/**
 * The same sentence on Overview and Flags: receipt cards, then payments with no receipt.
 * A grouped cash flag counts as one card and names how many receipts it covers.
 */
export function reviewBreakdown(flags: ExplainFlagInput[]): string {
  const payments = flags.filter((f) => f.kind === "no_receipt").length;
  const aboutReceipts = flags.length - payments;
  const receiptCount = flags
    .filter((f) => f.kind !== "no_receipt")
    .reduce((total, f) => total + (f.proposedMatch?.receipts.filter(Boolean).length || (f.receipt ? 1 : 0)), 0);
  const parts: string[] = [];
  if (aboutReceipts) parts.push(`${aboutReceipts} about receipts${receiptCount !== aboutReceipts ? ` (${receiptCount} receipts)` : ""}`);
  if (payments) parts.push(`${payments} payment${payments === 1 ? "" : "s"} with no receipt`);
  return parts.join(" · ");
}

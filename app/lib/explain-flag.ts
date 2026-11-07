/**
 * Plain-language wording for a flag card: a title, what happened, and what to do.
 * Kept separate from the card's styling so the words can be tested and reused
 * (e.g. by the photo screen or a future email summary).
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

export function explainFlag(f: ExplainFlagInput): FlagExplanation {
  const r = f.receipt;
  const m = f.moneyLine;
  const payer = m?.payerName ? titleCase(m.payerName) : "the parent";

  if (f.kind === "amount_diff" && r && m) {
    return {
      tone: "amber",
      title: "The amounts don't agree",
      happened: `Receipt ${r.receiptNo} says ${ghsText(r.amountGhs)}, but ${payer} sent ${ghsText(m.amountGhs)} by MoMo on ${dayText(m.date)}.`,
      todo: `If the receipt was written wrong, fix it to ${ghsText(m.amountGhs)} — the money is what actually arrived. Otherwise mark it as a problem.`,
    };
  }

  if (f.kind === "duplicate" && r) {
    const original = /receipt (\d+)/i.exec(f.note)?.[1];
    return {
      tone: "amber",
      title: "Same payment, two receipts",
      happened: `Receipt ${r.receiptNo} (${r.studentName}, ${ghsText(r.amountGhs)}) looks like a second receipt for a MoMo payment that ${original ? `receipt ${original}` : "another receipt"} already covers.`,
      todo: "Void the extra receipt so the payment is only counted once.",
    };
  }

  if (f.kind === "no_money" && f.proposedMatch && m) {
    const rs = f.proposedMatch.receipts.filter((x): x is ExplainReceipt => !!x);
    const day = rs[0] ? dayText(rs[0].date) : "that day";
    return {
      tone: "red",
      title: "Cash banked on a later day?",
      happened: `${rs.length === 1 ? "This cash receipt" : `These ${rs.length} cash receipts`} from ${day} had no bank deposit that day. A deposit of ${ghsText(m.amountGhs)} on ${dayText(m.date)} equals ${rs.length === 1 ? "it" : "them"} exactly.`,
      todo: "If they were banked together on that day, confirm the deposit. If not, mark it as a problem.",
    };
  }

  if (f.kind === "no_money" && r) {
    return r.method === "cash"
      ? {
          tone: "red",
          title: "Cash that never reached the bank",
          happened: `Receipt ${r.receiptNo} is ${ghsText(r.amountGhs)} cash from ${r.studentName} on ${dayText(r.date)}, but no bank deposit includes it.`,
          todo: "If it was banked separately, tell the agent which deposit. If not, this money is missing — mark it as a problem.",
        }
      : {
          tone: "red",
          title: "No MoMo payment behind this receipt",
          happened: `Receipt ${r.receiptNo} says ${r.studentName}'s parent paid ${ghsText(r.amountGhs)} by MoMo on ${dayText(r.date)}, but no such payment arrived.`,
          todo: "Check the MoMo statement or ask the parent. If the money never came, mark it as a problem.",
        };
  }

  if (f.kind === "no_receipt" && m) {
    const who = f.likelyStudent ? ` — the parent of ${f.likelyStudent.name} (${f.likelyStudent.className})` : "";
    return {
      tone: "blue",
      title: "Money with no receipt",
      happened: `${ghsText(m.amountGhs)} arrived ${m.source === "momo" ? "by MoMo" : "in the bank"} on ${dayText(m.date)} from ${payer}${who}, but no receipt was written for it.`,
      todo: "Write the receipt now: type its number and add it.",
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
  if (f.kind === "duplicate") return "Duplicate";
  if (f.kind === "no_receipt") return "No receipt";
  if (f.kind === "no_money" && f.proposedMatch) return "Banked later?";
  return "Money missing";
}

/** One line and an action word, for short lists such as the Overview's "need you" queue. */
export function flagLine(f: ExplainFlagInput): { ref: string; line: string; action: string; missingMoney: boolean } {
  const r = f.receipt;
  const m = f.moneyLine;
  const payer = m?.payerName ? titleCase(m.payerName) : "the parent";
  if (f.kind === "amount_diff" && r && m) {
    return {
      ref: r.receiptNo,
      line: `${r.studentName}'s receipt says ${ghsText(r.amountGhs)}; ${payer} sent ${ghsText(m.amountGhs)}, ${dayText(m.date)}.`,
      action: ACTION.fixTo(m.amountGhs),
      missingMoney: false,
    };
  }
  if (f.kind === "duplicate" && r) {
    return { ref: r.receiptNo, line: `${r.studentName}: a second receipt for one ${ghsText(r.amountGhs)} payment.`, action: ACTION.voidDuplicate, missingMoney: false };
  }
  if (f.kind === "no_money" && f.proposedMatch && m) {
    const rs = f.proposedMatch.receipts.filter((x): x is ExplainReceipt => !!x);
    const nos = rs.map((x) => x.receiptNo);
    return {
      ref: nos.length > 1 ? `${nos[0]}–${nos[nos.length - 1]!.slice(-2)}` : (nos[0] ?? ""),
      line: `${rs.length} cash receipts from ${rs[0] ? dayText(rs[0].date) : "one day"} match a ${ghsText(m.amountGhs)} deposit on ${dayText(m.date)}.`,
      action: ACTION.confirmDeposit,
      missingMoney: false,
    };
  }
  if (f.kind === "no_money" && r) {
    return {
      ref: r.receiptNo,
      line:
        r.method === "cash"
          ? `${ghsText(r.amountGhs)} cash from ${r.studentName}, ${dayText(r.date)}, never reached the bank.`
          : `${ghsText(r.amountGhs)} MoMo for ${r.studentName}, ${dayText(r.date)}: no payment arrived.`,
      action: ACTION.realProblem,
      missingMoney: true,
    };
  }
  if (f.kind === "no_receipt" && m) {
    return { ref: "—", line: `${ghsText(m.amountGhs)} from ${payer}, ${dayText(m.date)}, arrived with no receipt.`, action: ACTION.writeReceipt, missingMoney: false };
  }
  return { ref: r?.receiptNo ?? "—", line: f.note, action: "Review", missingMoney: false };
}

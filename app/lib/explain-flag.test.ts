import { describe, expect, it } from "vitest";

import { decisionDay, decisionWords, explainFlag, flagTag, keptAsProblems } from "./explain-flag";

const receipt = (over: Partial<{ receiptNo: string; date: string; studentName: string; amountGhs: string; method: string }> = {}) => ({
  receiptNo: "1082",
  date: "2026-10-14",
  studentName: "Efua Amegah",
  className: "Basic 3",
  amountGhs: "450.00",
  method: "momo",
  ...over,
});
const base = { note: "", receipt: null, moneyLine: null, proposedMatch: null, likelyStudent: null };

describe("explainFlag stays inside the uploaded records", () => {
  it("amount differs", () => {
    const input = {
      ...base,
      kind: "amount_diff",
      receipt: receipt(),
      moneyLine: { source: "momo", date: "2026-10-14", payerName: "KOFI OPOKU", amountGhs: "400.00" },
    };
    const e = explainFlag(input);
    expect(e.title).toBe("The amounts don't agree");
    expect(e.happened).toBe("Receipt 1082 says GHS 450.00. The uploaded MoMo statement shows GHS 400.00 from Kofi Opoku on Wed 14 Oct.");
    expect(e.todo).toMatch(/fix it to GHS 400.00/);
    expect(e.todo).not.toMatch(/actually arrived/);
    expect(flagTag(input)).toBe("Amount differs");
  });

  it("cash on another day names both days and never shows confidence or refs", () => {
    const rs = ["1070", "1071", "1072"].map((n) => receipt({ receiptNo: n, date: "2026-10-09", method: "cash" }));
    const input = {
      ...base,
      kind: "no_money",
      note: "Possible match at 70% confidence needs a person to confirm. bank:DEP20261012",
      receipt: rs[0]!,
      moneyLine: { source: "bank", date: "2026-10-12", payerName: null, amountGhs: "890.00" },
      proposedMatch: { receipts: rs },
    };
    const e = explainFlag(input);
    expect(e.title).toBe("No deposit on the receipt day");
    expect(e.happened).toBe(
      "These 3 cash receipts from Fri 9 Oct have no matching bank deposit that day in the uploaded statements. A deposit of GHS 890.00 on Mon 12 Oct equals them exactly.",
    );
    expect(`${e.title} ${e.happened} ${e.todo}`).not.toMatch(/%|bank:|momo:/);
    expect(flagTag(input)).toBe("Deposit on another day");
  });

  it("duplicate names the other receipt without calling the money missing", () => {
    const input = { ...base, kind: "duplicate", note: "receipt 1022 (Mon 7 Sept) already covers MoMo 123", receipt: receipt({ receiptNo: "1023" }) };
    const e = explainFlag(input);
    expect(e.happened).toMatch(/receipt 1022/);
    expect(e.happened).not.toMatch(/missing|never reached|arrived/);
    expect(flagTag(input)).toBe("Possible duplicate");
  });

  it("a statement line with no receipt does not say the money arrived", () => {
    const input = {
      ...base,
      kind: "no_receipt",
      moneyLine: { source: "momo", date: "2026-09-15", payerName: "AKOSUA ADDO", amountGhs: "470.00" },
      likelyStudent: { name: "Yaw Addo", className: "JHS 2" },
    };
    const e = explainFlag(input);
    expect(e.title).toBe("No matching receipt found");
    expect(e.happened).toBe(
      "The uploaded MoMo statement shows GHS 470.00 on Tue 15 Sept from Akosua Addo — the parent of Yaw Addo (JHS 2). No matching receipt found.",
    );
    expect(`${e.title} ${e.happened} ${e.todo}`).not.toMatch(/arrived|was written|missing/);
    expect(flagTag(input)).toBe("No matching receipt");
  });

  it("cash with no deposit stays inside the uploaded statements", () => {
    const input = {
      ...base,
      kind: "no_money",
      receipt: receipt({ method: "cash", date: "2026-09-17", receiptNo: "1019", studentName: "Edem Kpodo", amountGhs: "250.00" }),
    };
    const e = explainFlag(input);
    expect(e.title).toBe("No matching bank deposit");
    expect(e.happened).toContain("No matching bank deposit found in the uploaded statements");
    expect(`${e.title} ${e.happened} ${e.todo}`).not.toMatch(/never reached|money is missing|missing/);
    expect(flagTag(input)).toBe("No matching deposit");
  });
});

describe("decided-item words", () => {
  it("names a person's decision and dates it DD/MM/YYYY", () => {
    expect(decisionWords("real_problem")).toBe("Kept as a problem");
    expect(decisionWords("fix_amount: corrected from 450.00 to 470.00")).toBe("Corrected the receipt to the statement amount");
    expect(decisionWords("auto: a receipt was found for this payment")).not.toBe("Kept as a problem");
    expect(decisionDay("2026-11-07T23:30:00.000Z")).toBe("07/11/2026");
    expect(keptAsProblems(2)).toBe("2 receipts are kept as problems");
    expect(keptAsProblems(1)).toBe("1 receipt is kept as a problem");
  });
});

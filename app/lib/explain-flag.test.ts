import { describe, expect, it } from "vitest";

import { explainFlag } from "./explain-flag";

const receipt = (over: Partial<{ receiptNo: string; date: string; amountGhs: string; method: string }> = {}) => ({
  receiptNo: "1082",
  date: "2026-10-14",
  studentName: "Efua Amegah",
  className: "Basic 3",
  amountGhs: "450.00",
  method: "momo",
  ...over,
});
const base = { note: "", receipt: null, moneyLine: null, proposedMatch: null, likelyStudent: null };

describe("explainFlag gives plain words, no jargon", () => {
  it("amount differs", () => {
    const e = explainFlag({
      ...base,
      kind: "amount_diff",
      receipt: receipt(),
      moneyLine: { source: "momo", date: "2026-10-14", payerName: "KOFI OPOKU", amountGhs: "400.00" },
    });
    expect(e.happened).toBe("Receipt 1082 says GHS 450.00, but Kofi Opoku sent GHS 400.00 by MoMo on Wed 14 Oct.");
    expect(e.todo).toMatch(/fix it to GHS 400.00/);
  });

  it("cash banked later names both days and never shows confidence or refs", () => {
    const rs = ["1070", "1071", "1072"].map((n) => receipt({ receiptNo: n, date: "2026-10-09", method: "cash" }));
    const e = explainFlag({
      ...base,
      kind: "no_money",
      note: "Possible match at 70% confidence needs a person to confirm. bank:DEP20261012",
      receipt: rs[0]!,
      moneyLine: { source: "bank", date: "2026-10-12", payerName: null, amountGhs: "890.00" },
      proposedMatch: { receipts: rs },
    });
    expect(e.happened).toBe("These 3 cash receipts from Fri 9 Oct had no bank deposit that day. A deposit of GHS 890.00 on Mon 12 Oct equals them exactly.");
    expect(`${e.title} ${e.happened} ${e.todo}`).not.toMatch(/%|bank:|momo:/);
  });

  it("duplicate picks up the original receipt number", () => {
    const e = explainFlag({ ...base, kind: "duplicate", note: "receipt 1022 (Mon 7 Sept) already covers MoMo 123", receipt: receipt({ receiptNo: "1023" }) });
    expect(e.happened).toMatch(/that receipt 1022 already covers/);
  });

  it("money with no receipt names the likely student", () => {
    const e = explainFlag({
      ...base,
      kind: "no_receipt",
      moneyLine: { source: "momo", date: "2026-09-15", payerName: "AKOSUA ADDO", amountGhs: "470.00" },
      likelyStudent: { name: "Yaw Addo", className: "JHS 2" },
    });
    expect(e.happened).toBe("GHS 470.00 arrived by MoMo on Tue 15 Sept from Akosua Addo — the parent of Yaw Addo (JHS 2), but no receipt was written for it.");
  });
});

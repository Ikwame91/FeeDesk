import { describe, expect, it } from "vitest";

import {
  checkReceiptAmount,
  checkReceiptDate,
  MAX_RECEIPT_PESEWAS,
  normaliseReceiptNo,
  ReceiptRuleError,
  sameClass,
} from "./receipt-rules";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ReceiptRuleError ? e.code : "other";
  }
  return "ok";
};

describe("1. amount cap", () => {
  it("allows up to GHS 100,000.00 and rejects anything above with bad_amount", () => {
    expect(checkReceiptAmount(MAX_RECEIPT_PESEWAS)).toBe(10_000_000);
    expect(code(() => checkReceiptAmount(MAX_RECEIPT_PESEWAS + 1))).toBe("bad_amount");
    expect(code(() => checkReceiptAmount(9_999_999_900))).toBe("bad_amount"); // GHS 99,999,999
    expect(code(() => checkReceiptAmount(0))).toBe("bad_amount");
  });

  it("gives a readable message", () => {
    expect(() => checkReceiptAmount(9_999_999_900)).toThrow(/99,999,999.00 is more than the GHS 100,000.00 limit/);
  });
});

describe("2. receipt number normalising", () => {
  it("trims spaces and strips leading zeros", () => {
    expect(normaliseReceiptNo("01120")).toBe("1120");
    expect(normaliseReceiptNo("  1120 ")).toBe("1120");
    expect(normaliseReceiptNo("0001120")).toBe("1120");
    expect(normaliseReceiptNo("0")).toBe("0");
    expect(normaliseReceiptNo("000")).toBe("0");
  });

  it("rejects an empty number", () => {
    expect(code(() => normaliseReceiptNo("   "))).toBe("bad_receipt_no");
  });
});

describe("3. receipt date window", () => {
  const today = "2026-11-04";
  it("accepts today and anything back to exactly one year ago", () => {
    expect(checkReceiptDate("2026-11-04", today)).toBe("2026-11-04");
    expect(checkReceiptDate("2025-11-04", today)).toBe("2025-11-04");
  });
  it("rejects tomorrow and more than a year ago", () => {
    expect(code(() => checkReceiptDate("2026-11-05", today))).toBe("bad_date");
    expect(code(() => checkReceiptDate("2025-11-03", today))).toBe("bad_date");
  });
  it("rejects impossible or badly formatted dates", () => {
    expect(code(() => checkReceiptDate("2026-02-30", today))).toBe("bad_date");
    expect(code(() => checkReceiptDate("02/11/26", today))).toBe("bad_date");
  });
});

describe("class comparison", () => {
  it("ignores case and spacing", () => {
    expect(sameClass("jhs1", "JHS 1")).toBe(true);
    expect(sameClass("Basic 4", "Basic 2")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { ghsToPesewas, pesewasToGhs } from "./money";

describe("ghsToPesewas", () => {
  it("converts 450.50 to exactly 45050 pesewas", () => {
    expect(ghsToPesewas("450.50")).toBe(45050);
    expect(ghsToPesewas(450.5)).toBe(45050);
    expect(Number.isInteger(ghsToPesewas("450.50"))).toBe(true);
  });

  it("handles commas, currency prefixes and one decimal", () => {
    expect(ghsToPesewas("1,200.00")).toBe(120000);
    expect(ghsToPesewas("GHS 450")).toBe(45000);
    expect(ghsToPesewas("₵250.5")).toBe(25050);
    expect(ghsToPesewas("0.10")).toBe(10);
  });

  it("avoids float rounding (0.29 * 100 = 28.999… in floats)", () => {
    expect(ghsToPesewas("0.29")).toBe(29);
    expect(ghsToPesewas("1.15")).toBe(115);
  });

  it("rejects negatives, 3+ decimals and junk", () => {
    expect(() => ghsToPesewas("-5")).toThrow();
    expect(() => ghsToPesewas("450.505")).toThrow();
    expect(() => ghsToPesewas("abc")).toThrow();
    expect(() => ghsToPesewas("")).toThrow();
  });

  it("round-trips through pesewasToGhs", () => {
    expect(pesewasToGhs(45050)).toBe("450.50");
    expect(pesewasToGhs(5)).toBe("0.05");
  });
});

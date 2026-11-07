/**
 * Money helpers. FeeDesk stores every amount as integer pesewas (1 GHS = 100 pesewas)
 * so sums are exact. Conversion is done on the digits, never with float maths.
 */

// Any number of decimals is read, but only up to 2 may be non-zero ("450.500" = 450.50; "450.505" is refused).
const GHS_PATTERN = /^(\d+)(?:\.(\d{1,2})0*)?$/;

/**
 * "450.50" → 45050. Accepts "1,200.00", "GHS 450", "₵450.5", 450.5.
 * Throws on negatives, more than 2 decimals, or anything that isn't a number.
 */
export function ghsToPesewas(value: string | number): number {
  let text = typeof value === "number" ? numberToText(value) : value;
  text = text.trim().replace(/^(GHS|GH₵|GHC|₵)\s*/i, "").replace(/,/g, "").trim();
  if (/^\d+\.$/.test(text)) text = text.slice(0, -1); // "450." from some exports
  const m = GHS_PATTERN.exec(text);
  if (!m) throw new Error(`"${value}" is not a GHS amount like 450.50`);
  const pesewas = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(pesewas)) throw new Error(`"${value}" is too large`);
  return pesewas;
}

function numberToText(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${n}" is not a GHS amount like 450.50`);
  // 450.5 → "450.5"; 0.1 + 0.2 style noise beyond 2 decimals is rejected by the pattern.
  return String(n);
}

/** 45050 → "450.50" */
export function pesewasToGhs(pesewas: number): string {
  const sign = pesewas < 0 ? "-" : "";
  const abs = Math.abs(pesewas);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Ghana phone numbers, one form everywhere: 0XXXXXXXXX (10 digits).
 *
 *   "233244123456", "+233 24 412 3456", "00233244123456", "244123456", "024-412-3456" → "0244123456"
 *
 * Used by every import (fee list, MoMo, bank) and by matching, so a parent's phone on the fee list
 * and the same phone on a MoMo statement always compare equal. Anything that isn't a recognisable
 * Ghana number is returned as its digits, unchanged, so nothing is silently invented.
 */
export function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00233")) d = d.slice(5);
  else if (d.startsWith("233") && d.length === 12) d = d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = `0${d}`;
  return d;
}

/** True for a 10-digit Ghana mobile number in normal form (0 + 2/5 prefix families). */
export function isGhanaMobile(phone: string): boolean {
  return /^0[25]\d{8}$/.test(phone);
}

/** The first Ghana mobile number written anywhere in free text (e.g. a MoMo REF), normalised. */
export function findPhoneIn(text: string | null | undefined): string | null {
  if (!text) return null;
  // Most specific first: "233…" / "+233…" / "00233…", then "0…". A bare 9-digit run is too
  // ambiguous inside free text (it can be the tail of another number), so it is not guessed.
  const patterns = [/(?:\+|00)?233[\s-]?[25]\d(?:[\s-]?\d){7}/g, /(?<!\d)0[25]\d(?:[\s-]?\d){7}(?!\d)/g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const p = normalisePhone(m[0]);
      if (isGhanaMobile(p)) return p;
    }
  }
  return null;
}

/** Compare two phones after normalising both; empty never matches. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalisePhone(a);
  return x !== "" && x === normalisePhone(b);
}

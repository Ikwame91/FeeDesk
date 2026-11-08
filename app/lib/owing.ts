import { ghsToPesewas, pesewasToGhs } from "../../server/lib/money";

export interface FeeStudent {
  id: string;
  name: string;
  className: string;
  termFeeGhs: string;
  paidGhs: string;
  balanceGhs: string;
}

/** Signed pesewas. ghsToPesewas refuses a leading minus, so the sign is applied here. */
function signedPesewas(amount: string): number {
  const text = amount.trim();
  const negative = text.startsWith("-");
  return (negative ? -1 : 1) * ghsToPesewas(negative ? text.slice(1) : text);
}

/** Students whose verified receipts do not cover the term fee, largest balance first. */
export function owingList(students: FeeStudent[]): { rows: FeeStudent[]; totalGhs: string } {
  const rows = students
    .filter((student) => signedPesewas(student.balanceGhs) > 0)
    .sort((a, b) => signedPesewas(b.balanceGhs) - signedPesewas(a.balanceGhs) || a.name.localeCompare(b.name));
  const total = rows.reduce((sum, student) => sum + signedPesewas(student.balanceGhs), 0);
  return { rows, totalGhs: pesewasToGhs(total) };
}

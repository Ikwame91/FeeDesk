/**
 * Generates FeeDesk's fictional demo data into seed/ and checks the planted cases.
 *
 *   pnpm demo:generate
 *
 * Everything here is invented: Adenta Hills Academy, every student, parent, phone
 * number and transaction. The output is deterministic (fixed random seed), so the
 * files only change when this script changes.
 *
 * The story the data tells (see docs/HANDOFF.md §10):
 *   - 119 receipts in the book, 6 of them on the demo photo page (left out of
 *     receipts.csv; the bursar photographs them live).
 *   - 96 clean MoMo receipts, 12 cash receipts covered by same-day bank deposits,
 *     3 Friday cash receipts banked together the next Monday.
 *   - 4 amount typos, 2 duplicate receipts, 2 receipts with no money behind them,
 *     3 MoMo payments with no receipt.
 *   - End state after the bursar resolves everything:
 *       118 of 120 receipts verified · 2 flagged · 12 students still owing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "seed");
const SCHOOL = "Adenta Hills Academy";

// ---------- deterministic random ----------
let rngState = 20261109;
function rand(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Demo data check failed: ${msg}`);
}

// ---------- money (integer pesewas) ----------
const ghs = (cedis: number) => Math.round(cedis * 100);
const fmt = (pesewas: number) => (pesewas / 100).toFixed(2);

// ---------- dates ----------
const TERM_START = new Date(Date.UTC(2026, 8, 7)); // Mon 7 Sep 2026
const TERM_LAST_PAYMENT = new Date(Date.UTC(2026, 9, 30)); // Fri 30 Oct 2026
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const isWeekday = (d: Date) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
const SCHOOL_DAYS: Date[] = [];
for (let d = TERM_START; d <= TERM_LAST_PAYMENT; d = addDays(d, 1)) {
  if (isWeekday(d)) SCHOOL_DAYS.push(d);
}
/** Special cases happen before this date so the newest receipts (the photo page) stay clean. */
const SPECIALS_BEFORE = "2026-10-19";

// ---------- students ----------
const CLASSES = [
  ["Basic 1", 850],
  ["Basic 2", 900],
  ["Basic 3", 950],
  ["Basic 4", 1000],
  ["Basic 5", 1050],
  ["Basic 6", 1100],
  ["JHS 1", 1250],
  ["JHS 2", 1300],
  ["JHS 3", 1400],
] as const;

const FIRST_NAMES = [
  "Ama", "Kofi", "Esi", "Yaw", "Abena", "Kwaku", "Akua", "Kwabena", "Adwoa", "Kwesi",
  "Efua", "Kojo", "Afia", "Ekow", "Adjoa", "Kwadwo", "Yaa", "Fiifi", "Araba", "Nana",
  "Daniel", "Grace", "Emmanuel", "Priscilla", "Samuel", "Gifty", "Michael", "Linda",
  "Joseph", "Mavis", "Isaac", "Comfort", "Richard", "Vida", "Prince", "Hannah",
  "Elikem", "Selorm", "Dzifa", "Naa", "Nii", "Edem", "Mawuli", "Akosua", "Kweku",
];
const SURNAMES = [
  "Mensah", "Owusu", "Boateng", "Asante", "Darko", "Agyeman", "Osei", "Appiah", "Addo",
  "Ofori", "Amoah", "Quaye", "Tetteh", "Lamptey", "Ansah", "Danso", "Frimpong", "Badu",
  "Opoku", "Sarpong", "Acheampong", "Gyamfi", "Kumi", "Adjei", "Antwi", "Bonsu",
  "Ocran", "Annan", "Amegah", "Kpodo", "Nartey", "Odoi", "Larbi", "Afful", "Essien",
];
const PARENT_FIRST = [
  "Kwame", "Akosua", "Yaw", "Felicia", "Kofi", "Patience", "Kwabena", "Esther", "Joseph",
  "Mercy", "Samuel", "Gladys", "Francis", "Beatrice", "George", "Rita", "Ebenezer",
  "Mabel", "Charles", "Doris", "Kwasi", "Rebecca", "Stephen", "Juliana", "Eric",
  "Agnes", "Peter", "Victoria", "Godfred", "Sandra",
];
const PHONE_PREFIXES = ["024", "054", "055", "059", "020", "050", "026", "027", "057"];

interface Student {
  id: string;
  name: string;
  className: string;
  termFee: number; // pesewas
  parentName: string;
  parentPhone: string;
}

const usedPhones = new Set<string>();
function newPhone(): string {
  for (;;) {
    const p = pick(PHONE_PREFIXES) + String(int(0, 9999999)).padStart(7, "0");
    if (!usedPhones.has(p)) {
      usedPhones.add(p);
      return p;
    }
  }
}

const usedNames = new Set<string>();
const students: Student[] = [];
for (const [className, fee] of CLASSES) {
  for (let i = 0; i < 5; i++) {
    let name: string;
    let surname: string;
    do {
      surname = pick(SURNAMES);
      name = `${pick(FIRST_NAMES)} ${surname}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    // Most parents share the child's surname; some (often mothers) don't.
    const parentSurname = rand() < 0.75 ? surname : pick(SURNAMES);
    students.push({
      id: `S${String(students.length + 1).padStart(3, "0")}`,
      name,
      className,
      termFee: ghs(fee),
      parentName: `${pick(PARENT_FIRST)} ${parentSurname}`,
      parentPhone: newPhone(),
    });
  }
}
assert(students.length === 45, "45 students");

// ---------- real payments (money that actually arrived) ----------
type Category =
  | "clean_momo"
  | "cash_same_day"
  | "cash_banked_monday"
  | "amount_typo"
  | "no_receipt";

interface Payment {
  id: number;
  studentId: string;
  amount: number; // pesewas, the true amount
  date: string;
  method: "momo" | "cash";
  category: Category;
}

const OWING_COUNT = 12; // includes the 2 "no money" students
const TOTAL_REAL_PAYMENTS = 118;

const order = shuffle(students.map((_, i) => i));
const owingIdx = new Set(order.slice(0, OWING_COUNT));
const noMoneyStudentIdx = order.slice(0, 2); // 2 of the owing students

// installment counts, adjusted until they total 118
const counts = students.map((_, i) => (owingIdx.has(i) ? int(1, 2) : int(2, 3)));
const bounds = (i: number) => (owingIdx.has(i) ? [1, 3] : [2, 4]);
while (counts.reduce((a, b) => a + b, 0) !== TOTAL_REAL_PAYMENTS) {
  const total = counts.reduce((a, b) => a + b, 0);
  const i = int(0, students.length - 1);
  const [lo, hi] = bounds(i);
  if (total < TOTAL_REAL_PAYMENTS && counts[i]! < hi!) counts[i]!++;
  if (total > TOTAL_REAL_PAYMENTS && counts[i]! > lo!) counts[i]!--;
}

/** Split `total` (pesewas, multiple of GHS 10) into k installments of at least GHS 100. */
function split(total: number, k: number): number[] {
  const units = total / ghs(10);
  const parts: number[] = [];
  let left = units;
  for (let j = k; j > 1; j--) {
    const max = left - 10 * (j - 1);
    const share = Math.max(10, Math.min(max, Math.round((left / j) * (0.6 + rand() * 0.8))));
    parts.push(share);
    left -= share;
  }
  parts.push(left);
  return parts.map((u) => u * ghs(10));
}

const payments: Payment[] = [];
const noMoneyAmounts = new Map<string, number>();
students.forEach((s, i) => {
  let paidTotal = s.termFee;
  if (owingIdx.has(i)) {
    const shortBy = ghs(int(2, 12) * 50);
    paidTotal = s.termFee - shortBy;
    if (noMoneyStudentIdx.includes(i)) noMoneyAmounts.set(s.id, shortBy);
  }
  const days = shuffle([...SCHOOL_DAYS]).slice(0, counts[i]).sort((a, b) => +a - +b);
  split(paidTotal, counts[i]!).forEach((amount, j) => {
    payments.push({
      id: payments.length,
      studentId: s.id,
      amount,
      date: iso(days[j]!),
      method: "momo",
      category: "clean_momo",
    });
  });
});
assert(payments.length === TOTAL_REAL_PAYMENTS, "118 real payments");

// ---------- plant the special cases ----------
const early = () =>
  shuffle(payments.filter((p) => p.category === "clean_momo" && p.date < SPECIALS_BEFORE));
const studentOf = (id: string) => students.find((s) => s.id === id)!;

// Cash days: same-day deposits, plus one Friday banked the next Monday.
const mondayFriday = new Date(Date.UTC(2026, 9, 9)); // Fri 9 Oct 2026
const mondayDeposit = addDays(mondayFriday, 3); // Mon 12 Oct 2026
const cashDayPool = SCHOOL_DAYS.filter(
  (d) =>
    iso(d) >= "2026-09-14" &&
    iso(d) < SPECIALS_BEFORE &&
    d.getUTCDay() !== 5 &&
    iso(d) !== iso(mondayDeposit),
);
const sameDayCashDays = shuffle([...cashDayPool]).slice(0, 6).sort((a, b) => +a - +b);
const SAME_DAY_GROUPS = [3, 2, 2, 2, 2, 1]; // 12 receipts
assert(
  !sameDayCashDays.some((d) => iso(d) === iso(mondayDeposit) || iso(d) === iso(mondayFriday)),
  "Friday/Monday cash group must not share days with other cash",
);

const takeEarly = (n: number, category: Category, method: Payment["method"], date?: string) => {
  const chosen = early().slice(0, n);
  assert(chosen.length === n, `enough payments for ${category}`);
  for (const p of chosen) {
    p.category = category;
    p.method = method;
    if (date) p.date = date;
  }
  return chosen;
};

sameDayCashDays.forEach((d, g) => takeEarly(SAME_DAY_GROUPS[g]!, "cash_same_day", "cash", iso(d)));
takeEarly(3, "cash_banked_monday", "cash", iso(mondayFriday));
const typoPayments = takeEarly(4, "amount_typo", "momo");
takeEarly(3, "no_receipt", "momo");

/** A believable slip of the pen: swap two digits, or an extra/missing zero in the tens. */
function typo(amount: number): number {
  const cedis = String(amount / 100);
  const digits = cedis.split("");
  for (let i = digits.length - 2; i >= 0; i--) {
    if (digits[i] !== digits[i + 1]) {
      [digits[i], digits[i + 1]] = [digits[i + 1]!, digits[i]!];
      const swapped = Number(digits.join(""));
      if (swapped >= 50 && !digits.join("").startsWith("0")) return ghs(swapped);
      [digits[i], digits[i + 1]] = [digits[i + 1]!, digits[i]!];
    }
  }
  return amount + ghs(50);
}

// ---------- receipts (what the bursar wrote) ----------
type ReceiptCase =
  | Category
  | "duplicate"
  | "no_money_momo"
  | "no_money_cash";

interface Receipt {
  receiptNo: number;
  date: string;
  studentId: string;
  amount: number; // what is written on the receipt
  method: "momo" | "cash";
  case: ReceiptCase;
  paymentId: number | null; // the real payment it stands for
  duplicateOf?: number; // receipt number of the original
  photoPage: boolean;
}

type DraftReceipt = Omit<Receipt, "receiptNo" | "photoPage"> & { sortKey: string };
const drafts: DraftReceipt[] = [];
for (const p of payments) {
  if (p.category === "no_receipt") continue;
  drafts.push({
    date: p.date,
    studentId: p.studentId,
    amount: p.category === "amount_typo" ? typo(p.amount) : p.amount,
    method: p.method,
    case: p.category,
    paymentId: p.id,
    sortKey: `${p.date}-${rand().toFixed(6)}`,
  });
}

// Duplicates: the same MoMo payment receipted again the next school day.
const dupSources = drafts.filter((r) => r.case === "clean_momo" && r.date < SPECIALS_BEFORE);
const dupOriginals = shuffle([...dupSources]).slice(0, 2);
for (const orig of dupOriginals) {
  const next = SCHOOL_DAYS.find((d) => iso(d) > orig.date)!;
  drafts.push({
    ...orig,
    date: iso(next),
    case: "duplicate",
    sortKey: `${iso(next)}-${rand().toFixed(6)}`,
  });
}

// No money: one "MoMo" receipt with no MoMo line, one cash receipt that was never banked.
const [nmMomoStudent, nmCashStudent] = noMoneyStudentIdx.map((i) => students[i]!) as [Student, Student];
const nmMomoDate = iso(pick(SCHOOL_DAYS.filter((d) => iso(d) < SPECIALS_BEFORE)));
drafts.push({
  date: nmMomoDate,
  studentId: nmMomoStudent.id,
  amount: noMoneyAmounts.get(nmMomoStudent.id)!,
  method: "momo",
  case: "no_money_momo",
  paymentId: null,
  sortKey: `${nmMomoDate}-${rand().toFixed(6)}`,
});
const nmCashDate = iso(sameDayCashDays[0]!); // the day with 3 banked cash receipts
drafts.push({
  date: nmCashDate,
  studentId: nmCashStudent.id,
  amount: noMoneyAmounts.get(nmCashStudent.id)!,
  method: "cash",
  case: "no_money_cash",
  paymentId: null,
  sortKey: `${nmCashDate}-${rand().toFixed(6)}`,
});

drafts.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
const PHOTO_PAGE_SIZE = 6;
const receipts: Receipt[] = drafts.map(({ sortKey: _sortKey, ...r }, i) => ({
  ...r,
  receiptNo: 1001 + i,
  photoPage: i >= drafts.length - PHOTO_PAGE_SIZE,
}));
for (const r of receipts) {
  if (r.case === "duplicate") {
    r.duplicateOf = receipts.find(
      (o) => o.case === "clean_momo" && o.paymentId === r.paymentId,
    )!.receiptNo;
  }
}

// ---------- money lines ----------
interface MomoLine {
  txnId: string;
  dateTime: string;
  payerName: string;
  payerPhone: string;
  amount: number;
  reference: string;
  paymentId: number;
}
interface BankLine {
  date: string;
  description: string;
  reference: string;
  credit: number;
  coversPaymentIds: number[];
}

const REFERENCES = [
  (s: Student) => `${s.name.split(" ")[0]} fees`,
  (s: Student) => `School fees ${s.className}`,
  (s: Student) => s.name,
  () => "Fees",
  () => "school fees",
  () => "",
  () => "",
  (s: Student) => `${s.name.split(" ")[0]} ${s.className.replace(" ", "")}`,
];

/**
 * Typo payments always name the student in the reference, so the receipt and the money
 * are linked by name and phone, not just the date. (The draw still happens so the
 * random sequence, and every other row, stays the same.)
 */
function referenceFor(p: Payment, s: Student): string {
  const drawn = pick(REFERENCES)(s);
  return p.category === "amount_typo" ? `${s.name} fees` : drawn;
}

const momoLines: MomoLine[] = payments
  .filter((p) => p.method === "momo")
  .map((p) => {
    const s = studentOf(p.studentId);
    const [first, last] = s.parentName.toUpperCase().split(" ");
    // MoMo shows the SIM-registered name: usually "FIRST LAST", sometimes reversed.
    const payerName = rand() < 0.2 ? `${last} ${first}` : `${first} ${last}`;
    const time = `${String(int(7, 18)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`;
    return {
      txnId: String(int(10000000000, 99999999999)),
      dateTime: `${p.date} ${time}`,
      payerName,
      payerPhone: s.parentPhone,
      amount: p.amount,
      reference: referenceFor(p, s),
      paymentId: p.id,
    };
  })
  .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

const bankLines: BankLine[] = [];
for (const d of sameDayCashDays) {
  const covered = payments.filter((p) => p.category === "cash_same_day" && p.date === iso(d));
  bankLines.push({
    date: iso(d),
    description: `CASH DEPOSIT - ${SCHOOL.toUpperCase()} FEES`,
    reference: `DEP${iso(d).replace(/-/g, "")}`,
    credit: covered.reduce((a, p) => a + p.amount, 0),
    coversPaymentIds: covered.map((p) => p.id),
  });
}
const fridayCash = payments.filter((p) => p.category === "cash_banked_monday");
bankLines.push({
  date: iso(mondayDeposit),
  description: `CASH DEPOSIT - ${SCHOOL.toUpperCase()} FEES`,
  reference: `DEP${iso(mondayDeposit).replace(/-/g, "")}`,
  credit: fridayCash.reduce((a, p) => a + p.amount, 0),
  coversPaymentIds: fridayCash.map((p) => p.id),
});
bankLines.sort((a, b) => a.date.localeCompare(b.date));

// ---------- checks ----------
const countCase = (c: ReceiptCase) => receipts.filter((r) => r.case === c).length;
assert(receipts.length === 119, `119 receipts in the book (got ${receipts.length})`);
assert(countCase("clean_momo") === 96, "96 clean MoMo receipts");
assert(countCase("cash_same_day") === 12, "12 cash receipts banked the same day");
assert(countCase("cash_banked_monday") === 3, "3 Friday cash receipts banked on Monday");
assert(countCase("amount_typo") === 4, "4 amount typos");
assert(countCase("duplicate") === 2, "2 duplicate receipts");
assert(countCase("no_money_momo") + countCase("no_money_cash") === 2, "2 receipts with no money");
assert(payments.filter((p) => p.category === "no_receipt").length === 3, "3 payments with no receipt");
assert(momoLines.length === 103, "103 MoMo lines");
assert(bankLines.length === 7, "7 bank deposits");
assert(new Set(receipts.map((r) => r.receiptNo)).size === receipts.length, "unique receipt numbers");
assert(new Set(momoLines.map((m) => m.txnId)).size === momoLines.length, "unique MoMo txn IDs");

for (const r of receipts.filter((r) => r.case === "amount_typo")) {
  const real = payments[r.paymentId!]!.amount;
  assert(r.amount !== real, `typo receipt ${r.receiptNo} differs from the money`);
}

for (const r of receipts.filter((r) => r.case === "amount_typo")) {
  const line = momoLines.find((m) => m.paymentId === r.paymentId)!;
  const s = studentOf(r.studentId);
  assert(
    line.reference.includes(s.name) && line.payerPhone === s.parentPhone,
    `typo receipt ${r.receiptNo} is linked to its MoMo line by student name and parent phone`,
  );
}

const photo = receipts.filter((r) => r.photoPage);
assert(photo.length === PHOTO_PAGE_SIZE, "photo page size");
assert(photo.every((r) => r.case === "clean_momo"), "photo page holds only clean receipts");

// Every MoMo line is unambiguous: no two lines share date + amount + phone.
const momoKeys = momoLines.map((m) => `${m.dateTime.slice(0, 10)}|${m.amount}|${m.payerPhone}`);
assert(new Set(momoKeys).size === momoKeys.length, "MoMo lines are distinguishable");

// Cash: each deposit equals its receipts, and on the "never banked" day only the
// three real receipts add up to the deposit (so the missing one is identifiable).
for (const b of bankLines) {
  const sum = b.coversPaymentIds.reduce((a, id) => a + payments[id]!.amount, 0);
  assert(sum === b.credit, `deposit ${b.reference} equals its receipts`);
}
const nmDayCash = receipts.filter((r) => r.date === nmCashDate && r.method === "cash");
const nmDeposit = bankLines.find((b) => b.date === nmCashDate)!;
let matchingSubsets = 0;
for (let mask = 1; mask < 1 << nmDayCash.length; mask++) {
  const sum = nmDayCash.reduce((a, r, i) => (mask & (1 << i) ? a + r.amount : a), 0);
  if (sum === nmDeposit.credit) matchingSubsets++;
}
assert(matchingSubsets === 1, "exactly one set of cash receipts matches the short deposit");

// End state after the bursar resolves every flag:
//   typos corrected to the money, duplicates voided, no-receipt payments receipted,
//   the 2 no-money receipts stay flagged.
const finalReceiptCount = receipts.length - countCase("duplicate") + 3;
const finalVerified = finalReceiptCount - 2;
assert(finalReceiptCount === 120, "120 receipts at the end");
assert(finalVerified === 118, "118 verified at the end");
const verifiedPaid = new Map<string, number>();
for (const p of payments) verifiedPaid.set(p.studentId, (verifiedPaid.get(p.studentId) ?? 0) + p.amount);
const owing = students.filter((s) => (verifiedPaid.get(s.id) ?? 0) < s.termFee);
const overpaid = students.filter((s) => (verifiedPaid.get(s.id) ?? 0) > s.termFee);
assert(owing.length === 12, `12 students still owing (got ${owing.length})`);
assert(overpaid.length === 0, "nobody overpaid");

// ---------- write files ----------
const csv = (rows: (string | number)[][]) =>
  rows
    .map((row) =>
      row
        .map((v) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n") + "\n";

mkdirSync(OUT_DIR, { recursive: true });
const write = (name: string, body: string) => writeFileSync(join(OUT_DIR, name), body);

write(
  "students.csv",
  csv([
    ["student_id", "full_name", "class", "term_fee_ghs", "parent_name", "parent_phone"],
    ...students.map((s) => [s.id, s.name, s.className, fmt(s.termFee), s.parentName, s.parentPhone]),
  ]),
);

const receiptRow = (r: Receipt) => {
  const s = studentOf(r.studentId);
  return [r.receiptNo, r.date, s.id, s.name, s.className, fmt(r.amount), r.method];
};
const receiptHeader = ["receipt_no", "date", "student_id", "student_name", "class", "amount_ghs", "method"];
write("receipts.csv", csv([receiptHeader, ...receipts.filter((r) => !r.photoPage).map(receiptRow)]));
write("photo-page-receipts.csv", csv([receiptHeader, ...photo.map(receiptRow)]));

// Column layout modelled on a mobile money merchant statement export. All values invented.
let momoBalance = ghs(2350);
write(
  "momo-merchant-statement.csv",
  csv([
    ["Transaction ID", "Date/Time", "Transaction Type", "From Name", "From Number", "Amount (GHS)", "Fees (GHS)", "Balance (GHS)", "Reference", "Status"],
    ...momoLines.map((m) => {
      momoBalance += m.amount;
      return [m.txnId, m.dateTime, "PAYMENT RECEIVED", m.payerName, m.payerPhone, fmt(m.amount), "0.00", fmt(momoBalance), m.reference, "SUCCESSFUL"];
    }),
  ]),
);

let bankBalance = ghs(18420.75);
write(
  "bank-statement.csv",
  csv([
    ["Date", "Description", "Reference", "Debit (GHS)", "Credit (GHS)", "Balance (GHS)"],
    ...bankLines.map((b) => {
      bankBalance += b.credit;
      return [b.date, b.description, b.reference, "", fmt(b.credit), fmt(bankBalance)];
    }),
  ]),
);

// Answer key: what a correct check should conclude. Used to tune matching, never shown to the agent.
const momoByPayment = new Map(momoLines.map((m) => [m.paymentId, m]));
const bankByPayment = new Map<number, BankLine>();
for (const b of bankLines) for (const id of b.coversPaymentIds) bankByPayment.set(id, b);
const moneyRef = (paymentId: number | null) => {
  if (paymentId === null) return null;
  const m = momoByPayment.get(paymentId);
  if (m) return { source: "momo", txn_id: m.txnId };
  const b = bankByPayment.get(paymentId)!;
  return { source: "bank", reference: b.reference };
};
const EXPECTED: Record<ReceiptCase, string> = {
  clean_momo: "match",
  cash_same_day: "match_bank_deposit",
  cash_banked_monday: "flag_no_money_then_resolved_banked_together",
  amount_typo: "flag_amount_diff_then_corrected",
  duplicate: "flag_duplicate_then_voided",
  no_money_momo: "flag_no_money_real_problem",
  no_money_cash: "flag_no_money_real_problem",
  no_receipt: "flag_no_receipt_then_receipt_added",
};
write(
  "answer-key.json",
  JSON.stringify(
    {
      note: "Expected outcomes for the demo data. For tuning only; the agent must never read this file.",
      end_state: {
        receipts: finalReceiptCount,
        verified: finalVerified,
        flagged: 2,
        students_owing: owing.length,
      },
      receipts: receipts.map((r) => ({
        receipt_no: r.receiptNo,
        case: r.case,
        expected: EXPECTED[r.case],
        money: moneyRef(r.paymentId),
        ...(r.case === "amount_typo" ? { true_amount_ghs: fmt(payments[r.paymentId!]!.amount) } : {}),
        ...(r.duplicateOf ? { duplicate_of: r.duplicateOf } : {}),
        ...(r.photoPage ? { photo_page: true } : {}),
      })),
      money_without_receipt: payments
        .filter((p) => p.category === "no_receipt")
        .map((p) => ({
          txn_id: momoByPayment.get(p.id)!.txnId,
          student_id: p.studentId,
          amount_ghs: fmt(p.amount),
        })),
      students_owing: owing.map((s) => ({
        student_id: s.id,
        name: s.name,
        balance_ghs: fmt(s.termFee - (verifiedPaid.get(s.id) ?? 0)),
      })),
    },
    null,
    2,
  ) + "\n",
);

// A page for Kwame to copy by hand into a receipt book for the live photo.
write(
  "photo-page.md",
  [
    `# Demo photo page — ${SCHOOL} (fictional)`,
    "",
    "Copy these rows by hand onto one receipt-book page, in block capitals.",
    "They are left out of receipts.csv; in the demo the bursar photographs this page.",
    "",
    "| Receipt # | Date | Student | Class | Amount (GHS) | Method |",
    "| --- | --- | --- | --- | --- | --- |",
    ...photo.map((r) => {
      const s = studentOf(r.studentId);
      const [y, m, d] = r.date.split("-");
      const amt = Number(fmt(r.amount)).toLocaleString("en-GH", { minimumFractionDigits: 2 });
      return `| ${r.receiptNo} | ${d}/${m}/${y!.slice(2)} | ${s.name} | ${s.className} | ${amt} | ${r.method === "momo" ? "MoMo" : "Cash"} |`;
    }),
    "",
  ].join("\n"),
);

console.log(`Demo data written to ${OUT_DIR}`);
console.log(
  `  ${students.length} students · ${receipts.length} receipts (${photo.length} on the photo page) · ` +
    `${momoLines.length} MoMo lines · ${bankLines.length} bank deposits`,
);
console.log(
  `  End state: ${finalVerified} of ${finalReceiptCount} verified · 2 flagged · ${owing.length} students owing`,
);
console.log("  All checks passed.");

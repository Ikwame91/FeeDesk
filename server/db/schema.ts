import { sql } from "drizzle-orm";
import { integer, pgTable, real, text } from "drizzle-orm/pg-core";

/**
 * FeeDesk holds one school's fee ledger. Every signed-in staff member of the
 * deployment works on the same rows; `owner_email` records who created a row.
 *
 * Money is always integer pesewas (GHS 450.50 = 45050). Dates are "YYYY-MM-DD".
 */

export const students = pgTable("students", {
  id: text("id").primaryKey(), // e.g. "S001", from the school's fee list
  name: text("name").notNull(),
  className: text("class_name").notNull(),
  termFeePesewas: integer("term_fee_pesewas").notNull(),
  parentName: text("parent_name").notNull(),
  parentPhone: text("parent_phone").notNull(),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const RECEIPT_METHODS = ["cash", "momo"] as const;
export const RECEIPT_SOURCES = ["photo", "upload", "typed"] as const;
export const RECEIPT_STATUSES = ["unchecked", "verified", "flagged", "void"] as const;

export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  receiptNo: text("receipt_no").notNull().unique(),
  date: text("date").notNull(),
  studentId: text("student_id").notNull(),
  amountPesewas: integer("amount_pesewas").notNull(),
  method: text("method").$type<(typeof RECEIPT_METHODS)[number]>().notNull(),
  source: text("source").$type<(typeof RECEIPT_SOURCES)[number]>().notNull(),
  status: text("status")
    .$type<(typeof RECEIPT_STATUSES)[number]>()
    .notNull()
    .default("unchecked"),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const MONEY_SOURCES = ["momo", "bank"] as const;

export const moneyLines = pgTable("money_lines", {
  id: text("id").primaryKey(),
  source: text("source").$type<(typeof MONEY_SOURCES)[number]>().notNull(),
  date: text("date").notNull(),
  time: text("time"), // "HH:MM:SS" when the statement has it
  payerName: text("payer_name"),
  payerPhone: text("payer_phone"),
  amountPesewas: integer("amount_pesewas").notNull(),
  txnId: text("txn_id").notNull(), // MoMo transaction ID, or the bank reference
  reference: text("reference"),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  receiptIds: text("receipt_ids").notNull(), // JSON array: several cash receipts can share one deposit
  moneyLineId: text("money_line_id").notNull(),
  confidence: real("confidence").notNull(),
  reason: text("reason").notNull(),
  // auto: confident (>= 0.9, exact amount) · proposed: waiting on a flag · accepted: bursar confirmed · rejected
  state: text("state").$type<"auto" | "accepted" | "rejected" | "proposed">().notNull(),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const FLAG_KINDS = ["no_money", "no_receipt", "amount_diff", "duplicate"] as const;

export const flags = pgTable("flags", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<(typeof FLAG_KINDS)[number]>().notNull(),
  receiptId: text("receipt_id"),
  moneyLineId: text("money_line_id"),
  note: text("note").notNull(),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by"),
  resolvedAt: text("resolved_at"),
  matchId: text("match_id"), // the proposed match this flag asks about, if any
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** A photo of a receipt-book page being read into rows. Drafts until confirmed. */
export const captureBatches = pgTable("capture_batches", {
  id: text("id").primaryKey(),
  status: text("status").$type<"reading" | "ready" | "done">().notNull().default("reading"),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** One row as read from the photo, kept as text exactly as entered until it becomes a receipt. */
export const captureRows = pgTable("capture_rows", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  position: integer("position").notNull(),
  receiptNo: text("receipt_no").notNull().default(""),
  date: text("date").notNull().default(""),
  studentName: text("student_name").notNull().default(""),
  className: text("class_name").notNull().default(""),
  amountGhs: text("amount_ghs").notNull().default(""),
  method: text("method").notNull().default(""),
  unclear: text("unclear").notNull().default("[]"), // JSON array of field names the reader wasn't sure of
  addedReceiptNo: text("added_receipt_no"),
  ownerEmail: text("owner_email").notNull().default("local@localhost"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

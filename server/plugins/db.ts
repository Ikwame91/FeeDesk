import { runMigrations } from "@agent-native/core/db";

// Additive only: never edit an entry that has run; append a new named one.
export const FEEDESK_MIGRATIONS = [
  {
    version: 1,
    name: "feedesk-core-tables",
    sql: `CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  term_fee_pesewas INTEGER NOT NULL CHECK (term_fee_pesewas >= 0),
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id),
  amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'momo')),
  source TEXT NOT NULL CHECK (source IN ('photo', 'upload', 'typed')),
  status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked', 'verified', 'flagged', 'void')),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS receipts_date_idx ON receipts (date);
CREATE INDEX IF NOT EXISTS receipts_student_idx ON receipts (student_id);
CREATE TABLE IF NOT EXISTS money_lines (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('momo', 'bank')),
  date TEXT NOT NULL,
  time TEXT,
  payer_name TEXT,
  payer_phone TEXT,
  amount_pesewas INTEGER NOT NULL CHECK (amount_pesewas > 0),
  txn_id TEXT NOT NULL,
  reference TEXT,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  created_at TEXT NOT NULL DEFAULT (now()),
  UNIQUE (source, txn_id)
);
CREATE INDEX IF NOT EXISTS money_lines_date_idx ON money_lines (date);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  receipt_ids TEXT NOT NULL,
  money_line_id TEXT NOT NULL REFERENCES money_lines(id),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('auto', 'accepted', 'rejected')),
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS flags (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('no_money', 'no_receipt', 'amount_diff', 'duplicate')),
  receipt_id TEXT REFERENCES receipts(id),
  money_line_id TEXT REFERENCES money_lines(id),
  note TEXT NOT NULL,
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  owner_email TEXT NOT NULL DEFAULT 'local@localhost',
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS flags_open_idx ON flags (resolved_at)`,
  },
];

export default runMigrations(FEEDESK_MIGRATIONS, { table: "feedesk_migrations" });

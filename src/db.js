import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Amounts are stored as whole currency units (integers) to avoid float rounding.
// Dates are ISO strings (YYYY-MM-DD), so string comparison equals date comparison.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    group_name  TEXT    NOT NULL,
    monthly_fee INTEGER NOT NULL CHECK (monthly_fee > 0),
    created_at  TEXT    NOT NULL DEFAULT (date('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL CHECK (amount > 0),
    date       TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_payments_student_date ON payments (student_id, date);
`;

export function openDb(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

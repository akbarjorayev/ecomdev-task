// Fills the database with demo students and payments for the current and previous month.
// WARNING: deletes all existing data first.
import { openDb } from '../src/db.js';
import { currentMonth } from '../src/dates.js';

const dbPath = process.env.DB_PATH || 'data/app.db';
const db = openDb(dbPath);

const month = currentMonth();
const [y, m] = month.split('-').map(Number);
const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;

const students = [
  // name, phone, group, monthly fee, enrolled since, payments [month, day, amount]
  ['Aliya Karimova', '+998 90 123-45-67', 'English A1', 500000, `${prevMonth}-01`, [[prevMonth, 3, 500000], [month, 2, 500000]]],
  ['Timur Rashidov', '+998 91 234-56-78', 'English A1', 500000, `${prevMonth}-01`, [[prevMonth, 5, 500000], [month, 4, 200000]]],
  ['Dilnoza Yusupova', '+998 93 345-67-89', 'Math 9', 400000, `${prevMonth}-01`, [[prevMonth, 10, 150000]]],
  ['Bekzod Aminov', '+998 94 456-78-90', 'Math 9', 400000, `${prevMonth}-01`, [[prevMonth, 7, 400000], [month, 1, 400000]]],
  ['Malika Saidova', '+998 95 567-89-01', 'IT Basics', 700000, `${month}-01`, []],
];

db.exec('DELETE FROM payments; DELETE FROM students; DELETE FROM sqlite_sequence;');

const insertStudent = db.prepare(
  'INSERT INTO students (name, phone, group_name, monthly_fee, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
);
const insertPayment = db.prepare('INSERT INTO payments (student_id, amount, date) VALUES (?, ?, ?)');

db.exec('BEGIN');
for (const [name, phone, group, fee, since, payments] of students) {
  const { id } = insertStudent.get(name, phone, group, fee, since);
  for (const [pm, day, amount] of payments) {
    insertPayment.run(id, amount, `${pm}-${String(day).padStart(2, '0')}`);
  }
}
db.exec('COMMIT');

console.log(`Seeded ${students.length} students into ${dbPath} (months ${prevMonth} and ${month}).`);

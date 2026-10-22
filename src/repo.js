import { nextMonth } from './dates.js';

// API field name -> column name, used for partial updates.
const STUDENT_COLUMNS = { name: 'name', phone: 'phone', group: 'group_name', monthlyFee: 'monthly_fee' };

const toStudent = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  group: row.group_name,
  monthlyFee: row.monthly_fee,
  createdAt: row.created_at,
});

const toPayment = (row) => ({ id: row.id, studentId: row.student_id, amount: row.amount, date: row.date });

export function createRepo(db) {
  const stmt = {
    listStudents: db.prepare('SELECT * FROM students ORDER BY name, id'),
    getStudent: db.prepare('SELECT * FROM students WHERE id = ?'),
    insertStudent: db.prepare(
      'INSERT INTO students (name, phone, group_name, monthly_fee) VALUES (?, ?, ?, ?) RETURNING *',
    ),
    deleteStudent: db.prepare('DELETE FROM students WHERE id = ?'),
    insertPayment: db.prepare('INSERT INTO payments (student_id, amount, date) VALUES (?, ?, ?) RETURNING *'),
    listPayments: db.prepare('SELECT * FROM payments WHERE student_id = ? ORDER BY date DESC, id DESC'),
    // A student owes for a month only if they were already enrolled by the end of it.
    // Payments count toward the month of their date; over-payments do not carry over.
    debtors: db.prepare(`
      SELECT s.*, COALESCE(SUM(p.amount), 0) AS paid
      FROM students s
      LEFT JOIN payments p
        ON p.student_id = s.id AND p.date >= :start AND p.date < :end
      WHERE s.created_at < :end
      GROUP BY s.id
      HAVING paid < s.monthly_fee
      ORDER BY s.monthly_fee - paid DESC, s.name
    `),
  };

  return {
    listStudents: () => stmt.listStudents.all().map(toStudent),

    getStudent(id) {
      const row = stmt.getStudent.get(id);
      return row ? toStudent(row) : null;
    },

    createStudent: ({ name, phone, group, monthlyFee }) =>
      toStudent(stmt.insertStudent.get(name, phone, group, monthlyFee)),

    updateStudent(id, fields) {
      const keys = Object.keys(fields);
      const sets = keys.map((k) => `${STUDENT_COLUMNS[k]} = ?`).join(', ');
      const row = db
        .prepare(`UPDATE students SET ${sets} WHERE id = ? RETURNING *`)
        .get(...keys.map((k) => fields[k]), id);
      return row ? toStudent(row) : null;
    },

    deleteStudent: (id) => stmt.deleteStudent.run(id).changes > 0,

    addPayment: ({ studentId, amount, date }) => toPayment(stmt.insertPayment.get(studentId, amount, date)),

    listPayments: (studentId) => stmt.listPayments.all(studentId).map(toPayment),

    debtors(month) {
      const rows = stmt.debtors.all({ start: `${month}-01`, end: `${nextMonth(month)}-01` });
      return rows.map((row) => ({
        ...toStudent(row),
        paid: row.paid,
        debt: row.monthly_fee - row.paid,
      }));
    },
  };
}

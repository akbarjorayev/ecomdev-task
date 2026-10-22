import { fileURLToPath } from 'node:url';
import express from 'express';
import { currentMonth, isValidMonth } from './dates.js';
import { createRepo } from './repo.js';
import { HttpError, parseId, parsePayment, parseStudent, parseStudentPatch } from './validation.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

export function createApp(db) {
  const repo = createRepo(db);
  const app = express();

  app.use(express.json());
  app.use(express.static(publicDir));

  const findStudent = (idParam) => {
    const student = repo.getStudent(parseId(idParam));
    if (!student) throw new HttpError(404, 'Student not found');
    return student;
  };

  // --- Students ---
  app.get('/students', (req, res) => {
    res.json(repo.listStudents());
  });

  app.post('/students', (req, res) => {
    res.status(201).json(repo.createStudent(parseStudent(req.body)));
  });

  app.get('/students/:id', (req, res) => {
    res.json(findStudent(req.params.id));
  });

  // PUT replaces all fields, PATCH changes only the ones sent.
  app.put('/students/:id', (req, res) => {
    const { id } = findStudent(req.params.id);
    res.json(repo.updateStudent(id, parseStudent(req.body)));
  });

  app.patch('/students/:id', (req, res) => {
    const { id } = findStudent(req.params.id);
    res.json(repo.updateStudent(id, parseStudentPatch(req.body)));
  });

  // Deleting a student also deletes their payments (ON DELETE CASCADE).
  app.delete('/students/:id', (req, res) => {
    if (!repo.deleteStudent(parseId(req.params.id))) throw new HttpError(404, 'Student not found');
    res.status(204).end();
  });

  // --- Payments ---
  app.get('/students/:id/payments', (req, res) => {
    const { id } = findStudent(req.params.id);
    res.json(repo.listPayments(id));
  });

  app.post('/payments', (req, res) => {
    const payment = parsePayment(req.body);
    if (!repo.getStudent(payment.studentId)) throw new HttpError(404, 'Student not found');
    res.status(201).json(repo.addPayment(payment));
  });

  // --- Debtors ---
  app.get('/debtors', (req, res) => {
    const month = req.query.month ?? currentMonth();
    if (!isValidMonth(month)) throw new HttpError(400, 'Invalid month: expected YYYY-MM, e.g. 2026-10');
    const debtors = repo.debtors(month);
    res.json({ month, totalDebt: debtors.reduce((sum, d) => sum + d.debt, 0), debtors });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    // Other body-parser errors (body too large, bad encoding...) are client errors, not 500s.
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.expose ? err.message : 'Bad request' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { currentMonth, today } from '../src/dates.js';

// Each test gets its own in-memory database and server on a random port.
async function setup(t) {
  const db = openDb(':memory:');
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const addStudent = async (overrides = {}) =>
    (await call('POST', '/students', { name: 'Ann', phone: '+998901234567', group: 'A1', monthlyFee: 1000, ...overrides })).body;

  return { db, base, call, addStudent };
}

test('students: create, list, get, update, delete', async (t) => {
  const { call } = await setup(t);

  const created = await call('POST', '/students', { name: ' Ann ', phone: '+998 90 123-45-67', group: 'A1', monthlyFee: 1000 });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Ann', 'name is trimmed');
  assert.equal(created.body.createdAt, today());

  const list = await call('GET', '/students');
  assert.deepEqual(list.body, [created.body]);

  const patched = await call('PATCH', `/students/${created.body.id}`, { monthlyFee: 1500 });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.monthlyFee, 1500);
  assert.equal(patched.body.name, 'Ann', 'other fields untouched');

  const put = await call('PUT', `/students/${created.body.id}`, { name: 'Bob', phone: '12345', group: 'B2', monthlyFee: 900 });
  assert.equal(put.status, 200);
  assert.equal(put.body.group, 'B2');

  const putPartial = await call('PUT', `/students/${created.body.id}`, { name: 'Bob' });
  assert.equal(putPartial.status, 400, 'PUT requires all fields');

  assert.equal((await call('DELETE', `/students/${created.body.id}`)).status, 204);
  assert.equal((await call('GET', `/students/${created.body.id}`)).status, 404);
  assert.equal((await call('DELETE', `/students/${created.body.id}`)).status, 404);
});

test('students: validation errors', async (t) => {
  const { call } = await setup(t);

  const res = await call('POST', '/students', { name: '', phone: 'abc', monthlyFee: -5 });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(res.body.details).sort(), ['group', 'monthlyFee', 'name', 'phone']);

  assert.equal((await call('POST', '/students', { name: 'A', phone: '12345', group: 'g', monthlyFee: 10.5 })).status, 400);
  assert.equal((await call('POST', '/students', { name: 'A', phone: '-----', group: 'g', monthlyFee: 1 })).status, 400, 'phone needs digits');
  assert.equal((await call('PATCH', '/students/1', {})).status, 404);
  assert.equal((await call('GET', '/students/abc')).status, 400);
});

test('rejects malformed JSON', async (t) => {
  const { base } = await setup(t);
  const res = await fetch(`${base}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name": ',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Malformed JSON body');

  const tooLarge = await fetch(`${base}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x'.repeat(200_000) }),
  });
  assert.equal(tooLarge.status, 413, 'oversized body is a client error, not a 500');
});

test('payments: add and list by student', async (t) => {
  const { call, addStudent } = await setup(t);
  const s = await addStudent();

  const p1 = await call('POST', '/payments', { studentId: s.id, amount: 300, date: '2026-10-05' });
  assert.equal(p1.status, 201);
  assert.deepEqual(p1.body, { id: p1.body.id, studentId: s.id, amount: 300, date: '2026-10-05' });

  const p2 = await call('POST', '/payments', { studentId: s.id, amount: '200' });
  assert.equal(p2.status, 201);
  assert.equal(p2.body.date, today(), 'date defaults to today');
  assert.equal(p2.body.amount, 200, 'numeric strings are accepted');

  const list = await call('GET', `/students/${s.id}/payments`);
  assert.equal(list.body.length, 2);

  assert.equal((await call('POST', '/payments', { studentId: 999, amount: 100 })).status, 404);
  assert.equal((await call('POST', '/payments', { studentId: s.id, amount: 0 })).status, 400);
  assert.equal((await call('POST', '/payments', { studentId: s.id, amount: 100, date: '2026-02-30' })).status, 400);
  assert.equal((await call('GET', '/students/999/payments')).status, 404);
});

test('deleting a student deletes their payments', async (t) => {
  const { call, addStudent, db } = await setup(t);
  const s = await addStudent();
  await call('POST', '/payments', { studentId: s.id, amount: 100 });
  await call('DELETE', `/students/${s.id}`);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
});

test('debtors: who paid less than the monthly fee, and how much they owe', async (t) => {
  const { call, addStudent, db } = await setup(t);
  const enrolledEarly = db.prepare("UPDATE students SET created_at = '2026-01-01' WHERE id = ?");

  const unpaid = await addStudent({ name: 'Unpaid', monthlyFee: 1000 });
  const partial = await addStudent({ name: 'Partial', monthlyFee: 1000 });
  const full = await addStudent({ name: 'Full', monthlyFee: 1000 });
  const over = await addStudent({ name: 'Over', monthlyFee: 1000 });
  for (const s of [unpaid, partial, full, over]) enrolledEarly.run(s.id);

  const pay = (studentId, amount, date) => call('POST', '/payments', { studentId, amount, date });
  await pay(partial.id, 300, '2026-03-01');
  await pay(partial.id, 200, '2026-03-31');
  await pay(partial.id, 5000, '2026-04-01'); // next month — must not count for March
  await pay(full.id, 1000, '2026-03-15');
  await pay(over.id, 1500, '2026-03-15');

  const res = await call('GET', '/debtors?month=2026-03');
  assert.equal(res.status, 200);
  assert.equal(res.body.month, '2026-03');
  assert.deepEqual(
    res.body.debtors.map((d) => [d.name, d.paid, d.debt]),
    [['Unpaid', 0, 1000], ['Partial', 500, 500]],
  );
  assert.equal(res.body.totalDebt, 1500);
});

test('debtors: students are not charged for months before they enrolled', async (t) => {
  const { call, addStudent, db } = await setup(t);
  const s = await addStudent();
  db.prepare("UPDATE students SET created_at = '2026-05-20' WHERE id = ?").run(s.id);

  assert.deepEqual((await call('GET', '/debtors?month=2026-04')).body.debtors, []);
  assert.equal((await call('GET', '/debtors?month=2026-05')).body.debtors.length, 1, 'owes for the month they joined');
});

test('debtors: month defaults to current and is validated', async (t) => {
  const { call } = await setup(t);
  assert.equal((await call('GET', '/debtors')).body.month, currentMonth());
  for (const bad of ['2026-13', '2026-1', 'abc', '2026-10-01']) {
    assert.equal((await call('GET', `/debtors?month=${bad}`)).status, 400, bad);
  }
});

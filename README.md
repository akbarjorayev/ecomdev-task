# Training center payments

A small payment tracker for a training center. It has:

- a **REST API** for students, payments and monthly debtors;
- a **mobile-friendly web page** with the list of debtors and a form for adding a payment (Part 2, option B).

Stack: Node.js 22.13+ (JavaScript, ES modules), Express 5, SQLite through Node's built-in `node:sqlite` module. The only npm dependency is Express, and there are no native modules to compile.

## How to run from scratch

Requirements: **Node.js 22.13 or newer** (tested on Node 24) and git.

```bash
git clone https://github.com/akbarjorayev/ecomdev-task.git
cd ecomdev-task
npm install
npm run seed      # optional: demo students and payments (DELETES existing data)
npm start         # http://localhost:3000
```

Open http://localhost:3000 in a browser, or on a phone in the same network at `http://<computer-ip>:3000`.

Other commands:

```bash
npm test          # API tests (node:test, in-memory database)
npm run dev       # restart automatically when files change
```

Settings (environment variables):

| Variable  | Default       | Meaning                    |
|-----------|---------------|----------------------------|
| `PORT`    | `3000`        | HTTP port                  |
| `DB_PATH` | `data/app.db` | SQLite file (auto-created) |

## API

All bodies are JSON. Errors look like `{ "error": "...", "details": { "field": "reason" } }` and come with status 400, 404 or 500.

### Students

| Method | Path            | Description                      |
|--------|-----------------|----------------------------------|
| GET    | `/students`     | List of students                 |
| POST   | `/students`     | Create a student → `201`         |
| GET    | `/students/:id` | One student                      |
| PUT    | `/students/:id` | Replace all fields               |
| PATCH  | `/students/:id` | Change only the fields sent      |
| DELETE | `/students/:id` | Delete the student and their payments → `204` |

```json
{ "name": "Aliya Karimova", "phone": "+998 90 123-45-67", "group": "English A1", "monthlyFee": 500000 }
```

### Payments

| Method | Path                     | Description                          |
|--------|--------------------------|--------------------------------------|
| POST   | `/payments`              | Add a payment → `201`                |
| GET    | `/students/:id/payments` | Payments of one student, newest first |

```json
{ "studentId": 1, "amount": 200000, "date": "2026-10-05" }
```

`date` is optional and defaults to today.

### Debtors

`GET /debtors?month=YYYY-MM` (the month defaults to the current one):

```json
{
  "month": "2026-10",
  "totalDebt": 300000,
  "debtors": [
    { "id": 2, "name": "Timur Rashidov", "phone": "+998 91 234-56-78", "group": "English A1",
      "monthlyFee": 500000, "createdAt": "2026-09-01", "paid": 200000, "debt": 300000 }
  ]
}
```

Rules:

- A payment counts toward the month of its `date`.
- A debtor is a student whose total payments for that month are less than their `monthlyFee`. `debt = monthlyFee − paid`.
- Students are not counted as debtors for months before they enrolled (`createdAt`). The month they enrolled in counts in full.
- Overpayments do not carry over to the next month.
- Amounts are whole numbers in the currency's main unit (no kopecks or tiyins), stored as integers.

Quick check with curl:

```bash
curl -X POST localhost:3000/students -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"+998901112233","group":"A1","monthlyFee":100000}'
curl -X POST localhost:3000/payments -H "Content-Type: application/json" \
  -d '{"studentId":1,"amount":40000}'
curl "localhost:3000/debtors?month=2026-10"
```

## Project structure

```
src/
  server.js      entry point: opens the database, starts the HTTP server
  app.js         Express app: routes and error handling
  repo.js        SQL queries (students, payments, debtors)
  validation.js  request validation and HttpError
  db.js          SQLite connection and schema
  dates.js       date/month helpers
public/          web page (plain HTML/CSS/JS, no build step)
scripts/seed.js  demo data
test/            API tests
```

## What I would improve with another week

1. **Billing periods instead of a single `monthlyFee`.** Fee changes currently apply to past months too, because debt is always calculated from the current fee. I'd store the fee history (or monthly invoices) so old months stay correct. I'd also support pauses and the date a student leaves.
2. **Payment allocation.** Let a payment count toward a chosen month (e.g. paying October in late September), carry overpayments forward, and show a running balance instead of month-by-month results only.
3. **Authentication and an audit trail.** Add admin login for the API and the page, and record who added or changed a payment. Payments would be cancelled instead of deleted.
4. **Production readiness.** PostgreSQL with migrations, a Dockerfile, an OpenAPI/Swagger spec, structured logs, rate limiting, and CI that runs tests and a linter.
5. **More UI.** Student management on the page, search and filter by group, a Telegram bot (option A) on top of the same API, and reminders to debtors.

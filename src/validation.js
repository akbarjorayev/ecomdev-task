import { isValidDate, today } from './dates.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const digitCount = (s) => s.replace(/\D/g, '').length;

// Each check returns [normalizedValue] on success or [undefined, errorMessage].
const text = (max) => (v) => {
  if (typeof v !== 'string' || !v.trim()) return [undefined, 'must be a non-empty string'];
  const trimmed = v.trim();
  if (trimmed.length > max) return [undefined, `must be at most ${max} characters`];
  return [trimmed];
};

const phone = (v) => {
  // Only digits, spaces, (), - and a leading +; at least 5 actual digits.
  if (typeof v !== 'string' || !/^\+?[\d\s()-]{5,20}$/.test(v.trim()) || digitCount(v) < 5) {
    return [undefined, 'must be a phone number, e.g. +998 90 123-45-67'];
  }
  return [v.trim()];
};

// Accepts 1500 or "1500" (HTML forms send strings); rejects fractions, zero, negatives.
const positiveInt = (v) => {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isSafeInteger(n) || n <= 0) return [undefined, 'must be a positive integer'];
  return [n];
};

const date = (v) => (isValidDate(v) ? [v] : [undefined, 'must be a valid date in YYYY-MM-DD format']);

const STUDENT_RULES = { name: text(100), phone, group: text(50), monthlyFee: positiveInt };
const PAYMENT_RULES = { studentId: positiveInt, amount: positiveInt, date };

function parse(body, rules, { partial = false } = {}) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Request body must be a JSON object');

  const value = {};
  const errors = {};
  for (const [field, check] of Object.entries(rules)) {
    if (body[field] === undefined || body[field] === null) {
      if (!partial) errors[field] = 'is required';
      continue;
    }
    const [normalized, error] = check(body[field]);
    if (error) errors[field] = error;
    else value[field] = normalized;
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  if (partial && !Object.keys(value).length) {
    throw new HttpError(400, `Provide at least one of: ${Object.keys(rules).join(', ')}`);
  }
  return value;
}

export const parseStudent = (body) => parse(body, STUDENT_RULES);
export const parseStudentPatch = (body) => parse(body, STUDENT_RULES, { partial: true });

export function parsePayment(body) {
  // Date is optional: a payment without one is recorded for today.
  if (isPlainObject(body) && (body.date === undefined || body.date === '')) body = { ...body, date: today() };
  return parse(body, PAYMENT_RULES);
}

export function parseId(param) {
  const [id, error] = positiveInt(param);
  if (error) throw new HttpError(400, 'Invalid id: must be a positive integer');
  return id;
}

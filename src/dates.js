const pad = (n) => String(n).padStart(2, '0');

// Local-time "today" as YYYY-MM-DD (toISOString would give the UTC date).
export function today(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function currentMonth(now = new Date()) {
  return today(now).slice(0, 7);
}

export function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects overflow like 2026-02-30, which Date would silently roll into March.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// "2026-12" -> "2027-01"
export function nextMonth(month) {
  let [y, m] = month.split('-').map(Number);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${pad(m)}`;
}

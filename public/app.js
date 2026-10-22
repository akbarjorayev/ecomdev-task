const $ = (sel) => document.querySelector(sel);

const els = {
  monthInput: $('#month'),
  monthText: $('#month-text'),
  statTotal: $('#stat-total'),
  statCount: $('#stat-count'),
  search: $('#search'),
  debtors: $('#debtors'),
  sheet: $('#sheet'),
  form: $('#pay-form'),
  debtHint: $('#debt-hint'),
  chips: $('#chips'),
  formError: $('#form-error'),
  history: $('#history'),
  historyList: $('#history-list'),
  toast: $('#toast'),
};
const { studentId: studentSelect, amount: amountInput, date: dateInput } = els.form.elements;
const submitBtn = els.form.querySelector('.btn-primary');

const state = { month: '', debtors: [], students: [] };

// ---------- Helpers ----------

const pad = (n) => String(n).padStart(2, '0');
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthName = (month, opts = { month: 'long', year: 'numeric' }) => {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(y, m - 1, 1));
};
const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
};

// 1500000 -> "1 500 000" (narrow no-break spaces, same everywhere regardless of locale)
const money = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const digitsOf = (s) => s.replace(/\D/g, '');

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Tiny DOM builder: el('div', { class: 'x', text: 'hi' }, child1, child2)
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key === 'html') node.innerHTML = value; // only used with static SVG strings
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_ALERT = '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const details = body?.details ? Object.entries(body.details).map(([k, v]) => `${k} ${v}`).join('; ') : '';
    throw new Error(details || body?.error || `Request failed (${res.status})`);
  }
  return body;
}

// ---------- Toast ----------

let toastTimer;
function toast(message, kind = 'ok') {
  els.toast.replaceChildren(
    el('span', { class: 'dot', html: kind === 'ok' ? ICON_CHECK : ICON_ALERT }),
    el('span', { text: message }),
  );
  els.toast.className = `toast ${kind}`;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3200);
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Debtors list ----------

function renderSkeleton() {
  els.debtors.replaceChildren(
    ...Array.from({ length: 3 }, () =>
      el('li', { class: 'debtor skeleton', 'aria-hidden': 'true' },
        el('span', { class: 'avatar' }),
        el('div', {}, el('span', { class: 'sk-line', style: 'width:60%' }), el('span', { class: 'sk-line', style: 'width:40%' })),
        el('span', { class: 'sk-line sk-pill' }),
      ),
    ),
  );
}

const paidPct = (d) => Math.min(100, (d.paid / d.monthlyFee) * 100);

// `previous` is this debtor's data before a re-render; if their payment changed,
// the bar starts at the old width and slides to the new one.
function debtorCard(d, i, previous) {
  const pct = paidPct(d);
  const tel = d.phone.replace(/[^\d+]/g, '');
  const changed = previous && previous.paid !== d.paid;
  const fill = el('span', { style: `--p:${changed ? paidPct(previous) : pct}%` });
  if (changed) requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--p', `${pct}%`)));

  return el('li', { class: `debtor${changed ? ' updated' : ''}`, style: `--i:${i}`, 'data-id': d.id },
    el('span', { class: 'avatar', text: initials(d.name), 'aria-hidden': 'true' }),
    el('div', { class: 'who' },
      el('span', { class: 'name', text: d.name }),
      el('span', { class: 'meta' },
        el('span', { text: `${d.group} · #${d.id}` }),
        el('a', { href: `tel:${tel}`, text: d.phone }),
      ),
    ),
    el('span', { class: 'debt-pill', text: `−${money(d.debt)}`, title: `Owes ${money(d.debt)}` }),
    el('div', { class: 'progress-row' },
      el('div', { class: 'progress' },
        el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${d.name} paid ${Math.round(pct)}%` },
          fill,
        ),
        el('small', { text: `Paid ${money(d.paid)} of ${money(d.monthlyFee)}` }),
      ),
      el('button', { type: 'button', class: 'pay-btn', text: 'Pay', onclick: () => openSheet(d) }),
    ),
  );
}

function emptyState(title, text, { search = false } = {}) {
  return el('li', { class: `empty${search ? ' search-empty' : ''}` },
    el('span', { class: 'empty-icon', html: search ? ICON_SEARCH : ICON_CHECK }),
    el('strong', { text: title }),
    el('span', { text }),
  );
}

// Entrance animation plays only when `animate` is set (first load, month change);
// search filtering and post-payment refreshes swap content instantly.
function renderDebtors({ animate = false, previous = [] } = {}) {
  const q = els.search.value.trim().toLowerCase();
  const list = q
    ? state.debtors.filter((d) => `${d.name} ${d.group} ${d.phone} #${d.id}`.toLowerCase().includes(q))
    : state.debtors;
  const prevById = new Map(previous.map((d) => [d.id, d]));

  els.debtors.classList.toggle('animate', animate);
  if (!state.debtors.length) {
    els.debtors.replaceChildren(emptyState('All paid up!', `Nobody owes anything for ${monthName(state.month)}.`));
  } else if (!list.length) {
    els.debtors.replaceChildren(emptyState('No matches', `Nothing found for “${els.search.value.trim()}”.`, { search: true }));
  } else {
    els.debtors.replaceChildren(...list.map((d, i) => debtorCard(d, i, prevById.get(d.id))));
  }
}

function applyDebtors(data) {
  state.debtors = data.debtors;
  els.statTotal.textContent = money(data.totalDebt);
  els.statCount.textContent = String(data.debtors.length);
}

// dir: -1 = moved to an earlier month, 1 = later, 0 = initial load (cards slide in from that side).
async function loadDebtors(dir = 0) {
  const month = state.month;
  const list = els.debtors;
  const request = api(`/debtors?month=${encodeURIComponent(month)}`);
  request.catch(() => {}); // awaited below; avoids an "unhandled rejection" while the exit plays

  list.dataset.dir = dir > 0 ? 'next' : dir < 0 ? 'prev' : '';
  // Month switch: current cards slide out first (the request runs meanwhile).
  if (dir && list.children.length && !reducedMotion()) {
    list.classList.remove('animate');
    list.classList.add('exiting');
    await new Promise((resolve) => setTimeout(resolve, 170));
    if (month !== state.month) return; // user clicked again; the newer call takes over
  }

  // Skeleton only if the request is still slow, so fast loads don't flash placeholders.
  const skeletonTimer = setTimeout(() => {
    list.classList.remove('exiting');
    renderSkeleton();
  }, 150);
  try {
    const data = await request;
    if (month !== state.month) return;
    applyDebtors(data);
    list.classList.remove('exiting');
    renderDebtors({ animate: true });
  } finally {
    clearTimeout(skeletonTimer);
    if (month === state.month) list.classList.remove('exiting');
  }
}

// After a payment: paid-off cards fold away, the rest update in place.
async function refreshAfterPayment() {
  const previous = state.debtors;
  const data = await api(`/debtors?month=${encodeURIComponent(state.month)}`);
  const stillOwing = new Set(data.debtors.map((d) => d.id));
  const leaving = [...els.debtors.querySelectorAll('.debtor[data-id]')].filter(
    (li) => !stillOwing.has(Number(li.dataset.id)),
  );
  if (leaving.length && !reducedMotion()) {
    for (const li of leaving) {
      li.style.maxHeight = `${li.offsetHeight}px`;
      li.classList.add('leaving');
    }
    await new Promise((resolve) => setTimeout(resolve, 380));
  }
  applyDebtors(data);
  renderDebtors({ previous });
}

function setMonth(month, dir = 0) {
  state.month = month;
  els.monthInput.value = month;
  els.monthText.textContent = monthName(month);
  loadDebtors(dir).catch((e) => toast(e.message, 'error'));
}

// ---------- Payment sheet ----------

async function loadStudents() {
  state.students = await api('/students');
  const selected = studentSelect.value;
  studentSelect.replaceChildren(
    el('option', { value: '', text: state.students.length ? 'Choose a student…' : 'No students yet' }),
    ...state.students.map((s) => el('option', { value: s.id, text: `${s.name} — ${s.group}` })),
  );
  studentSelect.value = selected;
}

function setAmount(value) {
  amountInput.value = value ? money(value) : '';
  amountInput.classList.remove('invalid');
}

// Shows how much the chosen student owes for the selected month, with quick-fill chips.
function updateStudentInfo() {
  const id = Number(studentSelect.value);
  const debtor = state.debtors.find((d) => d.id === id);
  const student = state.students.find((s) => s.id === id);
  const month = monthName(state.month, { month: 'long' });

  els.chips.replaceChildren();
  els.debtHint.className = 'hint';
  if (!student) {
    els.debtHint.replaceChildren();
  } else if (debtor) {
    els.debtHint.replaceChildren('Owes ', el('b', { text: money(debtor.debt) }), ` for ${month}`);
    const chips = [['Full debt', debtor.debt]];
    if (debtor.debt >= 2) chips.push(['Half', Math.round(debtor.debt / 2)]);
    if (debtor.debt !== student.monthlyFee) chips.push(['Monthly fee', student.monthlyFee]);
    els.chips.replaceChildren(
      ...chips.map(([label, value]) =>
        el('button', { type: 'button', class: 'chip', text: `${label} · ${money(value)}`, onclick: () => setAmount(value) }),
      ),
    );
  } else {
    els.debtHint.classList.add('clear');
    els.debtHint.replaceChildren(el('b', { text: 'Paid in full' }), ` for ${month}`);
    els.chips.replaceChildren(
      el('button', { type: 'button', class: 'chip', text: `Monthly fee · ${money(student.monthlyFee)}`, onclick: () => setAmount(student.monthlyFee) }),
    );
  }
  loadHistory(id).catch(() => {});
}

async function loadHistory(studentId) {
  if (!studentId) {
    els.history.hidden = true;
    return;
  }
  const payments = await api(`/students/${studentId}/payments`);
  if (Number(studentSelect.value) !== studentId) return;
  els.history.hidden = false;
  els.historyList.replaceChildren(
    ...(payments.length
      ? payments.map((p) => el('li', {}, el('span', { text: prettyDate(p.date) }), el('strong', { text: money(p.amount) })))
      : [el('li', {}, el('span', { text: 'No payments yet' }))]),
  );
}

function openSheet(debtor) {
  els.formError.textContent = '';
  els.history.open = false;
  // Viewing the current month → today; a past/future month → the 1st of it.
  const today = localToday();
  dateInput.value = today.startsWith(state.month) ? today : `${state.month}-01`;
  studentSelect.value = debtor ? String(debtor.id) : '';
  setAmount(debtor?.debt);
  updateStudentInfo();

  els.sheet.showModal();
  // Pick up students added since the page loaded (e.g. through the API).
  loadStudents().catch(() => {});
  // Focus the next thing to fill in; skip on touch to avoid the keyboard covering the sheet.
  if (matchMedia('(hover: hover)').matches) (debtor ? amountInput : studentSelect).focus();
}

function closeSheet() {
  if (!els.sheet.open || els.sheet.classList.contains('closing')) return;
  if (reducedMotion()) return els.sheet.close();
  els.sheet.classList.add('closing');
  els.sheet.addEventListener('animationend', () => {
    els.sheet.classList.remove('closing');
    els.sheet.close();
  }, { once: true });
}

function showFormError(message, field) {
  els.formError.textContent = '';
  // Re-trigger the shake animation even if the message is the same.
  requestAnimationFrame(() => (els.formError.textContent = message));
  if (field) {
    field.classList.add('invalid');
    field.focus();
  }
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitBtn.classList.contains('loading')) return; // Enter pressed twice
  const data = {
    studentId: Number(studentSelect.value),
    amount: Number(digitsOf(amountInput.value)),
    date: dateInput.value,
  };
  if (!data.studentId) return showFormError('Choose a student.', studentSelect);
  if (!data.amount) return showFormError('Enter an amount greater than zero.', amountInput);
  if (!data.date) return showFormError('Choose a date.', dateInput);

  submitBtn.classList.add('loading');
  els.formError.textContent = '';
  try {
    await api('/payments', { method: 'POST', body: JSON.stringify(data) });
  } catch (e) {
    showFormError(e.message);
    return;
  } finally {
    submitBtn.classList.remove('loading');
  }
  const student = state.students.find((s) => s.id === data.studentId);
  closeSheet();
  toast(`Saved ${money(data.amount)} from ${student?.name ?? 'student'}`);
  refreshAfterPayment().catch((e) => toast(e.message, 'error'));
});

// Live thousands separators in the amount field, keeping the caret in place.
amountInput.addEventListener('input', () => {
  amountInput.classList.remove('invalid');
  const caret = amountInput.selectionStart ?? amountInput.value.length;
  const digitsBeforeCaret = digitsOf(amountInput.value.slice(0, caret)).length;
  const digits = digitsOf(amountInput.value).replace(/^0+/, '').slice(0, 12);
  amountInput.value = digits ? money(Number(digits)) : '';

  let pos = 0;
  for (let seen = 0; pos < amountInput.value.length && seen < digitsBeforeCaret; pos++) {
    if (/\d/.test(amountInput.value[pos])) seen++;
  }
  amountInput.setSelectionRange(pos, pos);
});

studentSelect.addEventListener('change', () => {
  studentSelect.classList.remove('invalid');
  updateStudentInfo();
});
dateInput.addEventListener('change', () => dateInput.classList.remove('invalid'));

els.sheet.addEventListener('click', (e) => {
  if (e.target === els.sheet || e.target.closest('[data-close]')) closeSheet();
});
els.sheet.addEventListener('cancel', (e) => {
  e.preventDefault(); // Escape: animate out instead of closing instantly
  closeSheet();
});

// ---------- Month + search ----------

$('#prev-month').addEventListener('click', () => setMonth(shiftMonth(state.month, -1), -1));
$('#next-month').addEventListener('click', () => setMonth(shiftMonth(state.month, 1), 1));
$('#month-label').addEventListener('click', () => {
  try {
    els.monthInput.showPicker();
  } catch {
    // Browsers without a month picker: arrows still work; this jumps back to the current month.
    const current = localToday().slice(0, 7);
    if (current !== state.month) setMonth(current, current > state.month ? 1 : -1);
  }
});
els.monthInput.addEventListener('change', () => {
  const month = els.monthInput.value;
  if (month && month !== state.month) setMonth(month, month > state.month ? 1 : -1);
});

els.search.addEventListener('input', () => renderDebtors());
$('#open-sheet').addEventListener('click', () => openSheet());

// ---------- Start ----------

setMonth(localToday().slice(0, 7));
loadStudents().catch((e) => toast(e.message, 'error'));

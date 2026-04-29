let clerk = null;

async function initClerk() {
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/config.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Failed to load /config.js'));
    document.head.appendChild(s);
  });
  const pk = window.CLERK_PK;
  const domain = atob(pk.split('_')[2]).slice(0, -1);
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://${domain}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
    s.setAttribute('data-clerk-publishable-key', pk);
    s.crossOrigin = 'anonymous';
    s.onload = res;
    s.onerror = () => rej(new Error('Clerk bundle failed to load'));
    document.head.appendChild(s);
  });
  await window.Clerk.load();
  console.log('[auth] Clerk loaded. isSignedIn:', window.Clerk.isSignedIn, 'session:', !!window.Clerk.session);
  return window.Clerk;
}

async function authHeaders() {
  const token = await clerk.session.getToken();
  return { Authorization: `Bearer ${token}` };
}

const api = {
  async get(path) {
    const res = await fetch(path, { headers: await authHeaders() });
    if (res.status === 401) { location.href = '/login.html'; return; }
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { location.href = '/login.html'; return; }
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
};

async function readError(res) {
  try {
    const data = await res.json();
    return data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function setStatus(el, message, kind) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('success', 'error');
  if (kind) el.classList.add(kind);
}

function formatAmount(value) {
  return '$' + Number(value).toFixed(2);
}

// --- Page initializers -----------------------------------------------------

const pages = {
  'add-transaction': initAddTransaction,
  categories: initCategories,
  reports: initReports,
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    clerk = await initClerk();
  } catch (err) {
    console.error('[auth] initClerk threw:', err.message, err.stack);
    location.href = '/login.html';
    return;
  }
  console.log('[auth] after initClerk: isSignedIn=', clerk.isSignedIn, 'session=', !!clerk.session, 'user=', clerk.user?.id);
  if (!clerk.session) {
    console.warn('[auth] no session, redirecting to login');
    location.href = '/login.html';
    return;
  }
  const page = document.body.dataset.page;
  const init = pages[page];
  if (init) init();
});

// --- Add Transaction -------------------------------------------------------

async function initAddTransaction() {
  const form = document.getElementById('transaction-form');
  const categoryEl = document.getElementById('category');
  const dateEl = document.getElementById('date');
  const status = document.getElementById('form-status');

  dateEl.valueAsDate = new Date();

  try {
    const categories = await api.get('/api/categories');
    for (const c of categories) {
      const opt = document.createElement('option');
      opt.value = String(c.CategoryID);
      opt.textContent = `${c.CategoryName} (${c.CategoryType})`;
      categoryEl.appendChild(opt);
    }
  } catch (err) {
    setStatus(status, `Could not load categories: ${err.message}`, 'error');
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(status, 'Saving…');

    const payload = {
      amount: Number(form.amount.value),
      date: form.date.value,
      type: form.type.value,
      categoryId: Number(form.categoryId.value),
      description: form.description.value || null,
    };

    try {
      await api.post('/api/transactions', payload);
      setStatus(status, 'Transaction saved.', 'success');
      form.reset();
      dateEl.valueAsDate = new Date();
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });
}

// --- Categories -------------------------------------------------------------

async function initCategories() {
  const form = document.getElementById('category-form');
  const list = document.getElementById('category-list');
  const status = document.getElementById('form-status');

  async function reload() {
    list.innerHTML = '<li class="muted">Loading…</li>';
    try {
      const categories = await api.get('/api/categories');
      list.innerHTML = '';
      if (categories.length === 0) {
        list.innerHTML = '<li class="muted">No categories yet.</li>';
        return;
      }
      for (const c of categories) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = c.CategoryName;
        const type = document.createElement('span');
        type.className = 'type-badge';
        type.textContent = `(${c.CategoryType})`;
        li.appendChild(name);
        li.appendChild(type);
        list.appendChild(li);
      }
    } catch (err) {
      list.innerHTML = `<li class="muted">Failed to load: ${err.message}</li>`;
    }
  }

  await reload();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(status, 'Adding…');

    const payload = {
      name: form.name.value,
      type: form.type.value,
    };

    try {
      await api.post('/api/categories', payload);
      setStatus(status, 'Category added.', 'success');
      form.reset();
      await reload();
    } catch (err) {
      setStatus(status, err.message, 'error');
    }
  });
}

// --- Reports ----------------------------------------------------------------

function initReports() {
  const buttons = document.querySelectorAll('[data-report]');
  const placeholder = document.getElementById('report-placeholder');
  const table = document.getElementById('report-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => loadReport(btn.dataset.report));
  });

  async function loadReport(kind) {
    placeholder.textContent = 'Loading…';
    placeholder.hidden = false;
    table.hidden = true;

    try {
      const data = await api.get(`/api/reports/${kind}`);
      renderReport(kind, data);
    } catch (err) {
      placeholder.textContent = `Failed to load: ${err.message}`;
    }
  }

  function renderReport(kind, rows) {
    if (!rows || rows.length === 0) {
      placeholder.textContent = 'No data yet.';
      placeholder.hidden = false;
      table.hidden = true;
      return;
    }

    placeholder.hidden = true;
    table.hidden = false;
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const headers = kind === 'monthly'
      ? ['Month', 'Type', 'Total']
      : ['Category', 'Type', 'Total'];

    const headerRow = document.createElement('tr');
    headers.forEach((label, i) => {
      const th = document.createElement('th');
      th.textContent = label;
      if (i === 2) th.className = 'amount';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    for (const r of rows) {
      const tr = document.createElement('tr');
      const cells = kind === 'monthly'
        ? [r.Month, r.TransactionType, formatAmount(r.Total)]
        : [r.CategoryName, r.CategoryType, formatAmount(r.Total)];

      cells.forEach((value, i) => {
        const td = document.createElement('td');
        td.textContent = value;
        if (i === 2) td.className = 'amount';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }
}

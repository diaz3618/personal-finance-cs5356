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
  async put(path, body) {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { location.href = '/login.html'; return; }
    if (!res.ok) throw new Error(await readError(res));
    return res.status === 204 ? null : res.json();
  },
  async delete(path) {
    const res = await fetch(path, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    if (res.status === 401) { location.href = '/login.html'; return; }
    if (!res.ok) throw new Error(await readError(res));
    return null;
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

let chartJsLoading = null;
async function loadChartJS() {
  if (window.Chart) return;
  if (!chartJsLoading) {
    chartJsLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Failed to load Chart.js'));
      document.head.appendChild(s);
    });
  }
  await chartJsLoading;
}

const pages = {
  dashboard: initDashboard,
  transactions: initTransactions,
  categories: initCategories,
  budgets: initBudgets,
  reports: initReports,
  profile: initProfile,
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    clerk = await initClerk();
  } catch (err) {
    console.error('[auth] initClerk threw:', err.message, err.stack);
    location.href = '/login.html';
    return;
  }
  if (!clerk.session) {
    location.href = '/login.html';
    return;
  }
  const signOutBtn = document.getElementById('sign-out-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      clerk.signOut().then(() => { location.href = '/login.html'; });
    });
  }
  const page = document.body.dataset.page;
  const init = pages[page];
  if (init) init();
});

// --- Dashboard --------------------------------------------------------------

async function initDashboard() {
  const balanceEl = document.getElementById('net-balance');
  const chartEl = document.getElementById('monthly-chart');
  const tbody = document.getElementById('recent-transactions');

  try {
    const summary = await api.get('/api/dashboard/summary');
    if (balanceEl) balanceEl.textContent = formatAmount(summary.net_balance);
  } catch {
    if (balanceEl) balanceEl.textContent = 'Unavailable';
  }

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthly = await api.get(`/api/reports/monthly?year=${year}&month=${month}`);
    if (chartEl && monthly.length > 0) {
      await loadChartJS();
      new Chart(chartEl, {
        type: 'bar',
        data: {
          labels: monthly.map(r => r.category_name),
          datasets: [{
            label: 'Amount',
            data: monthly.map(r => r.total),
            backgroundColor: monthly.map(r =>
              r.category_type === 'income' ? 'rgba(79,209,122,0.7)' : 'rgba(255,107,107,0.7)'
            ),
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
        },
      });
    }
  } catch {
    // chart is non-critical
  }

  try {
    const txns = await api.get('/api/transactions');
    if (!tbody) return;
    tbody.innerHTML = '';
    const recent = (txns || []).slice(0, 5);
    if (recent.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'text-secondary text-center';
      td.textContent = 'No transactions yet.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    for (const t of recent) {
      const tr = document.createElement('tr');
      const dateTd = document.createElement('td');
      dateTd.textContent = t.transaction_date ? String(t.transaction_date).slice(0, 10) : '';
      const catTd = document.createElement('td');
      catTd.textContent = t.category_name || '';
      const typeTd = document.createElement('td');
      typeTd.textContent = t.transaction_type || '';
      const amtTd = document.createElement('td');
      amtTd.className = 'text-end';
      amtTd.textContent = formatAmount(t.amount);
      tr.appendChild(dateTd);
      tr.appendChild(catTd);
      tr.appendChild(typeTd);
      tr.appendChild(amtTd);
      tbody.appendChild(tr);
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = `Error: ${err.message}`;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }
}

// --- Transactions -----------------------------------------------------------

async function initTransactions() {
  const txList = document.getElementById('transaction-list');
  const txForm = document.getElementById('transaction-form');
  const txCategory = document.getElementById('tx-category');
  const filterCategory = document.getElementById('filter-category');
  const filterDateFrom = document.getElementById('filter-date-from');
  const filterDateTo = document.getElementById('filter-date-to');
  const filterType = document.getElementById('filter-type');
  const filterReset = document.getElementById('filter-reset');
  const paginationEl = document.getElementById('pagination');
  const status = document.getElementById('form-status');

  const PAGE_SIZE = 25;
  let allTransactions = [];
  let allCategories = [];
  let currentPage = 1;

  try {
    [allTransactions, allCategories] = await Promise.all([
      api.get('/api/transactions'),
      api.get('/api/categories'),
    ]);
    allTransactions = allTransactions || [];
    allCategories = allCategories || [];
  } catch (err) {
    if (txList) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = `Failed to load: ${err.message}`;
      tr.appendChild(td);
      txList.appendChild(tr);
    }
    return;
  }

  for (const c of allCategories) {
    const opt = document.createElement('option');
    opt.value = String(c.category_id);
    opt.textContent = `${c.category_name} (${c.category_type})`;
    if (txCategory) txCategory.appendChild(opt.cloneNode(true));
    if (filterCategory) filterCategory.appendChild(opt);
  }

  function filtered() {
    return allTransactions.filter(t => {
      const date = String(t.transaction_date).slice(0, 10);
      if (filterDateFrom && filterDateFrom.value && date < filterDateFrom.value) return false;
      if (filterDateTo && filterDateTo.value && date > filterDateTo.value) return false;
      if (filterCategory && filterCategory.value && String(t.category_id) !== filterCategory.value) return false;
      if (filterType && filterType.value && t.transaction_type !== filterType.value) return false;
      return true;
    });
  }

  function renderPage() {
    if (!txList) return;
    const rows = filtered();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const slice = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    txList.innerHTML = '';
    if (slice.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'text-secondary text-center';
      td.textContent = 'No transactions found.';
      tr.appendChild(td);
      txList.appendChild(tr);
    } else {
      for (const t of slice) txList.appendChild(buildRow(t));
    }

    if (paginationEl) {
      paginationEl.innerHTML = '';
      if (totalPages > 1) {
        const nav = document.createElement('ul');
        nav.className = 'pagination m-0';
        for (let p = 1; p <= totalPages; p++) {
          const li = document.createElement('li');
          li.className = 'page-item' + (p === currentPage ? ' active' : '');
          const a = document.createElement('a');
          a.className = 'page-link';
          a.href = '#';
          a.textContent = String(p);
          a.addEventListener('click', (e) => { e.preventDefault(); currentPage = p; renderPage(); });
          li.appendChild(a);
          nav.appendChild(li);
        }
        paginationEl.appendChild(nav);
      }
    }
  }

  function buildRow(t) {
    const tr = document.createElement('tr');
    tr.dataset.id = t.transaction_id;

    const dateTd = document.createElement('td');
    dateTd.textContent = t.transaction_date ? String(t.transaction_date).slice(0, 10) : '';
    const catTd = document.createElement('td');
    catTd.textContent = t.category_name || '';
    const typeTd = document.createElement('td');
    typeTd.textContent = t.transaction_type || '';
    const notesTd = document.createElement('td');
    notesTd.textContent = t.notes || '';
    const amtTd = document.createElement('td');
    amtTd.className = 'text-end';
    amtTd.textContent = formatAmount(t.amount);
    const actionsTd = document.createElement('td');

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-sm btn-ghost-secondary me-1';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => activateEdit(tr, t));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-ghost-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      try {
        await api.delete(`/api/transactions/${t.transaction_id}`);
        allTransactions = allTransactions.filter(x => x.transaction_id !== t.transaction_id);
        renderPage();
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    });

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    tr.appendChild(dateTd);
    tr.appendChild(catTd);
    tr.appendChild(typeTd);
    tr.appendChild(notesTd);
    tr.appendChild(amtTd);
    tr.appendChild(actionsTd);
    return tr;
  }

  function activateEdit(tr, t) {
    const tds = tr.querySelectorAll('td');

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'form-control form-control-sm';
    dateInput.value = t.transaction_date ? String(t.transaction_date).slice(0, 10) : '';
    tds[0].innerHTML = '';
    tds[0].appendChild(dateInput);

    const catSelect = document.createElement('select');
    catSelect.className = 'form-select form-select-sm';
    for (const c of allCategories) {
      const opt = document.createElement('option');
      opt.value = String(c.category_id);
      opt.textContent = c.category_name;
      if (String(c.category_id) === String(t.category_id)) opt.selected = true;
      catSelect.appendChild(opt);
    }
    tds[1].innerHTML = '';
    tds[1].appendChild(catSelect);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-select form-select-sm';
    for (const v of ['expense', 'income']) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === t.transaction_type) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    tds[2].innerHTML = '';
    tds[2].appendChild(typeSelect);

    const notesInput = document.createElement('input');
    notesInput.type = 'text';
    notesInput.className = 'form-control form-control-sm';
    notesInput.value = t.notes || '';
    notesInput.maxLength = 255;
    tds[3].innerHTML = '';
    tds[3].appendChild(notesInput);

    const amtInput = document.createElement('input');
    amtInput.type = 'number';
    amtInput.className = 'form-control form-control-sm';
    amtInput.step = '0.01';
    amtInput.min = '0.01';
    amtInput.value = t.amount;
    tds[4].innerHTML = '';
    tds[4].appendChild(amtInput);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm btn-primary me-1';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        const payload = {
          amount: Number(amtInput.value),
          date: dateInput.value,
          type: typeSelect.value,
          categoryId: Number(catSelect.value),
          notes: notesInput.value || null,
        };
        const updated = await api.put(`/api/transactions/${t.transaction_id}`, payload);
        const idx = allTransactions.findIndex(x => x.transaction_id === t.transaction_id);
        if (idx >= 0) {
          const cat = allCategories.find(c => String(c.category_id) === String(payload.categoryId));
          allTransactions[idx] = {
            ...allTransactions[idx],
            amount: payload.amount,
            transaction_date: payload.date,
            transaction_type: payload.type,
            category_id: payload.categoryId,
            category_name: cat ? cat.category_name : allTransactions[idx].category_name,
            notes: payload.notes,
            ...(updated || {}),
          };
        }
        renderPage();
      } catch (err) {
        alert(`Save failed: ${err.message}`);
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-sm btn-ghost-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => renderPage());

    tds[5].innerHTML = '';
    tds[5].appendChild(saveBtn);
    tds[5].appendChild(cancelBtn);
  }

  if (filterReset) {
    filterReset.addEventListener('click', () => {
      if (filterDateFrom) filterDateFrom.value = '';
      if (filterDateTo) filterDateTo.value = '';
      if (filterCategory) filterCategory.value = '';
      if (filterType) filterType.value = '';
      currentPage = 1;
      renderPage();
    });
  }

  [filterDateFrom, filterDateTo, filterCategory, filterType].forEach(el => {
    if (el) el.addEventListener('change', () => { currentPage = 1; renderPage(); });
  });

  if (txForm) {
    const dateInput = txForm.querySelector('[name="date"]');
    if (dateInput) dateInput.valueAsDate = new Date();

    txForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(status, 'Saving…');
      const payload = {
        amount: Number(txForm.amount.value),
        date: txForm.date.value,
        type: txForm.type.value,
        categoryId: Number(txForm.categoryId.value),
        notes: txForm.notes.value || null,
      };
      try {
        const created = await api.post('/api/transactions', payload);
        if (created) allTransactions.unshift(created);
        renderPage();
        setStatus(status, 'Transaction added.', 'success');
        txForm.reset();
        if (dateInput) dateInput.valueAsDate = new Date();
      } catch (err) {
        setStatus(status, err.message, 'error');
      }
    });
  }

  renderPage();
}

// --- Categories -------------------------------------------------------------

async function initCategories() {
  const form = document.getElementById('category-form');
  const list = document.getElementById('category-list');
  const status = document.getElementById('form-status');

  async function reload() {
    if (!list) return;
    list.innerHTML = '';
    try {
      const categories = await api.get('/api/categories');
      if (!categories || categories.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'text-secondary';
        td.textContent = 'No categories yet.';
        tr.appendChild(td);
        list.appendChild(tr);
        return;
      }
      for (const c of categories) {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = c.category_name;
        const typeTd = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = c.category_type;
        typeTd.appendChild(badge);
        const actionsTd = document.createElement('td');
        tr.appendChild(nameTd);
        tr.appendChild(typeTd);
        tr.appendChild(actionsTd);
        list.appendChild(tr);
      }
    } catch (err) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = `Failed to load: ${err.message}`;
      tr.appendChild(td);
      list.appendChild(tr);
    }
  }

  await reload();

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(status, 'Adding…');
      const payload = { name: form.name.value, type: form.type.value };
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
}

// --- Budgets ----------------------------------------------------------------

function initBudgets() {}

// --- Reports ----------------------------------------------------------------

function initReports() {}

// --- Profile ----------------------------------------------------------------

function initProfile() {}


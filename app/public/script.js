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
    // Leave the page usable even when the chart script fails to load.
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

async function initCategories() {
  const form = document.getElementById('category-form');
  const list = document.getElementById('category-list');
  const status = document.getElementById('form-status');

  let categories = [];

  function buildRow(c) {
    const tr = document.createElement('tr');
    tr.dataset.id = c.category_id;

    const nameTd = document.createElement('td');
    nameTd.textContent = c.category_name;
    const typeTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.textContent = c.category_type;
    typeTd.appendChild(badge);
    const actionsTd = document.createElement('td');

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-sm btn-ghost-secondary me-1';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => activateEdit(tr, c));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-ghost-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${c.category_name}"?`)) return;
      try {
        await api.delete(`/api/categories/${c.category_id}`);
        categories = categories.filter(x => x.category_id !== c.category_id);
        render();
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    });

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);
    tr.appendChild(nameTd);
    tr.appendChild(typeTd);
    tr.appendChild(actionsTd);
    return tr;
  }

  function activateEdit(tr, c) {
    const tds = tr.querySelectorAll('td');

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'form-control form-control-sm';
    nameInput.value = c.category_name;
    nameInput.maxLength = 50;
    tds[0].innerHTML = '';
    tds[0].appendChild(nameInput);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-select form-select-sm';
    for (const v of ['expense', 'income']) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === c.category_type) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    tds[1].innerHTML = '';
    tds[1].appendChild(typeSelect);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm btn-primary me-1';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      try {
        await api.put(`/api/categories/${c.category_id}`, {
          name: nameInput.value,
          type: typeSelect.value,
        });
        const idx = categories.findIndex(x => x.category_id === c.category_id);
        if (idx >= 0) {
          categories[idx] = { ...categories[idx], category_name: nameInput.value, category_type: typeSelect.value };
        }
        render();
      } catch (err) {
        alert(`Save failed: ${err.message}`);
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-sm btn-ghost-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => render());

    tds[2].innerHTML = '';
    tds[2].appendChild(saveBtn);
    tds[2].appendChild(cancelBtn);
  }

  function render() {
    if (!list) return;
    list.innerHTML = '';
    if (categories.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'text-secondary';
      td.textContent = 'No categories yet.';
      tr.appendChild(td);
      list.appendChild(tr);
      return;
    }
    for (const c of categories) list.appendChild(buildRow(c));
  }

  try {
    categories = (await api.get('/api/categories')) || [];
  } catch (err) {
    if (list) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = `Failed to load: ${err.message}`;
      tr.appendChild(td);
      list.appendChild(tr);
    }
    return;
  }

  render();

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(status, 'Adding…');
      try {
        const created = await api.post('/api/categories', {
          name: form.name.value,
          type: form.type.value,
        });
        if (created) categories.push(created);
        else categories = (await api.get('/api/categories')) || [];
        setStatus(status, 'Category added.', 'success');
        form.reset();
        render();
      } catch (err) {
        setStatus(status, err.message, 'error');
      }
    });
  }
}

async function initBudgets() {
  const monthSelect = document.getElementById('month-select');
  const budgetBody = document.getElementById('budget-body');
  const budgetStatus = document.getElementById('budget-status');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (monthSelect) {
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      const mm = String(m).padStart(2, '0');
      opt.value = `${currentYear}-${mm}`;
      opt.textContent = new Date(currentYear, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (m === currentMonth) opt.selected = true;
      monthSelect.appendChild(opt);
    }
    monthSelect.addEventListener('change', loadBudgets);
  }

  let allCategories = [];
  try {
    allCategories = (await api.get('/api/categories')) || [];
  } catch {
    allCategories = [];
  }

  async function loadBudgets() {
    if (!budgetBody) return;
    budgetBody.innerHTML = '';
    const month = monthSelect ? monthSelect.value : `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    let budgets = [];
    try {
      budgets = (await api.get(`/api/budgets?month=${month}`)) || [];
    } catch (err) {
      setStatus(budgetStatus, `Failed to load: ${err.message}`, 'error');
      return;
    }

    const budgetByCategory = {};
    for (const b of budgets) budgetByCategory[b.category_id] = b;

    if (allCategories.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'text-secondary text-center';
      td.textContent = 'No categories found.';
      tr.appendChild(td);
      budgetBody.appendChild(tr);
      return;
    }

    for (const cat of allCategories) {
      const budget = budgetByCategory[cat.category_id];
      const limitAmount = budget ? Number(budget.limit_amount) : 0;
      const actualAmount = budget ? Number(budget.actual_amount) : 0;
      const pct = limitAmount > 0 ? Math.min(100, Math.round((actualAmount / limitAmount) * 100)) : 0;
      const over = limitAmount > 0 && actualAmount > limitAmount;

      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = cat.category_name;

      const actualTd = document.createElement('td');
      actualTd.className = 'text-end';
      actualTd.textContent = formatAmount(actualAmount);

      const limitTd = document.createElement('td');
      limitTd.className = 'text-end';
      const limitInput = document.createElement('input');
      limitInput.type = 'number';
      limitInput.className = 'form-control form-control-sm text-end';
      limitInput.style.width = '110px';
      limitInput.step = '0.01';
      limitInput.min = '0';
      limitInput.value = limitAmount > 0 ? limitAmount : '';
      limitInput.placeholder = '0.00';
      limitInput.addEventListener('blur', async () => {
        const newLimit = Number(limitInput.value) || 0;
        if (newLimit === limitAmount) return;
        try {
          if (budget) {
            await api.put(`/api/budgets/${budget.id}`, { limit_amount: newLimit });
            budget.limit_amount = newLimit;
          } else {
            const created = await api.post('/api/budgets', {
              category_id: cat.category_id,
              month,
              limit_amount: newLimit,
            });
            if (created) budgetByCategory[cat.category_id] = created;
          }
          setStatus(budgetStatus, 'Budget saved.', 'success');
        } catch (err) {
          setStatus(budgetStatus, `Save failed: ${err.message}`, 'error');
        }
      });
      limitTd.appendChild(limitInput);

      const progressTd = document.createElement('td');
      if (limitAmount > 0) {
        const bar = document.createElement('div');
        bar.className = 'progress';
        bar.style.minWidth = '100px';
        const inner = document.createElement('div');
        inner.className = `progress-bar${over ? ' bg-danger' : ''}`;
        inner.style.width = `${pct}%`;
        inner.setAttribute('role', 'progressbar');
        inner.setAttribute('aria-valuenow', pct);
        inner.setAttribute('aria-valuemin', '0');
        inner.setAttribute('aria-valuemax', '100');
        inner.textContent = `${pct}%`;
        bar.appendChild(inner);
        progressTd.appendChild(bar);
      }

      const flagTd = document.createElement('td');
      if (over) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-danger';
        badge.textContent = 'Over limit';
        flagTd.appendChild(badge);
      }

      tr.appendChild(nameTd);
      tr.appendChild(actualTd);
      tr.appendChild(limitTd);
      tr.appendChild(progressTd);
      tr.appendChild(flagTd);
      budgetBody.appendChild(tr);
    }
  }

  await loadBudgets();
}

async function initReports() {
  const monthInput = document.getElementById('report-month');
  const monthlyChartEl = document.getElementById('monthly-chart-canvas');
  const categoryChartEl = document.getElementById('category-chart-canvas');
  const rankBody = document.getElementById('rank-body');

  let monthlyChart = null;
  let categoryChart = null;

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (monthInput) monthInput.value = defaultMonth;

  async function renderReports() {
    const val = (monthInput && monthInput.value) || defaultMonth;
    const [year, month] = val.split('-').map(Number);

    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    if (rankBody) rankBody.innerHTML = '';

    let monthly = [];
    let rankData = [];

    try {
      [monthly, rankData] = await Promise.all([
        api.get(`/api/reports/monthly?year=${year}&month=${month}`),
        api.get(`/api/reports/category-rank?year=${year}&month=${month}`),
      ]);
      monthly = monthly || [];
      rankData = rankData || [];
    } catch (err) {
      if (rankBody) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = `Failed to load: ${err.message}`;
        tr.appendChild(td);
        rankBody.appendChild(tr);
      }
      return;
    }

    if (monthly.length === 0 && rankData.length === 0) {
      if (rankBody) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'text-secondary text-center';
        td.textContent = 'No data for this month.';
        tr.appendChild(td);
        rankBody.appendChild(tr);
      }
      return;
    }

    await loadChartJS();

    if (monthlyChartEl && monthly.length > 0) {
      monthlyChart = new Chart(monthlyChartEl, {
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

    if (categoryChartEl && monthly.length > 0) {
      categoryChart = new Chart(categoryChartEl, {
        type: 'doughnut',
        data: {
          labels: monthly.map(r => r.category_name),
          datasets: [{
            data: monthly.map(r => r.total),
            backgroundColor: monthly.map((_, i) => `hsl(${(i * 47) % 360}, 65%, 60%)`),
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }

    if (rankBody) {
      rankBody.innerHTML = '';
      if (rankData.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'text-secondary text-center';
        td.textContent = 'No ranked data.';
        tr.appendChild(td);
        rankBody.appendChild(tr);
      } else {
        for (const r of rankData) {
          const tr = document.createElement('tr');
          const rankTd = document.createElement('td');
          rankTd.textContent = String(r.spend_rank);
          const nameTd = document.createElement('td');
          nameTd.textContent = r.category_name;
          const typeTd = document.createElement('td');
          typeTd.textContent = r.category_type;
          const totalTd = document.createElement('td');
          totalTd.className = 'text-end';
          totalTd.textContent = formatAmount(r.total);
          tr.appendChild(rankTd);
          tr.appendChild(nameTd);
          tr.appendChild(typeTd);
          tr.appendChild(totalTd);
          rankBody.appendChild(tr);
        }
      }
    }
  }

  if (monthInput) monthInput.addEventListener('change', renderReports);
  renderReports();
}

async function initProfile() {
  const profileInfo = document.getElementById('profile-info');
  const exportBtn = document.getElementById('export-btn');

  if (profileInfo) {
    try {
      const user = await api.get('/api/auth/me');
      profileInfo.innerHTML = '';

      const dl = document.createElement('dl');
      dl.className = 'row';

      const fields = [
        ['Name', user.display_name || '—'],
        ['Email', user.email || '—'],
        ['Member since', user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'],
      ];

      for (const [label, value] of fields) {
        const dt = document.createElement('dt');
        dt.className = 'col-5';
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.className = 'col-7';
        dd.textContent = value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      profileInfo.appendChild(dl);
    } catch (err) {
      if (profileInfo) profileInfo.textContent = `Could not load profile: ${err.message}`;
    }
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const headers = await authHeaders();
        const res = await fetch('/api/export/transactions', { headers });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transactions.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(`Export failed: ${err.message}`);
      }
    });
  }
}

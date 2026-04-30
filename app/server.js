require('dotenv').config();

const path = require('path');
const express = require('express');
const { adminPool, appPool } = require('./db');
const redis = require('./redis');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { Webhook } = require('svix');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY'].forEach((key) => {
  if (!process.env[key]) {
    console.error(`[startup] required env var ${key} is not set`);
    process.exit(1);
  }
});

if (!process.env.CLERK_WEBHOOK_SECRET) {
  console.warn('[startup] CLERK_WEBHOOK_SECRET not set — webhook endpoint disabled');
}


app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3010' }));

// Register this before express.json() so Svix can verify the raw payload.
const webhookHandler = async (req, res) => {
  if (!process.env.CLERK_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
  let evt;
  try {
    evt = wh.verify(req.body, {
      'svix-id':        req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (evt.type === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses?.[0]?.email_address ?? null;
    const display_name = [first_name, last_name].filter(Boolean).join(' ') || null;
    await adminPool.execute(
      `INSERT INTO users (clerk_user_id, email, display_name)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), display_name = VALUES(display_name)`,
      [id, email, display_name]
    );
  }

  if (evt.type === 'user.deleted') {
    await adminPool.execute(
      'DELETE FROM users WHERE clerk_user_id = ?',
      [evt.data.id]
    );
    await redis.del(`clerk:${evt.data.id}`);
  }

  res.json({ received: true });
};
app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.CLERK_PK = ${JSON.stringify(process.env.CLERK_PUBLISHABLE_KEY)};`);
});

const checkAuth = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

const resolveDbUser = async (req, res, next) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    const cacheKey = `clerk:${clerkUserId}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      req.userId = parseInt(cached, 10);
      return next();
    }
    const [rows] = await adminPool.execute(
      'SELECT id FROM users WHERE clerk_user_id = ?',
      [clerkUserId]
    );
    if (!rows.length) {
      console.warn(`[auth] JIT provision for clerk_user_id ${clerkUserId}`);
      const [ins] = await adminPool.execute(
        'INSERT IGNORE INTO users (clerk_user_id) VALUES (?)',
        [clerkUserId]
      );
      const insertedId = ins.insertId || null;
      if (!insertedId) {
        const [retry] = await adminPool.execute(
          'SELECT id FROM users WHERE clerk_user_id = ?',
          [clerkUserId]
        );
        req.userId = retry[0].id;
      } else {
        req.userId = insertedId;
      }
    } else {
      req.userId = rows[0].id;
    }
    await redis.set(cacheKey, req.userId, 'EX', 3600);
    next();
  } catch (err) {
    next(err);
  }
};

const setUserConn = async (req, res, next) => {
  let conn;
  try {
    conn = await appPool.getConnection();
    await conn.execute('SET @current_user_id = ?', [req.userId]);
    req.conn = conn;
    const release = () => { if (conn) { conn.release(); conn = null; } };
    res.on('finish', release);
    res.on('close',  release);
    next();
  } catch (err) {
    if (conn) conn.release();
    next(err);
  }
};

app.get('/health', (req, res) => res.sendStatus(200));

app.use('/api', clerkMiddleware(), checkAuth, resolveDbUser, setUserConn);

app.get('/api/auth/me', async (req, res) => {
  try {
    const [rows] = await adminPool.execute(
      'SELECT id, clerk_user_id, email, display_name, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user.' });
  }
});

app.get('/api/dashboard/summary', async (req, res) => {
  const now       = new Date();
  const year      = now.getFullYear();
  const month     = now.getMonth();
  const startDate = new Date(year, month, 1).toISOString().slice(0, 10);
  const endDate   = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  try {
    const [[balRow]]  = await req.conn.execute(
      'SELECT fn_net_balance(?) AS net_balance',
      [req.userId]
    );
    const [[daysRow]] = await req.conn.execute(
      'SELECT fn_days_in_period(?, ?) AS days_in_period',
      [startDate, endDate]
    );
    res.json({
      net_balance: balRow.net_balance,
      period: {
        start_date:     startDate,
        end_date:       endDate,
        days_in_period: daysRow.days_in_period,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard summary.' });
  }
});

app.get('/api/dashboard/running-balance', async (req, res) => {
  try {
    const [rows] = await req.conn.execute(
      `SELECT id               AS transaction_id,
              transaction_date,
              transaction_type,
              amount,
              SUM(CASE
                    WHEN transaction_type = 'income'  THEN  amount
                    WHEN transaction_type = 'expense' THEN -amount
                  END)
                OVER (ORDER BY transaction_date ASC, id ASC) AS running_balance
         FROM v_user_transactions
        ORDER BY transaction_date ASC, id ASC`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load running balance.' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await req.conn.execute(
      `SELECT id AS category_id, name AS category_name, type AS category_type
         FROM v_user_categories
        ORDER BY type, name`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

app.post('/api/categories', async (req, res) => {
  const { name, type } = req.body || {};
  if (!name || !type) {
    return res.status(400).json({ error: 'name and type are required.' });
  }

  try {
    const [result] = await req.conn.execute(
      `INSERT INTO v_user_categories (user_id, name, type) VALUES (?, ?, ?)`,
      [req.userId, name, type]
    );
    res.status(201).json({
      category_id: result.insertId,
      category_name: name,
      category_type: type,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  const { name, type } = req.body || {};
  if (!name || !type) {
    return res.status(400).json({ error: 'name and type are required.' });
  }

  try {
    const [result] = await req.conn.execute(
      `UPDATE v_user_categories SET name = ?, type = ? WHERE id = ? AND user_id = ?`,
      [name, type, req.params.id, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ category_id: Number(req.params.id), category_name: name, category_type: type });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update category.' });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const [result] = await req.conn.execute(
      `DELETE FROM v_user_categories WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const [rows] = await req.conn.execute(
      `SELECT t.id AS transaction_id, t.amount, t.transaction_date, t.transaction_type,
              t.notes, t.category_id, c.name AS category_name
         FROM v_user_transactions t
         JOIN v_user_categories   c ON c.id = t.category_id
        ORDER BY t.transaction_date DESC, t.id DESC`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

app.post('/api/transactions', async (req, res) => {
  const { amount, date, type, categoryId, notes } = req.body || {};

  if (amount == null || !date || !type || !categoryId) {
    return res.status(400).json({
      error: 'amount, date, type, and categoryId are required.',
    });
  }

  try {
    const [result] = await req.conn.execute(
      `INSERT INTO v_user_transactions
         (user_id, category_id, amount, transaction_date, transaction_type, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, categoryId, amount, date, type, notes || null]
    );
    res.status(201).json({ transaction_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create transaction.' });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  const { amount, date, type, categoryId, notes } = req.body || {};

  if (amount == null || !date || !type || !categoryId) {
    return res.status(400).json({
      error: 'amount, date, type, and categoryId are required.',
    });
  }

  try {
    const [result] = await req.conn.execute(
      `UPDATE v_user_transactions
          SET amount = ?, transaction_date = ?, transaction_type = ?,
              category_id = ?, notes = ?
        WHERE id = ? AND user_id = ?`,
      [amount, date, type, categoryId, notes || null, req.params.id, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    res.json({ transaction_id: Number(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

app.put('/api/transactions/:id/category', async (req, res) => {
  const { category_id } = req.body || {};
  if (!category_id) {
    return res.status(400).json({ error: 'category_id is required.' });
  }

  try {
    await req.conn.execute(
      'CALL usp_transfer_category(?, ?, ?)',
      [req.params.id, category_id, req.userId]
    );
    res.json({
      transaction_id: Number(req.params.id),
      category_id:    Number(category_id),
    });
  } catch (err) {
    if (err.sqlMessage) {
      return res.status(400).json({ error: err.sqlMessage });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to transfer category.' });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const [result] = await req.conn.execute(
      `DELETE FROM v_user_transactions WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

app.get('/api/reports/monthly', async (req, res) => {
  const year  = parseInt(req.query.year  ?? new Date().getFullYear(),  10);
  const month = parseInt(req.query.month ?? (new Date().getMonth() + 1), 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month.' });
  }

  try {
    const [rows] = await req.conn.execute(
      'CALL usp_monthly_summary(?, ?, ?)',
      [req.userId, year, month]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load monthly summary.' });
  }
});

app.get('/api/reports/by-category', async (req, res) => {
  try {
    const [rows] = await req.conn.execute(
      `SELECT c.name AS category_name, c.type AS category_type, SUM(t.amount) AS total
         FROM v_user_transactions t
         JOIN v_user_categories   c ON c.id = t.category_id
        GROUP BY c.id
        ORDER BY total DESC`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load category report.' });
  }
});

app.get('/api/reports/category-rank', async (req, res) => {
  const year  = parseInt(req.query.year  ?? new Date().getFullYear(),  10);
  const month = parseInt(req.query.month ?? (new Date().getMonth() + 1), 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year or month.' });
  }

  try {
    const [rows] = await req.conn.execute(
      `SELECT c.name AS category_name,
              c.type AS category_type,
              SUM(t.amount) AS total,
              RANK() OVER (ORDER BY SUM(t.amount) DESC) AS spend_rank
         FROM v_user_transactions t
         JOIN v_user_categories   c ON c.id = t.category_id
        WHERE YEAR(t.transaction_date)  = ?
          AND MONTH(t.transaction_date) = ?
        GROUP BY c.id, c.name, c.type
        ORDER BY spend_rank ASC`,
      [year, month]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load category rank.' });
  }
});

app.get('/api/export/transactions', async (req, res) => {
  try {
    const [rows] = await req.conn.execute(
      `WITH export_data AS (
           SELECT t.id,
                  t.transaction_date,
                  t.transaction_type,
                  t.amount,
                  c.name  AS category_name,
                  t.notes
             FROM v_user_transactions t
             JOIN v_user_categories   c ON c.id = t.category_id
            ORDER BY t.transaction_date DESC, t.id DESC
       )
       SELECT * FROM export_data`,
      []
    );

    const escape = (val) => {
      if (val == null) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const header = 'id,transaction_date,transaction_type,amount,category_name,notes\n';
    const body   = rows.map(r =>
      [r.id, r.transaction_date, r.transaction_type, r.amount,
       escape(r.category_name), escape(r.notes)].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(header + body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export transactions.' });
  }
});

app.get('/api/budgets', async (req, res) => {
  try {
    const [rows] = await req.conn.execute(
      `SELECT id, user_id, category_id, category_name, month, limit_amount, actual_amount, created_at
         FROM v_user_budgets
        ORDER BY month DESC, category_name`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load budgets.' });
  }
});

app.post('/api/budgets', async (req, res) => {
  const { category_id, month, limit_amount } = req.body;
  if (!category_id || !month || limit_amount == null) {
    return res.status(400).json({ error: 'category_id, month, and limit_amount are required.' });
  }
  try {
    const [result] = await req.conn.execute(
      `INSERT INTO budgets (user_id, category_id, month, limit_amount) VALUES (?, ?, ?, ?)`,
      [req.userId, category_id, month, limit_amount]
    );
    res.status(201).json({ id: result.insertId, user_id: req.userId, category_id, month, limit_amount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create budget.' });
  }
});

app.put('/api/budgets/:id', async (req, res) => {
  const { limit_amount } = req.body;
  if (limit_amount == null) {
    return res.status(400).json({ error: 'limit_amount is required.' });
  }
  try {
    const [result] = await req.conn.execute(
      `UPDATE budgets SET limit_amount = ? WHERE id = ? AND user_id = ?`,
      [limit_amount, req.params.id, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Budget not found.' });
    }
    res.json({ id: Number(req.params.id), limit_amount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update budget.' });
  }
});

app.delete('/api/budgets/:id', async (req, res) => {
  try {
    const [result] = await req.conn.execute(
      `DELETE FROM budgets WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Budget not found.' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete budget.' });
  }
});

app.listen(PORT, () => {
  console.log(`pf-tracker listening on http://localhost:${PORT}`);
});

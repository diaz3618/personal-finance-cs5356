require('dotenv').config();

const path = require('path');
const express = require('express');
const pool = require('./db');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { Webhook } = require('svix');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'CLERK_WEBHOOK_SECRET'].forEach((key) => {
  if (!process.env[key]) {
    console.error(`[startup] required env var ${key} is not set`);
    process.exit(1);
  }
});

const USER_ID = 1;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3010' }));
app.use(clerkMiddleware());

// webhookHandler defined below — registered here so express.raw() runs before express.json()
const webhookHandler = (req, res) => res.status(501).json({ error: 'Not implemented' });
app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const checkAuth = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

const resolveDbUser = async (req, res, next) => {
  try {
    const { userId: clerkUserId } = getAuth(req);
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE clerk_user_id = ?',
      [clerkUserId]
    );
    if (!rows.length) {
      console.warn(`[auth] JIT provision for clerk_user_id ${clerkUserId}`);
      const [ins] = await pool.execute(
        'INSERT IGNORE INTO users (clerk_user_id) VALUES (?)',
        [clerkUserId]
      );
      const insertedId = ins.insertId || null;
      if (!insertedId) {
        const [retry] = await pool.execute(
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
    next();
  } catch (err) {
    next(err);
  }
};

app.use('/api', checkAuth, resolveDbUser);

// --- Categories -------------------------------------------------------------

app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id AS category_id, name AS category_name, type AS category_type
         FROM categories
        WHERE user_id = ?
        ORDER BY type, name`,
      [USER_ID]
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
    const [result] = await pool.execute(
      `INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)`,
      [USER_ID, name, type]
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
    const [result] = await pool.execute(
      `UPDATE categories SET name = ?, type = ? WHERE id = ? AND user_id = ?`,
      [name, type, req.params.id, USER_ID]
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
    const [result] = await pool.execute(
      `DELETE FROM categories WHERE id = ? AND user_id = ?`,
      [req.params.id, USER_ID]
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

// --- Transactions -----------------------------------------------------------

app.get('/api/transactions', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id AS transaction_id, t.amount, t.transaction_date, t.transaction_type,
              t.notes, t.category_id, c.name AS category_name
         FROM transactions t
         JOIN categories   c ON c.id = t.category_id
        WHERE t.user_id = ?
        ORDER BY t.transaction_date DESC, t.id DESC`,
      [USER_ID]
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
    const [result] = await pool.execute(
      `INSERT INTO transactions
         (user_id, category_id, amount, transaction_date, transaction_type, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [USER_ID, categoryId, amount, date, type, notes || null]
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
    const [result] = await pool.execute(
      `UPDATE transactions
          SET amount = ?, transaction_date = ?, transaction_type = ?,
              category_id = ?, notes = ?
        WHERE id = ? AND user_id = ?`,
      [amount, date, type, categoryId, notes || null, req.params.id, USER_ID]
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

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const [result] = await pool.execute(
      `DELETE FROM transactions WHERE id = ? AND user_id = ?`,
      [req.params.id, USER_ID]
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

// --- Reports ----------------------------------------------------------------

app.get('/api/reports/monthly', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
              transaction_type,
              SUM(amount) AS total
         FROM transactions
        WHERE user_id = ?
        GROUP BY month, transaction_type
        ORDER BY month DESC, transaction_type`,
      [USER_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load monthly report.' });
  }
});

app.get('/api/reports/by-category', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.name AS category_name, c.type AS category_type, SUM(t.amount) AS total
         FROM transactions t
         JOIN categories   c ON c.id = t.category_id
        WHERE t.user_id = ?
        GROUP BY c.id
        ORDER BY total DESC`,
      [USER_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load category report.' });
  }
});

app.listen(PORT, () => {
  console.log(`pf-tracker listening on http://localhost:${PORT}`);
});

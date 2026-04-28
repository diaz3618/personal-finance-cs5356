require('dotenv').config();

const path = require('path');
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = 3000;
const USER_ID = 1;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Categories -------------------------------------------------------------

app.get('/api/categories', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT CategoryID, CategoryName, CategoryType
         FROM Categories
        WHERE UserID = ?
        ORDER BY CategoryType, CategoryName`,
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
      `INSERT INTO Categories (UserID, CategoryName, CategoryType)
       VALUES (?, ?, ?)`,
      [USER_ID, name, type]
    );
    res.status(201).json({
      CategoryID: result.insertId,
      CategoryName: name,
      CategoryType: type,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category.' });
  }
});

// --- Transactions -----------------------------------------------------------

app.get('/api/transactions', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.TransactionID, t.Amount, t.TransactionDate, t.TransactionType,
              t.Description, t.CategoryID, c.CategoryName
         FROM Transactions t
         JOIN Categories  c ON c.CategoryID = t.CategoryID
        WHERE t.UserID = ?
        ORDER BY t.TransactionDate DESC, t.TransactionID DESC`,
      [USER_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

app.post('/api/transactions', async (req, res) => {
  const { amount, date, type, categoryId, description } = req.body || {};

  if (amount == null || !date || !type || !categoryId) {
    return res.status(400).json({
      error: 'amount, date, type, and categoryId are required.',
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO Transactions
         (UserID, CategoryID, Amount, TransactionDate, TransactionType, Description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [USER_ID, categoryId, amount, date, type, description || null]
    );
    res.status(201).json({ TransactionID: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create transaction.' });
  }
});

// --- Reports ----------------------------------------------------------------

app.get('/api/reports/monthly', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DATE_FORMAT(TransactionDate, '%Y-%m') AS Month,
              TransactionType,
              SUM(Amount) AS Total
         FROM Transactions
        WHERE UserID = ?
        GROUP BY Month, TransactionType
        ORDER BY Month DESC, TransactionType`,
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
      `SELECT c.CategoryName, c.CategoryType, SUM(t.Amount) AS Total
         FROM Transactions t
         JOIN Categories  c ON c.CategoryID = t.CategoryID
        WHERE t.UserID = ?
        GROUP BY c.CategoryID
        ORDER BY Total DESC`,
      [USER_ID]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load category report.' });
  }
});

app.listen(PORT, () => {
  console.log(`Finance tracker listening on http://localhost:${PORT}`);
});

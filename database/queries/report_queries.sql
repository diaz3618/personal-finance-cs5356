-- Report queries

USE personal_finance;

-- 1. Monthly Expense Totals
SELECT
    DATE_FORMAT(t.transaction_date, '%Y-%m')  AS month,
    SUM(t.amount)                             AS total_expenses
FROM Transactions t
WHERE t.transaction_type = 'expense'
GROUP BY month
ORDER BY month;

-- 2. Monthly Income Totals
SELECT
    DATE_FORMAT(t.transaction_date, '%Y-%m')  AS month,
    SUM(t.amount)                             AS total_income
FROM Transactions t
WHERE t.transaction_type = 'income'
GROUP BY month
ORDER BY month;

-- 3. Spending by Category
SELECT
    c.category_name,
    SUM(t.amount)   AS total_spent
FROM Transactions t
JOIN Categories c ON t.category_id = c.category_id
WHERE t.transaction_type = 'expense'
GROUP BY c.category_name
ORDER BY total_spent DESC;

-- 4. Income vs Expense by Month
SELECT
    DATE_FORMAT(t.transaction_date, '%Y-%m')  AS month,
    SUM(CASE WHEN t.transaction_type = 'income'  THEN t.amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END) AS total_expenses,
    SUM(CASE WHEN t.transaction_type = 'income'  THEN t.amount ELSE 0 END)
  - SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END) AS net_savings
FROM Transactions t
GROUP BY month
ORDER BY month;

-- 5. Transactions by user - set @target_user_id before running
SET @target_user_id = 1;

SELECT
    t.transaction_id,
    u.full_name,
    c.category_name,
    t.transaction_type,
    t.amount,
    t.transaction_date,
    t.description
FROM Transactions t
JOIN Users      u ON t.user_id     = u.user_id
JOIN Categories c ON t.category_id = c.category_id
WHERE t.user_id = @target_user_id
ORDER BY t.transaction_date;

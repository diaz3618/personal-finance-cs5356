USE personal_finance;

SELECT
    DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
    SUM(t.amount) AS total_expenses
FROM transactions t
WHERE t.transaction_type = 'expense'
GROUP BY month
ORDER BY month;

SELECT
    DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
    SUM(t.amount) AS total_income
FROM transactions t
WHERE t.transaction_type = 'income'
GROUP BY month
ORDER BY month;

SET @target_user_id = 1;

SELECT
    c.name AS category_name,
    SUM(t.amount) AS total_spent
FROM transactions t
JOIN categories c ON t.category_id = c.id
WHERE t.transaction_type = 'expense'
  AND t.user_id = @target_user_id
GROUP BY c.name
ORDER BY total_spent DESC;

SELECT
    DATE_FORMAT(t.transaction_date, '%Y-%m') AS month,
    SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END) AS total_income,
    SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END) AS total_expenses,
    SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END)
  - SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END) AS net_savings
FROM transactions t
GROUP BY month
ORDER BY month;

SELECT
    t.id AS transaction_id,
    COALESCE(u.display_name, u.email, u.clerk_user_id) AS user_label,
    c.name AS category_name,
    t.transaction_type,
    t.amount,
    t.transaction_date,
    t.notes
FROM transactions t
JOIN users u ON t.user_id = u.id
JOIN categories c ON t.category_id = c.id
WHERE t.user_id = @target_user_id
ORDER BY t.transaction_date;

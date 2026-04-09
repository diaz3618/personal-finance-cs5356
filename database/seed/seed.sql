-- Seed data

USE personal_finance;

-- Users
INSERT INTO Users (full_name, email) VALUES
('Alice Johnson',  'alice@example.com'),
('Bob Smith',      'bob@example.com');

-- Categories (user-specific)
-- Alice's categories
INSERT INTO Categories (user_id, category_name, category_type) VALUES
(1, 'Salary',          'income'),
(1, 'Freelance',       'income'),
(1, 'Groceries',       'expense'),
(1, 'Rent',            'expense'),
(1, 'Entertainment',   'expense');

-- Bob's categories
INSERT INTO Categories (user_id, category_name, category_type) VALUES
(2, 'Salary',          'income'),
(2, 'Dining Out',      'expense'),
(2, 'Utilities',       'expense'),
(2, 'Transportation',  'expense');

-- Transactions
-- Alice – January 2026
INSERT INTO Transactions (user_id, category_id, amount, transaction_date, transaction_type, description) VALUES
(1, 1, 4500.00, '2026-01-01', 'income',  'January salary'),
(1, 2,  800.00, '2026-01-10', 'income',  'Logo design project'),
(1, 3,  120.50, '2026-01-05', 'expense', 'Weekly groceries'),
(1, 4, 1200.00, '2026-01-01', 'expense', 'Monthly rent'),
(1, 5,   45.00, '2026-01-15', 'expense', 'Movie tickets');

-- Alice – February 2026
INSERT INTO Transactions (user_id, category_id, amount, transaction_date, transaction_type, description) VALUES
(1, 1, 4500.00, '2026-02-01', 'income',  'February salary'),
(1, 3,  135.75, '2026-02-07', 'expense', 'Weekly groceries'),
(1, 4, 1200.00, '2026-02-01', 'expense', 'Monthly rent'),
(1, 5,   60.00, '2026-02-20', 'expense', 'Concert tickets');

-- Bob – January 2026
INSERT INTO Transactions (user_id, category_id, amount, transaction_date, transaction_type, description) VALUES
(2, 6, 3800.00, '2026-01-01', 'income',  'January salary'),
(2, 7,   55.00, '2026-01-08', 'expense', 'Dinner with friends'),
(2, 8,  150.00, '2026-01-12', 'expense', 'Electric bill'),
(2, 9,   75.00, '2026-01-20', 'expense', 'Gas and tolls');

-- Bob – February 2026
INSERT INTO Transactions (user_id, category_id, amount, transaction_date, transaction_type, description) VALUES
(2, 6, 3800.00, '2026-02-01', 'income',  'February salary'),
(2, 7,   40.00, '2026-02-10', 'expense', 'Lunch out'),
(2, 8,  145.00, '2026-02-14', 'expense', 'Electric bill'),
(2, 9,   80.00, '2026-02-22', 'expense', 'Gas');

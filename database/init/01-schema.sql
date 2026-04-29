-- Runs from docker-entrypoint-initdb.d; database name set by MYSQL_DATABASE

CREATE TABLE users (
    id              INT             NOT NULL AUTO_INCREMENT,
    clerk_user_id   VARCHAR(255)    NULL,
    email           VARCHAR(255)    NULL,
    display_name    VARCHAR(100)    NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_clerk_id (clerk_user_id)
) ENGINE=InnoDB;

CREATE TABLE categories (
    id              INT             NOT NULL AUTO_INCREMENT,
    user_id         INT             NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    type            ENUM('income', 'expense') NOT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_categories_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_categories_user_name
        UNIQUE (user_id, name)
) ENGINE=InnoDB;

CREATE INDEX idx_categories_user ON categories(user_id);

CREATE TABLE transactions (
    id               INT             NOT NULL AUTO_INCREMENT,
    user_id          INT             NOT NULL,
    category_id      INT             NOT NULL,
    amount           DECIMAL(10,2)   NOT NULL,
    transaction_type ENUM('income', 'expense') NOT NULL,
    transaction_date DATE            NOT NULL,
    notes            VARCHAR(255)    NULL,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_transactions_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_transactions_amount
        CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_category  ON transactions(category_id);

CREATE TABLE budgets (
    id              INT             NOT NULL AUTO_INCREMENT,
    user_id         INT             NOT NULL,
    category_id     INT             NOT NULL,
    month           DATE            NOT NULL,
    limit_amount    DECIMAL(10,2)   NOT NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_budgets_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_budgets_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_budgets_limit
        CHECK (limit_amount > 0),

    CONSTRAINT uq_budgets_user_category_month
        UNIQUE (user_id, category_id, month)
) ENGINE=InnoDB;

CREATE INDEX idx_budgets_user ON budgets(user_id);

CREATE TABLE budget_alerts (
    id              INT             NOT NULL AUTO_INCREMENT,
    user_id         INT             NOT NULL,
    category_id     INT             NOT NULL,
    month           DATE            NOT NULL,
    actual_amount   DECIMAL(10,2)   NOT NULL,
    limit_amount    DECIMAL(10,2)   NOT NULL,
    triggered_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_budget_alerts_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_budget_alerts_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE transaction_audit_log (
    id              INT             NOT NULL AUTO_INCREMENT,
    transaction_id  INT             NULL,
    action          ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    old_amount      DECIMAL(10,2)   NULL,
    new_amount      DECIMAL(10,2)   NULL,
    changed_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by      INT             NULL,

    PRIMARY KEY (id),

    CONSTRAINT fk_audit_log_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_audit_log_transaction ON transaction_audit_log(transaction_id);

DELIMITER //

CREATE TRIGGER trg_check_type_match_insert
BEFORE INSERT ON transactions
FOR EACH ROW
BEGIN
    DECLARE cat_type ENUM('income', 'expense');

    SELECT type INTO cat_type
    FROM categories
    WHERE id = NEW.category_id;

    IF cat_type <> NEW.transaction_type THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'transaction_type must match the category type';
    END IF;
END //

CREATE TRIGGER trg_check_type_match_update
BEFORE UPDATE ON transactions
FOR EACH ROW
BEGIN
    DECLARE cat_type ENUM('income', 'expense');

    SELECT type INTO cat_type
    FROM categories
    WHERE id = NEW.category_id;

    IF cat_type <> NEW.transaction_type THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'transaction_type must match the category type';
    END IF;
END //

DELIMITER ;

-- RLS: restricted application account (Phase 03)
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'pf_app_2026';

-- Helper function: MySQL views cannot reference session variables directly (ERROR 1351).
-- This wrapper function is SECURITY DEFINER so that app_user (which executes the views)
-- can call it even though it has no direct access to @current_user_id as a raw expression.
CREATE DEFINER=`root`@`localhost` FUNCTION current_app_user_id()
  RETURNS INT
  NOT DETERMINISTIC
  NO SQL
  SQL SECURITY DEFINER
RETURN @current_user_id;

-- Security-definer views for row-level isolation via current_app_user_id() session function
CREATE OR REPLACE DEFINER=`root`@`localhost` SQL SECURITY DEFINER
VIEW v_user_transactions AS
SELECT id, user_id, category_id, amount, transaction_type, transaction_date, notes, created_at
  FROM transactions
 WHERE user_id = current_app_user_id()
WITH LOCAL CHECK OPTION;

CREATE OR REPLACE DEFINER=`root`@`localhost` SQL SECURITY DEFINER
VIEW v_user_categories AS
SELECT id, user_id, name, type, created_at
  FROM categories
 WHERE user_id = current_app_user_id()
WITH LOCAL CHECK OPTION;

CREATE OR REPLACE DEFINER=`root`@`localhost` SQL SECURITY DEFINER
VIEW v_user_budgets AS
SELECT b.id, b.user_id, b.category_id, c.name AS category_name,
       b.month, b.limit_amount,
       COALESCE(SUM(t.amount), 0) AS actual_amount,
       b.created_at
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
  LEFT JOIN transactions t
         ON t.category_id = b.category_id
        AND t.user_id = b.user_id
        AND t.transaction_type = 'expense'
        AND DATE_FORMAT(t.transaction_date, '%Y-%m') = DATE_FORMAT(b.month, '%Y-%m')
 WHERE b.user_id = current_app_user_id()
 GROUP BY b.id, b.user_id, b.category_id, c.name, b.month, b.limit_amount, b.created_at;

CREATE OR REPLACE DEFINER=`root`@`localhost` SQL SECURITY DEFINER
VIEW v_transaction_detail AS
SELECT t.id AS transaction_id, t.user_id,
       t.amount, t.transaction_type, t.transaction_date, t.notes,
       c.id AS category_id, c.name AS category_name, c.type AS category_type,
       u.email, u.display_name
  FROM transactions t
  JOIN categories c ON c.id = t.category_id
  JOIN users      u ON u.id = t.user_id;

-- Grants: app_user reads/writes through views; direct table grants only where view is non-updatable
GRANT SELECT ON personal_finance.v_user_transactions   TO 'app_user'@'%';
GRANT SELECT ON personal_finance.v_user_categories     TO 'app_user'@'%';
GRANT SELECT ON personal_finance.v_user_budgets        TO 'app_user'@'%';
GRANT SELECT ON personal_finance.v_transaction_detail  TO 'app_user'@'%';
GRANT INSERT, UPDATE, DELETE ON personal_finance.v_user_transactions TO 'app_user'@'%';
GRANT INSERT, UPDATE, DELETE ON personal_finance.v_user_categories   TO 'app_user'@'%';
-- v_user_budgets is a join/aggregate view (non-updatable); grant direct table access for writes
GRANT INSERT, UPDATE, DELETE ON personal_finance.budgets             TO 'app_user'@'%';

FLUSH PRIVILEGES;

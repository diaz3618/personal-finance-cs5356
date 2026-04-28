-- Runs from docker-entrypoint-initdb.d; database name set by MYSQL_DATABASE

CREATE TABLE users (
    id              INT             NOT NULL AUTO_INCREMENT,
    clerk_user_id   VARCHAR(255)    NULL,
    email           VARCHAR(255)    NOT NULL,
    display_name    VARCHAR(100)    NOT NULL,
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

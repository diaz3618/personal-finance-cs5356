-- Runs from docker-entrypoint-initdb.d; database name set by MYSQL_DATABASE

-- Users
CREATE TABLE Users (
    user_id       INT            NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(100)   NOT NULL,
    email         VARCHAR(255)   NOT NULL,

    PRIMARY KEY (user_id),
    UNIQUE  KEY uq_users_email (email)
) ENGINE=InnoDB;

-- Categories
CREATE TABLE Categories (
    category_id   INT            NOT NULL AUTO_INCREMENT,
    user_id       INT            NOT NULL,
    category_name VARCHAR(100)   NOT NULL,
    category_type ENUM('income', 'expense') NOT NULL,

    PRIMARY KEY (category_id),

    CONSTRAINT fk_categories_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT chk_category_type
        CHECK (category_type IN ('income', 'expense'))
) ENGINE=InnoDB;

-- Transactions
CREATE TABLE Transactions (
    transaction_id   INT            NOT NULL AUTO_INCREMENT,
    user_id          INT            NOT NULL,
    category_id      INT            NOT NULL,
    amount           DECIMAL(10,2)  NOT NULL,
    transaction_date DATE           NOT NULL,
    transaction_type ENUM('income', 'expense') NOT NULL,
    description      VARCHAR(255)   NULL,

    PRIMARY KEY (transaction_id),

    CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_transactions_category
        FOREIGN KEY (category_id) REFERENCES Categories(category_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_amount_positive
        CHECK (amount > 0),

    CONSTRAINT chk_transaction_type
        CHECK (transaction_type IN ('income', 'expense'))
) ENGINE=InnoDB;

-- Triggers: enforce transaction_type / category_type match
DELIMITER //

CREATE TRIGGER trg_check_type_match_insert
BEFORE INSERT ON Transactions
FOR EACH ROW
BEGIN
    DECLARE cat_type ENUM('income', 'expense');

    SELECT category_type INTO cat_type
    FROM Categories
    WHERE category_id = NEW.category_id;

    IF cat_type <> NEW.transaction_type THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'transaction_type must match the category_type of the assigned category';
    END IF;
END //

CREATE TRIGGER trg_check_type_match_update
BEFORE UPDATE ON Transactions
FOR EACH ROW
BEGIN
    DECLARE cat_type ENUM('income', 'expense');

    SELECT category_type INTO cat_type
    FROM Categories
    WHERE category_id = NEW.category_id;

    IF cat_type <> NEW.transaction_type THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'transaction_type must match the category_type of the assigned category';
    END IF;
END //

DELIMITER ;

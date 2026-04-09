# Schema Notes

## Overview

This database lets users track personal income and expense transactions,
organize them by category, and run summary reports via SQL.

</br>

## Diagrams

[ER Diagram](./diagrams/er_diagram.md)

[EER Diagram](./diagrams/eer_diagram.md)

</br>

## Tables

### 1. `Users`

| Column    | Type         | Constraints          |
|-----------|--------------|----------------------|
| user_id   | INT (AI)     | PRIMARY KEY          |
| full_name | VARCHAR(100) | NOT NULL             |
| email     | VARCHAR(255) | NOT NULL, UNIQUE     |

- Each user has a unique email address.

### 2. `Categories`

| Column        | Type                          | Constraints               |
|---------------|-------------------------------|---------------------------|
| category_id   | INT (AI)                      | PRIMARY KEY               |
| user_id       | INT                           | NOT NULL, FK → Users      |
| category_name | VARCHAR(100)                  | NOT NULL                  |
| category_type | ENUM('income', 'expense')     | NOT NULL, CHECK           |

- Categories belong to a specific user (each user defines their own).
- `category_type` is restricted to `'income'` or `'expense'`.
- Deleting a user cascades to their categories.

### 3. `Transactions`

| Column           | Type                          | Constraints                  |
|------------------|-------------------------------|------------------------------|
| transaction_id   | INT (AI)                      | PRIMARY KEY                  |
| user_id          | INT                           | NOT NULL, FK → Users         |
| category_id      | INT                           | NOT NULL, FK → Categories    |
| amount           | DECIMAL(10,2)                 | NOT NULL, CHECK (> 0)        |
| transaction_date | DATE                          | NOT NULL                     |
| transaction_type | ENUM('income', 'expense')     | NOT NULL, CHECK              |
| description      | VARCHAR(255)                  | NULL (optional)              |

- `amount` must be greater than zero.
- `transaction_type` must be `'income'` or `'expense'`.
- Deleting a user cascades to their transactions.
- Deleting a category that still has transactions is blocked (`ON DELETE RESTRICT`).

</br>

## Constraints Summary

| Constraint Kind | Where Applied                              |
|-----------------|--------------------------------------------|
| PRIMARY KEY     | `user_id`, `category_id`, `transaction_id` |
| FOREIGN KEY     | Categories → Users, Transactions → Users, Transactions → Categories |
| NOT NULL        | All columns except `description`           |
| UNIQUE          | `Users.email`                              |
| CHECK           | `amount > 0`, `category_type IN (...)`, `transaction_type IN (...)` |
| ENUM            | `category_type`, `transaction_type` (enforced at the type level too) |

</br>

## Type-Mismatch Prevention (Trigger)

MySQL CHECK constraints cannot reference other tables. To enforce that a
transaction's `transaction_type` matches its category's `category_type`, two
`BEFORE` triggers exist:

- **`trg_check_type_match_insert`** - fires before INSERT on `Transactions`.
- **`trg_check_type_match_update`** - fires before UPDATE on `Transactions`.

If the types do not match, the trigger raises `SQLSTATE '45000'` with a
descriptive error message and the operation is rejected.

</br>

## Design Decisions

1. **ENUM + CHECK** - Using ENUM restricts values at the column-type level;
   the CHECK constraint provides an additional explicit safeguard.
2. **ON DELETE CASCADE vs RESTRICT** - Deleting a user removes all their data.
   Deleting a category with existing transactions is blocked to prevent
   accidental data loss.
3. **Triggers over stored procedures** - Triggers fire automatically, so the
   mismatch rule is enforced transparently without requiring application logic.
4. **User-scoped categories** - Each user defines their own categories, so
   "Groceries" for Alice is independent of "Groceries" for Bob.

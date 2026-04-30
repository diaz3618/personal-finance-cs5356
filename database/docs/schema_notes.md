# Schema Notes

Schema: `personal_finance` (MySQL 8.0). Six base tables, four security-definer
views, and a row-level security mechanism backed by a session variable. The
canonical DDL lives in `../init/01-schema.sql`.

## Diagrams

- [ER Diagram](./diagrams/er_diagram.md)
- [EER Diagram](./diagrams/eer_diagram.md) (constraints, triggers, views)

## Tables

### `users`

| Column          | Type            | Constraints                          |
|-----------------|-----------------|--------------------------------------|
| id              | INT (AI)        | PRIMARY KEY                          |
| clerk_user_id   | VARCHAR(64)     | NOT NULL, UNIQUE                     |
| email           | VARCHAR(255)    | NOT NULL, UNIQUE                     |
| display_name    | VARCHAR(120)    | NULL                                 |
| created_at      | TIMESTAMP       | NOT NULL, DEFAULT CURRENT_TIMESTAMP  |

`clerk_user_id` is the external Clerk subject identifier; the application looks
up the local `id` from this value via Redis cache and the `current_app_user_id()`
helper. Both `clerk_user_id` and `email` are unique, giving three candidate keys.

### `categories`

| Column      | Type                        | Constraints                                  |
|-------------|-----------------------------|----------------------------------------------|
| id          | INT (AI)                    | PRIMARY KEY                                  |
| user_id     | INT                         | NOT NULL, FK -> users(id) ON DELETE CASCADE  |
| name        | VARCHAR(100)                | NOT NULL                                     |
| type        | ENUM('income', 'expense')   | NOT NULL                                     |
| created_at  | TIMESTAMP                   | NOT NULL, DEFAULT CURRENT_TIMESTAMP          |

`uq_categories_user_name` enforces UNIQUE `(user_id, name)` so each user defines
their own namespace of category names. Deleting a user cascades to their
categories.

### `transactions`

| Column            | Type                        | Constraints                                     |
|-------------------|-----------------------------|-------------------------------------------------|
| id                | INT (AI)                    | PRIMARY KEY                                     |
| user_id           | INT                         | NOT NULL, FK -> users(id) ON DELETE CASCADE     |
| category_id       | INT                         | NOT NULL, FK -> categories(id) ON DELETE RESTRICT |
| amount            | DECIMAL(12,2)               | NOT NULL, CHECK (amount > 0)                    |
| transaction_type  | ENUM('income', 'expense')   | NOT NULL                                        |
| transaction_date  | DATE                        | NOT NULL                                        |
| notes             | VARCHAR(255)                | NULL                                            |
| created_at        | TIMESTAMP                   | NOT NULL, DEFAULT CURRENT_TIMESTAMP             |

The two type-match triggers (`trg_check_type_match_insert`,
`trg_check_type_match_update`) raise SQLSTATE '45000' when
`transaction_type <> categories.type` for the referenced category. ON DELETE
RESTRICT on the category FK prevents removing a category that still has
transactions.

### `budgets`

| Column        | Type           | Constraints                                                  |
|---------------|----------------|--------------------------------------------------------------|
| id            | INT (AI)       | PRIMARY KEY                                                  |
| user_id       | INT            | NOT NULL, FK -> users(id) ON DELETE CASCADE                  |
| category_id   | INT            | NOT NULL, FK -> categories(id) ON DELETE CASCADE             |
| month         | DATE           | NOT NULL (first-of-month convention)                         |
| limit_amount  | DECIMAL(12,2)  | NOT NULL, CHECK (limit_amount > 0)                           |
| created_at    | TIMESTAMP      | NOT NULL, DEFAULT CURRENT_TIMESTAMP                          |

`uq_budgets_user_category_month` enforces UNIQUE `(user_id, category_id, month)`
so a user can have at most one budget per category per month.

### `budget_alerts`

| Column         | Type           | Constraints                                                  |
|----------------|----------------|--------------------------------------------------------------|
| id             | INT (AI)       | PRIMARY KEY                                                  |
| user_id        | INT            | NOT NULL, FK -> users(id) ON DELETE CASCADE                  |
| category_id    | INT            | NOT NULL, FK -> categories(id) ON DELETE CASCADE             |
| month          | DATE           | NOT NULL                                                     |
| actual_amount  | DECIMAL(12,2)  | NOT NULL                                                     |
| limit_amount   | DECIMAL(12,2)  | NOT NULL (snapshot from `budgets` at trigger time)           |
| triggered_at   | TIMESTAMP      | NOT NULL, DEFAULT CURRENT_TIMESTAMP                          |

Append-only audit-style table written by `usp_apply_budget_alert`. The
`limit_amount` snapshot is intentional denormalization documented in
[normalization.md](./normalization.md).

### `transaction_audit_log`

| Column           | Type                                | Constraints                                            |
|------------------|-------------------------------------|--------------------------------------------------------|
| id               | INT (AI)                            | PRIMARY KEY                                            |
| transaction_id   | INT                                 | NULL, FK -> transactions(id) ON DELETE SET NULL        |
| action           | ENUM('INSERT','UPDATE','DELETE')    | NOT NULL                                               |
| old_amount       | DECIMAL(12,2)                       | NULL                                                   |
| new_amount       | DECIMAL(12,2)                       | NULL                                                   |
| changed_at       | TIMESTAMP                           | NOT NULL, DEFAULT CURRENT_TIMESTAMP                    |
| changed_by       | INT                                 | NULL (owning user_id captured by trigger)              |

Populated by the `trg_log_tx_changes_*` trigger family. The DELETE trigger
fires BEFORE the row is removed so the audit row captures `old_amount` and
`changed_by` while the source row still exists; ON DELETE SET NULL on
`transaction_id` then preserves the audit row after the source row is gone.

## Constraints Summary

| Constraint kind | Where it is applied                                                                                  |
|-----------------|-------------------------------------------------------------------------------------------------------|
| PRIMARY KEY     | `id` on every base table                                                                              |
| FOREIGN KEY     | `categories.user_id`, `transactions.user_id`, `transactions.category_id`, `budgets.user_id`, `budgets.category_id`, `budget_alerts.user_id`, `budget_alerts.category_id`, `transaction_audit_log.transaction_id` |
| UNIQUE          | `users.clerk_user_id`, `users.email`, `(categories.user_id, categories.name)`, `(budgets.user_id, budgets.category_id, budgets.month)` |
| CHECK           | `transactions.amount > 0`, `budgets.limit_amount > 0`                                                 |
| ENUM            | `categories.type`, `transactions.transaction_type`, `transaction_audit_log.action`                    |
| Trigger-enforced| `transactions.transaction_type = categories.type` (cross-table CHECK substitute)                      |

## Row-Level Security

The application connects as `app_user` (a non-DEFINER role) and calls
`SET @current_user_id = ?` immediately after acquiring a connection. The four
views (`v_user_transactions`, `v_user_categories`, `v_user_budgets`,
`v_transaction_detail`) are declared `SQL SECURITY DEFINER` and filter on
`current_app_user_id()`, which returns `@current_user_id`. All `SELECT`s in
the application go through the views, so a client cannot read another user's
rows even if a query is malformed or constructed dynamically.

The wrapper function exists because MySQL view definitions cannot reference
user-defined session variables directly (ERROR 1351).

## Design Decisions

- **Surrogate `id` keys.** Every table has a single-column auto-increment PK
  for stable joins; natural keys (`clerk_user_id`, `email`,
  `(user_id, name)`, `(user_id, category_id, month)`) are enforced as UNIQUE
  candidate keys.
- **ENUM + trigger over cross-table CHECK.** ENUM bounds the type column at
  the type level. The cross-row consistency rule (transaction type matches
  category type) is enforced by the two BEFORE triggers because MySQL CHECK
  constraints cannot reference other tables.
- **CASCADE versus RESTRICT.** Deleting a user cascades to their owned data.
  Deleting a category that still has transactions is blocked, so spending
  history is never silently destroyed by a category cleanup.
- **Audit-style snapshots.** `budget_alerts.limit_amount` and
  `transaction_audit_log.old_amount`/`new_amount` are stored redundantly so
  historical events remain accurate after later edits to the source rows.
- **Denormalized `transaction_type`.** Stored on `transactions` to avoid a
  join in reporting queries; the trigger pair keeps it consistent with
  `categories.type`. The trade-off is documented in
  [normalization.md](./normalization.md).

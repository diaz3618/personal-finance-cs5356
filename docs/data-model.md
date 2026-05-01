# Data Model

The `personal_finance` schema stores user accounts, categories, transactions,
budgets, budget alerts, and audit history. It also exposes row-scoped views for
the application layer and a helper view for report-oriented joins.

## Base Tables

### `users`

Stores the local account row associated with a Clerk identity.

| Column | Type | Notes |
|------|------|------|
| `id` | `INT` | Primary key, auto-increment |
| `clerk_user_id` | `VARCHAR(255)` | Nullable, unique |
| `email` | `VARCHAR(255)` | Nullable, unique |
| `display_name` | `VARCHAR(100)` | Nullable |
| `created_at` | `TIMESTAMP` | Defaults to `CURRENT_TIMESTAMP` |

### `categories`

Stores income and expense categories owned by one user.

| Column | Type | Notes |
|------|------|------|
| `id` | `INT` | Primary key, auto-increment |
| `user_id` | `INT` | FK to `users(id)`, `ON DELETE CASCADE` |
| `name` | `VARCHAR(100)` | Required |
| `type` | `ENUM('income', 'expense')` | Required |
| `created_at` | `TIMESTAMP` | Defaults to `CURRENT_TIMESTAMP` |

`UNIQUE (user_id, name)` prevents duplicate category names for the same user.

### `transactions`

Stores individual income and expense entries.

| Column | Type | Notes |
|------|------|------|
| `id` | `INT` | Primary key, auto-increment |
| `user_id` | `INT` | FK to `users(id)`, `ON DELETE CASCADE` |
| `category_id` | `INT` | FK to `categories(id)`, `ON DELETE RESTRICT` |
| `amount` | `DECIMAL(10,2)` | Required, positive |
| `transaction_type` | `ENUM('income', 'expense')` | Required |
| `transaction_date` | `DATE` | Required |
| `notes` | `VARCHAR(255)` | Nullable |
| `created_at` | `TIMESTAMP` | Defaults to `CURRENT_TIMESTAMP` |

`transaction_type` is stored on the row even though it can be derived from the
category. That duplication is intentional. It keeps common reporting queries
simple, and the trigger pair prevents drift from `categories.type`.

### `budgets`

Stores one monthly limit per user and category.

| Column | Type | Notes |
|------|------|------|
| `id` | `INT` | Primary key, auto-increment |
| `user_id` | `INT` | FK to `users(id)`, `ON DELETE CASCADE` |
| `category_id` | `INT` | FK to `categories(id)`, `ON DELETE CASCADE` |
| `month` | `DATE` | First-of-month convention |
| `limit_amount` | `DECIMAL(10,2)` | Required, positive |
| `created_at` | `TIMESTAMP` | Defaults to `CURRENT_TIMESTAMP` |

`UNIQUE (user_id, category_id, month)` allows only one budget row per month
for the same user and category.

### `budget_alerts`

Stores the budget state captured when spending crosses a monthly limit.

| Column | Type | Notes |
|------|------|------|
| `id` | `INT` | Primary key, auto-increment |
| `user_id` | `INT` | FK to `users(id)`, `ON DELETE CASCADE` |
| `category_id` | `INT` | FK to `categories(id)`, `ON DELETE CASCADE` |
| `month` | `DATE` | Required |
| `actual_amount` | `DECIMAL(10,2)` | Required |
| `limit_amount` | `DECIMAL(10,2)` | Required snapshot value |
| `triggered_at` | `TIMESTAMP` | Defaults to `CURRENT_TIMESTAMP` |

The table keeps one snapshot row per `(user_id, category_id, month)`.

### `transaction_audit_log`

Stores immutable audit rows for transaction inserts, updates, and deletes.

| Column | Type | Notes |
|------|------|------|
| `id` | `INT` | Primary key, auto-increment |
| `transaction_id` | `INT` | Nullable FK to `transactions(id)`, `ON DELETE SET NULL` |
| `action` | `ENUM('INSERT','UPDATE','DELETE')` | Required |
| `old_amount` | `DECIMAL(10,2)` | Nullable |
| `new_amount` | `DECIMAL(10,2)` | Nullable |
| `changed_at` | `TIMESTAMP` | Defaults to `CURRENT_TIMESTAMP` |
| `changed_by` | `INT` | Nullable captured user id |

The audit table keeps history even after the source transaction is removed.

## Row-Scoped Views

Authenticated application traffic uses these security-definer views:

- `v_user_transactions`
- `v_user_categories`
- `v_user_budgets`

Each one filters through `current_app_user_id()`, which reads the
`@current_user_id` session variable set by the application before the query
runs.

`v_transaction_detail` is also a security-definer view, but it exists mostly as
a joined helper for reporting queries rather than as the main row-isolation
boundary.

## Constraint Strategy

The schema relies on:

- foreign keys for ownership and deletion rules
- unique keys for user-scoped names and monthly uniqueness
- check constraints for positive numeric fields
- enum domains for constrained type columns
- triggers for cross-table validation that MySQL checks cannot express directly

## Design Trade-Offs

The clearest trade-off is `transactions.transaction_type`. It could be derived
through `category_id`, but keeping it on the row makes reporting queries and
windowed summaries easier to write and inspect. The trigger pair turns that
duplication into an enforced rule instead of an application convention.

## Related Docs

- [System Overview](./system-overview.md)
- [Database Workflows](./database-workflows.md)
- [Technology Choices](./technology-choices.md)

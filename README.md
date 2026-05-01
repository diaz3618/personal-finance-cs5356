# pf-tracker

`pf-tracker` is a personal finance application backed by a MySQL 8.0 schema
that owns much of the business logic. The database includes stored
procedures, functions, triggers, scheduled events, window functions, CTEs,
security-definer views, and connection-scoped row filtering. The web layer
exists to exercise those database objects through ordinary requests.

## Prerequisites

- Node.js 22 or newer
- Docker and Docker Compose v2
- A Clerk account with `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and
  `CLERK_WEBHOOK_SECRET` available
- MySQL 8.0 ships inside the Compose stack — no host install needed

## Local Setup

```
git clone https://github.com/diaz3618/personal-finance-cs5356
cp .env.example .env       # fill in Clerk keys and (optional) ngrok values
cd infra
docker compose up --build
```

The Nginx proxy listens on `http://localhost`. MySQL is reachable from the host
on `localhost:3306`. Redis stays inside the Compose network and is consumed by
the app container only.

## Architecture

The Compose stack has four services. Nginx fronts the browser traffic, serves
the static files in `app/public/`, and forwards `/api/*` to the Node.js +
Express 5 process on port 3000. The application layer stays thin: it validates
input, opens a pooled connection as `app_user`, sets `@current_user_id`, and
then calls a stored program or reads through a security-definer view. MySQL
owns the `personal_finance` schema and handles the transactional work. Redis 7
caches the Clerk-user-id to local-user-id lookup so the auth middleware does
not need to hit MySQL on every request. Clerk provides JWT validation for
`/api/*`, and a Svix-signed webhook path keeps the `users` table aligned with
`user.created` and `user.deleted` events.

## API Reference

| Method | Route | Auth | DB Object / Notes |
|--------|-------|------|-------------------|
| POST   | /api/webhooks/clerk           | Svix signature | Syncs `user.created` and `user.deleted` to `users` |
| GET    | /api/auth/me                  | JWT | Returns the authenticated row from `users` |
| GET    | /api/dashboard/summary        | JWT | Calls `fn_net_balance()` and `fn_days_in_period()` |
| GET    | /api/dashboard/running-balance| JWT | `SUM(amount) OVER (ORDER BY transaction_date, id)` window |
| GET    | /api/categories               | JWT | Reads `v_user_categories` |
| POST   | /api/categories               | JWT | Insert through `v_user_categories` |
| PUT    | /api/categories/:id           | JWT | Update through `v_user_categories` |
| DELETE | /api/categories/:id           | JWT | Delete through `v_user_categories`; `RESTRICT` FK blocks if transactions exist |
| GET    | /api/transactions             | JWT | Reads `v_user_transactions` joined with `v_user_categories` |
| POST   | /api/transactions             | JWT | Insert through `v_user_transactions`; `trg_check_type_match_insert` fires |
| PUT    | /api/transactions/:id         | JWT | Update through `v_user_transactions`; `trg_check_type_match_update` fires |
| PUT    | /api/transactions/:id/category| JWT | Calls `usp_transfer_category()` — type check, transactional |
| DELETE | /api/transactions/:id         | JWT | Delete through `v_user_transactions`; `trg_log_tx_changes_delete` fires |
| GET    | /api/reports/monthly          | JWT | Calls `usp_monthly_summary()` — explicit cursor and SQLEXCEPTION handler |
| GET    | /api/reports/by-category      | JWT | Aggregation over `v_user_transactions` joined with `v_user_categories` |
| GET    | /api/reports/category-rank    | JWT | `RANK() OVER (ORDER BY SUM(amount) DESC)` window |
| GET    | /api/export/transactions      | JWT | CTE-based query streamed as CSV |
| GET    | /api/budgets                  | JWT | Reads `v_user_budgets` |
| POST   | /api/budgets                  | JWT | Insert into `budgets`; `UNIQUE(user_id, category_id, month)` enforced |
| PUT    | /api/budgets/:id              | JWT | Update `limit_amount` on `budgets` |
| DELETE | /api/budgets/:id              | JWT | Delete from `budgets` |

## Database Objects

### Stored Programs

| Object | Type | Description |
|--------|------|-------------|
| `usp_monthly_summary`            | Procedure | Aggregates income and expense per category for a given user, year, and month using an explicit cursor with a `DECLARE HANDLER FOR SQLEXCEPTION` block |
| `usp_apply_budget_alert`         | Procedure | Compares actual spend to each budget limit and writes into `budget_alerts`; uses `SAVEPOINT sp_budget_check` so a single bad row does not abort the batch |
| `usp_transfer_category`          | Procedure | Re-categorizes a transaction; validates that the target category type matches and raises `SIGNAL SQLSTATE '45000'` on mismatch; wraps the work in an explicit transaction |
| `fn_net_balance`                 | Function  | Returns a `DECIMAL(10,2)` net balance (income minus expense) for a user |
| `fn_days_in_period`              | Function  | Returns the inclusive day count between two dates |
| `current_app_user_id`            | Function  | Reads `@current_user_id` and is used by the security-definer views to filter rows |
| `trg_check_type_match_insert`    | Trigger   | `BEFORE INSERT` on `transactions` — rejects rows whose type does not match the parent category type |
| `trg_check_type_match_update`    | Trigger   | `BEFORE UPDATE` on `transactions` — same check on the post-update row |
| `trg_log_tx_changes_insert`      | Trigger   | `AFTER INSERT` on `transactions` — writes an `INSERT` row to `transaction_audit_log` |
| `trg_log_tx_changes_update`      | Trigger   | `AFTER UPDATE` on `transactions` — writes an `UPDATE` row capturing old and new values |
| `trg_log_tx_changes_delete`      | Trigger   | `BEFORE DELETE` on `transactions` — captures the row in `transaction_audit_log` before it disappears |
| `evt_monthly_budget_snapshot`    | Event     | Runs monthly; calls `usp_apply_budget_alert` for every user |
| `evt_purge_old_alerts`           | Event     | Runs weekly; deletes `budget_alerts` rows older than twelve months |

### Security-Definer Views

Each view runs with `DEFINER` privileges and filters rows through
`current_app_user_id()`, which reads the per-connection `@current_user_id`
session variable set by the application middleware. The `app_user` MySQL
account has no direct grants on the underlying tables; it reaches data through
these views and the stored programs above.

| View                  | Filters By              | Purpose |
|-----------------------|-------------------------|---------|
| `v_user_transactions` | `@current_user_id`      | Transactions for the authenticated user only |
| `v_user_categories`   | `@current_user_id`      | Categories for the authenticated user only |
| `v_user_budgets`      | `@current_user_id`      | Budgets joined with category name and the running actual spend |
| `v_transaction_detail`| joined helper view      | Transactions joined with category and user, available for report-style queries |

## Documentation

The canonical documentation lives in `docs/`:

- `docs/system-overview.md`
- `docs/data-model.md`
- `docs/database-workflows.md`
- `docs/technology-choices.md`

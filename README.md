# pf-tracker

`pf-tracker` is a personal finance app built around a MySQL 8.0 schema. The
browser and API are deliberately small. Most of the rules that matter live in
the database: row-scoped views, stored procedures, functions, triggers,
scheduled events, window queries, and CTE-based reports.

## Prerequisites

- Node.js 22 or newer
- Docker and Docker Compose v2
- A Clerk application with `CLERK_SECRET_KEY`,
  `CLERK_PUBLISHABLE_KEY`, and `CLERK_WEBHOOK_SECRET`
- No host MySQL install is required; the stack runs MySQL in Docker

## Local Setup

```bash
git clone https://github.com/diaz3618/personal-finance-cs5356
cp .env.example .env
cd infra
docker compose up --build
```

Fill in the Clerk values in `.env` before starting the stack. The app is
available at `http://localhost`. MySQL is exposed on `localhost:3306`. Redis is
kept inside the Compose network.

## Runtime Shape

Nginx is the public entry point. It serves `app/public/` and forwards `/api/*`
to Express on port 3000. The app verifies Clerk sessions, resolves the local
user row, sets `@current_user_id` on the MySQL session, and then hands the data
work to views, functions, or procedures in `personal_finance`. Redis caches the
Clerk-user-id to local-user-id mapping so the auth path does not repeat the
same lookup on every request.

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
| PUT    | /api/transactions/:id/category| JWT | Calls `usp_transfer_category()` |
| DELETE | /api/transactions/:id         | JWT | Delete through `v_user_transactions`; `trg_log_tx_changes_delete` fires |
| GET    | /api/reports/monthly          | JWT | Calls `usp_monthly_summary()` |
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
| `usp_monthly_summary`         | Procedure | Returns a per-category monthly rollup for one user |
| `usp_apply_budget_alert`      | Procedure | Writes over-budget snapshots into `budget_alerts` |
| `usp_transfer_category`       | Procedure | Moves a transaction to a category of the same type |
| `fn_net_balance`              | Function  | Returns income minus expenses for one user |
| `fn_days_in_period`           | Function  | Returns the inclusive day count between two dates |
| `current_app_user_id`         | Function  | Exposes `@current_user_id` to the row-scoped views |
| `trg_check_type_match_insert` | Trigger   | Rejects inserts whose type disagrees with the category |
| `trg_check_type_match_update` | Trigger   | Rejects updates whose type disagrees with the category |
| `trg_log_tx_changes_insert`   | Trigger   | Records inserts in `transaction_audit_log` |
| `trg_log_tx_changes_update`   | Trigger   | Records updates in `transaction_audit_log` |
| `trg_log_tx_changes_delete`   | Trigger   | Records deletes in `transaction_audit_log` |
| `evt_monthly_budget_snapshot` | Event     | Runs the monthly budget alert pass |
| `evt_purge_old_alerts`        | Event     | Removes stale alert rows |

### Security-Definer Views

The `app_user` account does not read the base tables directly. It works through
`DEFINER` views and stored programs. Row filtering comes from
`current_app_user_id()`, which reads the `@current_user_id` value set by the
application middleware on the current connection.

| View                  | Filters By         | Purpose |
|-----------------------|--------------------|---------|
| `v_user_transactions` | `@current_user_id` | Transactions for the authenticated user |
| `v_user_categories`   | `@current_user_id` | Categories for the authenticated user |
| `v_user_budgets`      | `@current_user_id` | Budgets with category names and actual spend |
| `v_transaction_detail`| joined helper view | Report-oriented join across users, categories, and transactions |

## Documentation

The current project docs live under `docs/`:

- `docs/system-overview.md`
- `docs/data-model.md`
- `docs/database-workflows.md`
- `docs/diagrams/`

Repository URL: `https://github.com/diaz3618/personal-finance-cs5356`

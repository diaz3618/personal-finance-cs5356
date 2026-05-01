# pf-tracker database

This directory contains the MySQL 8.0 schema, seed data, and standalone report
queries for `pf-tracker`. Docker Compose still builds the MySQL image from this
directory, and the init scripts under `init/` are mounted directly on first
startup.

## Layout

```text
database/
├── Dockerfile
├── init/
│   ├── 01-schema.sql
│   └── 02-seed.sql
├── queries/
│   └── report_queries.sql
└── ../docs/
    ├── system-overview.md
    ├── data-model.md
    ├── database-workflows.md
    └── technology-choices.md
```

The Dockerfile copies `init/` into MySQL's `docker-entrypoint-initdb.d/`, so
the schema and seed run on the first container start. Later restarts skip that
initialization unless the data volume is removed.

## Running standalone

The usual path is `cd infra && docker compose up -d`, which starts MySQL with
the rest of the stack. To run only this image directly:

```bash
docker build -t pf-tracker-db .
docker run --rm -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=personal_finance \
  pf-tracker-db
```

Then connect with any MySQL 8 client at `127.0.0.1:3306` as `root`.

## Schema overview

The schema centers on six base tables: `users`, `categories`, `transactions`,
`budgets`, `budget_alerts`, and `transaction_audit_log`. It also exposes four
security-definer views: `v_user_transactions`, `v_user_categories`,
`v_user_budgets`, and `v_transaction_detail`. The application connects as
`app_user` and sets `@current_user_id` per request; the views filter on
`current_app_user_id()` to enforce row-level isolation.

The project-facing writeups live in `../docs/`:

- [`docs/system-overview.md`](../docs/system-overview.md)
- [`docs/data-model.md`](../docs/data-model.md)
- [`docs/database-workflows.md`](../docs/database-workflows.md)
- [`docs/technology-choices.md`](../docs/technology-choices.md)

## Reporting queries

`queries/report_queries.sql` keeps a few standalone queries that match the
current schema:

| # | Query | What it returns |
|---|-------|-----------------|
| 1 | Monthly Expense Totals | Total expenses per year-month |
| 2 | Monthly Income Totals | Total income per year-month |
| 3 | Spending by Category | Total spent per expense category for one user |
| 4 | Income vs Expense by Month | Income, expenses, and net balance side by side |
| 5 | User Transactions by Date | User transactions joined with category names |

Queries 3 and 5 read `@target_user_id`; set it before running them. The
application's monthly reporting path is handled by `usp_monthly_summary`, and
[`docs/database-workflows.md`](../docs/database-workflows.md) covers the stored
procedures, triggers, views, and events in more detail.

# pf-tracker database

MySQL 8.0 schema, seed data, and reporting queries for pf-tracker. The full
deployment normally runs from the Compose stack at `infra/docker-compose.yml`;
this directory holds the database artifacts that the `mysql` service mounts.

## Layout

```
database/
├── Dockerfile                  # builds an image that copies init/ into docker-entrypoint-initdb.d/
├── init/
│   ├── 01-schema.sql           # tables, views, stored programs, triggers, events, grants
│   └── 02-seed.sql             # demo users, categories, transactions, budgets
├── queries/
│   └── report_queries.sql      # standalone reporting queries
└── docs/
    ├── schema_notes.md         # table definitions, constraints, design rationale
    ├── normalization.md        # FD analysis through BCNF for all six tables
    ├── advanced-features.md    # stored programs, triggers, events, window queries
    └── diagrams/
        ├── er_diagram.md
        └── eer_diagram.md
```

The Dockerfile copies the contents of `init/` into MySQL's
`docker-entrypoint-initdb.d/`, so the schema and seed run automatically on first
container start. Subsequent restarts skip initialization unless the data volume
is destroyed.

## Running standalone

The intended path is `cd infra && docker compose up -d`, which brings up MySQL
with the rest of the stack. To run only this image directly:

```bash
docker build -t pf-tracker-db .
docker run --rm -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=personal_finance \
  pf-tracker-db
```

Then connect with any MySQL 8 client at `127.0.0.1:3306` as `root` / `rootpass`.

## Schema overview

Six base tables: `users`, `categories`, `transactions`, `budgets`,
`budget_alerts`, `transaction_audit_log`. Four security-definer views:
`v_user_transactions`, `v_user_categories`, `v_user_budgets`,
`v_transaction_detail`. The application connects as the `app_user` role and
sets `@current_user_id` per request; the views filter on
`current_app_user_id()` to enforce row-level isolation.

See [docs/schema_notes.md](docs/schema_notes.md) for the table-by-table
definition and [docs/normalization.md](docs/normalization.md) for the BCNF
analysis (including two documented denormalizations).

## Reporting queries

`queries/report_queries.sql` contains five reporting queries that are also
exposed through the API:

| # | Query                          | What it returns                                   |
|---|--------------------------------|---------------------------------------------------|
| 1 | Monthly Expense Totals         | Total expenses per year-month                     |
| 2 | Monthly Income Totals          | Total income per year-month                       |
| 3 | Spending by Category           | Total spent per expense category, descending      |
| 4 | Income vs Expense by Month     | Income, expenses, and net savings side by side    |
| 5 | User Transactions by Date      | All transactions for a given user, chronological  |

Query 5 reads `@target_user_id`; set it before running. The `usp_monthly_summary`
stored procedure wraps query 4 with a cursor-based per-category breakdown — see
[docs/advanced-features.md](docs/advanced-features.md).

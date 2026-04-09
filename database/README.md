# Personal Finance Tracker - Database

MySQL 8.0 database for tracking personal income and expense transactions. Runs in Docker via `docker compose`.

## Quick Start

```bash
cp .env.example .env        # uses rootpass by default
docker compose up -d        # starts the container; init scripts apply automatically
```

The Dockerfile copies `init/` into `docker-entrypoint-initdb.d/`, so the schema and seed data load on first start. `deploy.sh` does the same but uses the standalone `schema/` and `seed/` files instead of the init scripts - useful when rebuilding against an already-running container.

Connect once the container is healthy:

```bash
docker exec -it database-mysql-1 mysql -uroot -prootpass personal_finance
```

Port 3306 is exposed to the host, so any MySQL client at `127.0.0.1:3306` works as well.

## Structure

```
database/
├── Dockerfile                  # copies init/ into docker-entrypoint-initdb.d
├── docker-compose.yml
├── deploy.sh                   # alternative startup: starts compose, loads schema + seed, verifies
├── .env.example
├── init/
│   ├── 01-schema.sql           # runs on first container start (via entrypoint)
│   └── 02-seed.sql
├── schema/
│   └── schema.sql              # drop/recreate version used by deploy.sh
├── seed/
│   └── seed.sql                # used by deploy.sh
├── queries/
│   └── report_queries.sql      # five report queries
└── docs/
    ├── schema_notes.md         # table definitions, constraints, design decisions
    └── diagrams/
        ├── er_diagram.md
        └── eer_diagram.md
```

## Report Queries

| # | Query | What it returns |
|---|-------|-----------------|
| 1 | Monthly Expense Totals | Total expenses per year-month |
| 2 | Monthly Income Totals | Total income per year-month |
| 3 | Spending by Category | Total spent per expense category, descending |
| 4 | Income vs Expense by Month | Income, expenses, and net savings side by side |
| 5 | User Transactions by Date | All transactions for a given user, chronological |

Query 5 uses a session variable `@target_user_id`; set it before running.

## Schema and Constraints

Three tables: `Users`, `Categories`, `Transactions`. Key constraints:

- `amount > 0` - enforced by CHECK
- `category_type` and `transaction_type` - restricted to `'income'` or `'expense'` by ENUM and CHECK
- `Users.email` - UNIQUE
- `Categories → Users` and `Transactions → Users` - ON DELETE CASCADE
- `Transactions → Categories` - ON DELETE RESTRICT (prevents category deletion while transactions exist)

MySQL CHECK constraints cannot reference other tables, so a `BEFORE INSERT` and `BEFORE UPDATE` trigger enforce that `transaction_type` must match the `category_type` of the assigned category. See [docs/schema_notes.md](docs/schema_notes.md) for the full design rationale and [docs/diagrams/eer_diagram.md](docs/diagrams/eer_diagram.md) for the annotated EER.

# Database Workflows

This document covers the database-side logic that runs after a request reaches
MySQL: stored procedures, functions, triggers, events, and reporting queries.

## Stored Procedures

### `usp_monthly_summary`

Builds the payload returned by `GET /api/reports/monthly`. The procedure:

- accepts a user id, year, and month
- walks the relevant categories with a cursor
- aggregates income and expense totals for that month
- writes the intermediate result into a temporary table before returning it

### `usp_apply_budget_alert`

Calculates whether a user has exceeded a monthly budget limit and writes a row
into `budget_alerts`. The procedure runs inside an explicit transaction and
uses `SAVEPOINT sp_budget_check` so one failing insert does not abort the rest
of the monthly pass.

### `usp_transfer_category`

Moves an existing transaction to a different category. The procedure:

- locks the target transaction with `FOR UPDATE`
- verifies that the transaction belongs to the caller's user id
- verifies that the destination category type matches the transaction type
- updates the row inside an explicit transaction
- raises `SIGNAL SQLSTATE '45000'` when validation fails

## Functions

### `fn_net_balance`

Returns total income minus total expenses for one user. The dashboard summary
endpoint calls it directly.

### `fn_days_in_period`

Returns the inclusive day count between two dates. The dashboard uses it to
label the current reporting window.

### `current_app_user_id`

Wraps `@current_user_id` so the security-definer views can read the request's
active user context.

## Trigger Behavior

### Type-Match Triggers

- `trg_check_type_match_insert`
- `trg_check_type_match_update`

These triggers block writes when a transaction's stored type does not match the
referenced category type.

### Audit Triggers

- `trg_log_tx_changes_insert`
- `trg_log_tx_changes_update`
- `trg_log_tx_changes_delete`

These triggers append rows to `transaction_audit_log` whenever a transaction is
inserted, updated, or deleted. The delete trigger runs before the parent row is
removed so the audit row can still capture the original values.

## Scheduled Events

### `evt_monthly_budget_snapshot`

Runs the monthly alert pass for all users. It calls `usp_apply_budget_alert`
for each user and relies on the unique key in `budget_alerts` plus
`INSERT IGNORE` to stay idempotent for a given month.

### `evt_purge_old_alerts`

Runs weekly and deletes alert rows older than twelve months.

## Reporting Queries Used by the App

The application exposes several read paths that map directly to SQL patterns in
the schema:

- monthly summary procedure output
- running balance with `SUM(...) OVER (ORDER BY ...)`
- category ranking with `RANK() OVER (...)`
- transaction export shaped through a CTE before CSV streaming
- budget reads through `v_user_budgets`

Those queries stay close to the schema instead of being rebuilt in application
memory.

## Why the Logic Lives in MySQL

This project keeps validation, audit capture, monthly automation, and reporting
close to the schema for two reasons:

- the rules apply regardless of which API route or client path reaches the data
- the application code stays small because it can call database primitives that
  already encode the core invariants

## Related Docs

- [System Overview](./system-overview.md)
- [Data Model](./data-model.md)
- [Technology Choices](./technology-choices.md)

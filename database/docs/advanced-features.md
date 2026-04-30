# Advanced Database Features

## Object Map

| Object | Type | Course topic | Lecture | API endpoint |
|--------|------|--------------|---------|--------------|
| usp_monthly_summary | Stored procedure | Cursors, CONTINUE HANDLER FOR SQLEXCEPTION | Lecture 6 | GET /api/reports/monthly |
| usp_apply_budget_alert | Stored procedure | SAVEPOINT, partial rollback, cursor loop | Lecture 6 | Called by evt_monthly_budget_snapshot; no direct HTTP route |
| usp_transfer_category | Stored procedure | Explicit transaction, COMMIT/ROLLBACK, SIGNAL SQLSTATE | Lecture 6 | PUT /api/transactions/:id/category |
| fn_net_balance | Function | Stored functions, READS SQL DATA | Lecture 6 | GET /api/dashboard/summary |
| fn_days_in_period | Function | Stored functions, DETERMINISTIC, DATEDIFF | Lecture 6 | GET /api/dashboard/summary |
| trg_log_tx_changes_insert | Trigger | AFTER INSERT, audit logging | Lecture 6 | Fires on POST /api/transactions |
| trg_log_tx_changes_update | Trigger | AFTER UPDATE, OLD/NEW pseudo-rows | Lecture 6 | Fires on PUT /api/transactions/:id |
| trg_log_tx_changes_delete | Trigger | AFTER DELETE, audit trail | Lecture 6 | Fires on DELETE /api/transactions/:id |
| evt_monthly_budget_snapshot | Event | Event Scheduler, EVERY 1 MONTH | Lecture 6 | Runs automatically; calls usp_apply_budget_alert |
| evt_purge_old_alerts | Event | Event Scheduler, archival DELETE | Lecture 6 | Runs automatically; purges budget_alerts > 12 months |
| running-balance query | Window function | SUM() OVER (ORDER BY ...) | Lecture 7 | GET /api/dashboard/running-balance |
| category-rank query | Window function | RANK() OVER (ORDER BY SUM() DESC) | Lecture 7 | GET /api/reports/category-rank |
| export CTE | Common Table Expression | WITH ... AS (...) SELECT | Lecture 7 | GET /api/export/transactions |

## Stored Procedures

Three SECURITY DEFINER procedures handle operations that require transaction control or multi-step validation. `usp_monthly_summary` uses an explicit cursor and a CONTINUE HANDLER to walk per-category aggregates for a given month and returns the result set via a temporary table. `usp_apply_budget_alert` wraps budget breach detection in an explicit START TRANSACTION block and uses a SAVEPOINT inside the cursor loop so a single failing INSERT can be rolled back without aborting the remaining rows; the surrounding transaction is required because the procedure is invoked from the event scheduler, where autocommit is on. `usp_transfer_category` enforces type consistency between a transaction and its new category using SIGNAL SQLSTATE '45000', with an EXIT HANDLER that rolls back and re-raises on any SQL error.

## Functions

Both functions are SECURITY DEFINER and reachable from `app_user` via the schema-wide `GRANT EXECUTE ON personal_finance.*`. `fn_net_balance` reads the `transactions` base table (READS SQL DATA) to compute total income minus total expenses for a given user; the dashboard summary endpoint calls it alongside `fn_days_in_period`. `fn_days_in_period` is DETERMINISTIC and NO SQL: it wraps `DATEDIFF(end, start) + 1` to return an inclusive day count, which the dashboard uses to label the current billing period.

## Trigger

MySQL requires one CREATE TRIGGER statement per event type, so the composite audit requirement is implemented as three triggers (`trg_log_tx_changes_insert`, `trg_log_tx_changes_update`, `trg_log_tx_changes_delete`). Each fires AFTER its respective DML on `transactions` and inserts a row into `transaction_audit_log` capturing the action, the old and new amounts, and the row owner's user_id. Because the triggers fire inside the originating statement's transaction, the audit row is committed atomically with the change it describes.

## Events

Both events depend on the MySQL event scheduler, enabled with `--event_scheduler=ON` on the mysql service in `infra/docker-compose.yml`. `evt_monthly_budget_snapshot` runs on the first of each month; its body iterates all users with a cursor and calls `usp_apply_budget_alert` for each, and the UNIQUE constraint on `(user_id, category_id, month)` plus INSERT IGNORE inside the procedure keep the result idempotent across re-runs. `evt_purge_old_alerts` runs weekly and deletes `budget_alerts` rows older than twelve months so the table does not grow unbounded over long-running deployments.

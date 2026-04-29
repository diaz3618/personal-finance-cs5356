# Functional Dependency Analysis and Normalization

Schema: `personal_finance` — six tables analyzed through BCNF.

---

## Table 1: `users`

Stores application accounts. Each row is one user.

**Attributes:** id, clerk_user_id, email, display_name, created_at

**Candidate Keys:** {id}, {clerk_user_id}, {email}

Three candidate keys exist because all three columns carry UNIQUE constraints. `id` is selected as the primary key (surrogate, stable, short).

**Functional Dependencies:**

```
id           → clerk_user_id, email, display_name, created_at
clerk_user_id → id, email, display_name, created_at
email        → id, clerk_user_id, display_name, created_at
```

The three FDs are symmetric across the three candidate keys. `display_name` and `created_at` have no outgoing FDs to other attributes.

**1NF:** Each cell holds one atomic value; no repeating groups. The relation is in 1NF.

**2NF:** The primary key `id` is a single attribute, so partial dependency on a composite key is impossible. The relation is in 2NF.

**3NF:** No non-key attribute transitively depends on a non-superkey determinant. `display_name` is determined only by keys; `created_at` is similarly determined only by keys. The relation is in 3NF.

**BCNF:** Every determinant (`id`, `clerk_user_id`, `email`) is a candidate key and therefore a superkey. The relation is in BCNF.

---

## Table 2: `categories`

User-owned expense and income categories. Names are unique per user.

**Attributes:** id, user_id, name, type, created_at

**Candidate Keys:** {id}, {user_id, name}

`id` is the surrogate PK. The composite `{user_id, name}` is enforced as a candidate key by the UNIQUE constraint `uq_categories_user_name`.

**Functional Dependencies:**

```
id             → user_id, name, type, created_at
{user_id, name} → id, type, created_at
user_id        → (does not determine name or type alone; a user has many categories)
```

**1NF:** `type` is an ENUM (`income`, `expense`) — a single atomic value per row. No repeating groups. In 1NF.

**2NF:** Check both candidate keys for partial dependencies.
- For PK `id`: simple key, no partial dependency possible.
- For composite CK `{user_id, name}`: `type` and `created_at` depend on both attributes together, not on either alone. A user can have categories of both types; the same name under different users can have different types (user 1 "Salary" is `income`; no rule prevents another user from naming a category "Salary" with a different type). No partial dependency. In 2NF.

**3NF:** No non-key attribute determines another non-key attribute. `type` does not determine `created_at` or vice versa. In 3NF.

**BCNF:** Both determinants (`id` and `{user_id, name}`) are candidate keys. In BCNF.

---

## Table 3: `transactions`

Records individual income and expense events. Most analytically rich table.

**Attributes:** id, user_id, category_id, amount, transaction_type, transaction_date, notes, created_at

**Candidate Key:** {id}

No composite unique constraint exists. `id` is the only candidate key.

**Functional Dependencies:**

```
id          → user_id, category_id, amount, transaction_type, transaction_date, notes, created_at
category_id → transaction_type
```

The second FD reflects that the trigger `trg_check_type_match_insert` enforces `transaction_type = categories.type` for the referenced `category_id`. This makes `transaction_type` functionally determined by `category_id` within this table — the value is never independent.

**1NF:** All values are atomic. `notes` is a single VARCHAR. In 1NF.

**2NF:** `id` is a simple key. In 2NF.

**3NF:** The FD `category_id → transaction_type` introduces a transitive dependency:

```
id → category_id → transaction_type
```

`category_id` is not a superkey, and `transaction_type` is not a prime attribute (not part of any candidate key). This violates 3NF.

**Deliberate denormalization:** `transaction_type` is stored redundantly with `category_id` to support fast filtering in reporting queries (`WHERE transaction_type = 'expense'`) without a join to `categories`. The trigger pair ensures consistency at write time. The denormalization trades strict normalization for query performance, a common practical compromise in OLTP schemas where the redundant attribute is small and write-protected by triggers.

A strict 3NF decomposition would remove `transaction_type` from `transactions` and derive it from `categories` via `category_id`. That is not implemented here.

**BCNF:** Same analysis as 3NF — `category_id → transaction_type` violates BCNF because `category_id` is not a superkey.

---

## Table 4: `budgets`

Monthly spending limits per category per user.

**Attributes:** id, user_id, category_id, month, limit_amount, created_at

**Candidate Keys:** {id}, {user_id, category_id, month}

The composite `{user_id, category_id, month}` is enforced by `uq_budgets_user_category_month`. Only one budget row may exist per (user, category, month) combination.

**Functional Dependencies:**

```
id                            → user_id, category_id, month, limit_amount, created_at
{user_id, category_id, month} → id, limit_amount, created_at
```

`limit_amount` is the budget ceiling for that specific (user, category, month) triple; it depends on all three. No subset suffices: a user may have different limits for the same category in different months, different limits for different categories, and different users own independent budgets.

**1NF:** `month` is stored as a DATE (first day of the month by convention), not a composite or repeating group. All values atomic. In 1NF.

**2NF:** For composite CK `{user_id, category_id, month}`:
- `limit_amount` depends on all three (no partial dep).
- `created_at` is the row insertion timestamp; it depends on the whole row identity, not a subset.
In 2NF.

**3NF:** No transitive dependency among non-key attributes. `limit_amount` and `created_at` do not determine each other. In 3NF.

**BCNF:** Both determinants (`id` and `{user_id, category_id, month}`) are candidate keys. In BCNF.

---

## Table 5: `budget_alerts`

Snapshot of the state at the moment a budget was exceeded. One row per alert event.

**Attributes:** id, user_id, category_id, month, actual_amount, limit_amount, triggered_at

**Candidate Key:** {id}

No composite UNIQUE constraint. `{user_id, category_id, month}` is not unique here — multiple alerts could theoretically be generated for the same budget period (the schema does not prohibit it).

**Functional Dependencies:**

```
id → user_id, category_id, month, actual_amount, limit_amount, triggered_at
{user_id, category_id, month} → limit_amount   (external, from budgets table)
```

The second FD is an interrelational dependency: in `budgets`, the composite key determines `limit_amount`. That value is duplicated into `budget_alerts` at alert time.

**1NF:** All values atomic, no repeating groups. In 1NF.

**2NF:** `id` is a simple key. In 2NF.

**3NF:** `{user_id, category_id, month} → limit_amount` holds here as well. `{user_id, category_id, month}` is not a superkey for this table (it does not uniquely identify a `budget_alerts` row). `limit_amount` is not a prime attribute. Strictly, this violates 3NF.

**Deliberate denormalization:** `limit_amount` is stored as a snapshot at the time the alert fired. If `budgets.limit_amount` is later adjusted, the historical alert retains the limit that was in effect when spending was first flagged. This is an audit trail pattern: the redundancy is intentional to preserve historical accuracy. Normalizing it out would require a join to `budgets` at query time and would lose the snapshot guarantee if the budget row is updated or deleted.

**BCNF:** Not in BCNF for the same reason as 3NF — `{user_id, category_id, month}` is a non-superkey determinant for `limit_amount`.

---

## Table 6: `transaction_audit_log`

Append-only audit trail recording amount changes on transaction rows.

**Attributes:** id, transaction_id, action, old_amount, new_amount, changed_at, changed_by

**Candidate Key:** {id}

`transaction_id` is a nullable FK (SET NULL on parent DELETE) — it is not unique, since one transaction can accumulate multiple audit entries. No composite unique constraint.

**Functional Dependencies:**

```
id → transaction_id, action, old_amount, new_amount, changed_at, changed_by
```

`transaction_id` does not determine any other attribute: one transaction can have many log entries with different actions, amounts, and timestamps. `action` constrains which amount fields are populated (INSERT sets only `new_amount`; DELETE sets only `old_amount`; UPDATE sets both), but this is a domain constraint enforced by application logic, not a functional dependency in the relational sense.

**1NF:** `old_amount` and `new_amount` are nullable but remain atomic per row. `action` is an ENUM — one value per cell. In 1NF.

**2NF:** `id` is a simple key. In 2NF.

**3NF:** No non-key attribute determines another non-key attribute. `action` does not functionally determine `old_amount` or `new_amount` (both are nullable depending on the action, but their actual values are independent per log entry). In 3NF.

**BCNF:** The only determinant is `id`, a candidate key. In BCNF.

---

## Summary

| Table | 1NF | 2NF | 3NF | BCNF | Notes |
|-------|-----|-----|-----|------|-------|
| users | ✓ | ✓ | ✓ | ✓ | Three candidate keys (id, clerk_user_id, email) |
| categories | ✓ | ✓ | ✓ | ✓ | Composite CK (user_id, name) |
| transactions | ✓ | ✓ | ✗ | ✗ | category_id → transaction_type violates 3NF/BCNF; deliberate |
| budgets | ✓ | ✓ | ✓ | ✓ | Two candidate keys; composite is (user_id, category_id, month) |
| budget_alerts | ✓ | ✓ | ✗ | ✗ | limit_amount snapshot violates 3NF/BCNF; deliberate audit trail |
| transaction_audit_log | ✓ | ✓ | ✓ | ✓ | Append-only; id is sole candidate key |

Two tables (`transactions`, `budget_alerts`) contain deliberate BCNF violations. Both cases are recognized denormalizations with documented justifications: `transactions.transaction_type` avoids join overhead in reporting; `budget_alerts.limit_amount` preserves a historical snapshot. Neither case would produce the standard decomposition in a classroom exercise without this context.

# Entity-Relationship (ER) Diagram

```mermaid
erDiagram

    users ||--o{ categories : "has"
    users ||--o{ transactions : "records"
    users ||--o{ budgets : "sets"
    users ||--o{ budget_alerts : "receives"
    categories ||--o{ transactions : "classifies"
    categories ||--o{ budgets : "budgeted by"
    categories ||--o{ budget_alerts : "triggers"
    transactions ||--o{ transaction_audit_log : "logged in"

    users {
        INT id PK
        VARCHAR clerk_user_id UK "NULL"
        VARCHAR email UK "NULL"
        VARCHAR display_name "NULL"
        TIMESTAMP created_at
    }

    categories {
        INT id PK
        INT user_id FK
        VARCHAR name
        ENUM type "income | expense"
        TIMESTAMP created_at
    }

    transactions {
        INT id PK
        INT user_id FK
        INT category_id FK
        DECIMAL amount "CHECK > 0"
        ENUM transaction_type "income | expense"
        DATE transaction_date
        VARCHAR notes "NULL"
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    budgets {
        INT id PK
        INT user_id FK
        INT category_id FK
        DATE month "first of month"
        DECIMAL limit_amount "CHECK > 0"
        TIMESTAMP created_at
    }

    budget_alerts {
        INT id PK
        INT user_id FK
        INT category_id FK
        DATE month
        DECIMAL actual_amount
        DECIMAL limit_amount
        TIMESTAMP triggered_at
    }

    transaction_audit_log {
        INT id PK
        INT transaction_id FK "NULL ON DELETE SET NULL"
        ENUM action "INSERT | UPDATE | DELETE"
        DECIMAL old_amount "NULL"
        DECIMAL new_amount "NULL"
        TIMESTAMP changed_at
        INT changed_by "NULL"
    }
```

## Relationships

| Relationship | Cardinality | Description |
|---|---|---|
| users → categories | One-to-Many | A user owns many categories |
| users → transactions | One-to-Many | A user records many transactions |
| users → budgets | One-to-Many | A user sets many budgets |
| users → budget_alerts | One-to-Many | A user receives many budget alerts |
| categories → transactions | One-to-Many | A category classifies many transactions |
| categories → budgets | One-to-Many | A category can have one budget per month per user |
| categories → budget_alerts | One-to-Many | A category can trigger many alerts |
| transactions → transaction_audit_log | One-to-Many | A transaction has many audit log entries |

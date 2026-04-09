# Enhanced Entity-Relationship (EER) Diagram

This EER diagram extends the basic ER by showing data types, constraints,
triggers, and deletion behavior.

```mermaid
erDiagram

    Users ||--o{ Categories : "owns (CASCADE)"
    Users ||--o{ Transactions : "records (CASCADE)"
    Categories ||--o{ Transactions : "classifies (RESTRICT)"

    Users {
        INT user_id PK "AUTO_INCREMENT"
        VARCHAR_100 full_name "NOT NULL"
        VARCHAR_255 email "NOT NULL, UNIQUE"
    }

    Categories {
        INT category_id PK "AUTO_INCREMENT"
        INT user_id FK "NOT NULL → Users.user_id"
        VARCHAR_100 category_name "NOT NULL"
        ENUM category_type "income | expense"
    }

    Transactions {
        INT transaction_id PK "AUTO_INCREMENT"
        INT user_id FK "NOT NULL → Users.user_id"
        INT category_id FK "NOT NULL → Categories.category_id"
        DECIMAL_10_2 amount "NOT NULL, CHECK > 0"
        DATE transaction_date "NOT NULL"
        ENUM transaction_type "income | expense"
        VARCHAR_255 description "NULLABLE"
    }
```

## Constraints Detail

| Table | Constraint | Type | Rule |
|---|---|---|---|
| Users | `uq_users_email` | UNIQUE | `email` must be unique |
| Categories | `fk_categories_user` | FOREIGN KEY | `user_id → Users(user_id)` ON DELETE CASCADE |
| Categories | `chk_category_type` | CHECK | `category_type IN ('income', 'expense')` |
| Transactions | `fk_transactions_user` | FOREIGN KEY | `user_id → Users(user_id)` ON DELETE CASCADE |
| Transactions | `fk_transactions_category` | FOREIGN KEY | `category_id → Categories(category_id)` ON DELETE RESTRICT |
| Transactions | `chk_amount_positive` | CHECK | `amount > 0` |
| Transactions | `chk_transaction_type` | CHECK | `transaction_type IN ('income', 'expense')` |

## Triggers (Cross-Table Validation)

```mermaid
flowchart LR
    A["INSERT / UPDATE<br/>on Transactions"] --> B{"transaction_type<br/>== category_type?"}
    B -- Yes --> C["Allow operation"]
    B -- No --> D["SIGNAL SQLSTATE 45000<br/>Reject with error"]
```

| Trigger | Event | Rule |
|---|---|---|
| `trg_check_type_match_insert` | BEFORE INSERT | `Transactions.transaction_type` must equal `Categories.category_type` |
| `trg_check_type_match_update` | BEFORE UPDATE | Same check on update |

## Deletion Behavior

```mermaid
flowchart TD
    U["DELETE User"] -->|CASCADE| C["Delete user's Categories"]
    U -->|CASCADE| T["Delete user's Transactions"]
    C2["DELETE Category"] -->|RESTRICT| X{"Has Transactions?"}
    X -- Yes --> BLOCK["Operation blocked"]
    X -- No --> OK["Category deleted"]
```

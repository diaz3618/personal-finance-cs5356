# Entity-Relationship (ER) Diagram

```mermaid
erDiagram

    Users ||--o{ Categories : "has"
    Users ||--o{ Transactions : "makes"
    Categories ||--o{ Transactions : "classifies"

    Users {
        INT user_id PK
        VARCHAR full_name
        VARCHAR email UK
    }

    Categories {
        INT category_id PK
        INT user_id FK
        VARCHAR category_name
        ENUM category_type
    }

    Transactions {
        INT transaction_id PK
        INT user_id FK
        INT category_id FK
        DECIMAL amount
        DATE transaction_date
        ENUM transaction_type
        VARCHAR description
    }
```

## Relationships

| Relationship | Cardinality | Description |
|---|---|---|
| Users > Categories | One-to-Many | A user defines many categories |
| Users > Transactions | One-to-Many | A user creates many transactions |
| Categories > Transactions | One-to-Many | A category classifies many transactions |

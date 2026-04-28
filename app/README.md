# Personal Expense Tracker

Small web app for recording personal income and expenses, backed by a MySQL database. Lets you add categorized transactions and view monthly / by-category spending reports.

**Stack:** HTML/CSS/JS frontend · Node.js + Express backend · MySQL

## Prerequisites

Install these once on your machine:

- [Node.js](https://nodejs.org/) (v18 or newer)
- [MySQL Server + Workbench](https://dev.mysql.com/downloads/installer/)

## Setup

From inside the `finance-tracker/` folder:

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your MySQL credentials

Copy the example env file and fill in your MySQL password:

```bash
copy .env.example .env
```

Then open `.env` and set `DB_PASSWORD` to your MySQL root password. The other defaults (`localhost`, port `3306`, user `root`, database `finance_tracker`) work as-is for a standard local MySQL install.

### 3. Create the database

Open MySQL Workbench, then:

1. `File → Open SQL Script…` and select `schema.sql`
2. Click the lightning bolt (⚡) to execute the whole script

This creates the `finance_tracker` schema, all three tables (`Users`, `Categories`, `Transactions`), and seeds a default user, four categories, and a handful of sample transactions.

> **Note:** Re-running `schema.sql` drops and recreates the tables — it wipes any data you've added.

## Run the app

```bash
npm start
```

Open <http://localhost:3000> in your browser. You should see the Home page with three buttons: **Add Transaction**, **Manage Categories**, **View Reports**.

Stop the server with `Ctrl+C`.

## Project structure

```
finance-tracker/
├── server.js        # Express app + REST API
├── db.js            # MySQL connection pool
├── schema.sql       # database setup (run once in Workbench)
├── .env.example     # template env file (commit this)
├── .env             # your local secrets (gitignored)
└── public/
    ├── index.html
    ├── add-transaction.html
    ├── categories.html
    ├── reports.html
    ├── style.css
    └── script.js
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Access denied for user 'root'` in terminal | Wrong password in `.env` |
| `Unknown database 'finance_tracker'` | `schema.sql` wasn't run, or `DB_NAME` doesn't match |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL Server isn't running — check `services.msc` for `MySQL80` |
| Page loads but data is empty / red errors | Check browser DevTools → Network tab for the failing `/api/...` request |

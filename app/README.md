# pf-tracker

Personal finance tracker — records income and expense transactions by category, with monthly and by-category reports.

**Stack:** HTML/CSS/JS frontend · Node.js + Express · MySQL 8.0 · Clerk authentication

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine + Compose
- A [Clerk](https://clerk.com) account with a new application created

## Setup

### 1. Configure environment variables

From the project root (not this directory):

```bash
cp .env.example .env
```

Fill in the four Clerk values in `.env`:

| Variable | Where to find it |
|----------|-----------------|
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks → your endpoint → Signing Secret |
| `FRONTEND_URL` | Leave as `http://localhost:3010` for local dev |

### 2. Register the webhook endpoint in Clerk

In the Clerk Dashboard, go to **Webhooks → Add Endpoint**:

- URL: `https://your-tunnel-or-domain/api/webhooks/clerk`
- Subscribe to events: `user.created`, `user.deleted`
- Copy the **Signing Secret** into `CLERK_WEBHOOK_SECRET` in your `.env`

For local development, use [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose port 3010.

### 3. Start the stack

```bash
docker compose -f infra/docker-compose.yml up -d
```

The app is available at [http://localhost:3010](http://localhost:3010).

### 4. Rebuilding after schema changes

If `database/init/01-schema.sql` changes, the MySQL volume must be destroyed and recreated:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
```

This erases all data. Re-seed by re-running `database/init/02-seed.sql` via the MySQL client or a volume init script.

## Development

Run the app directly (requires local MySQL):

```bash
cd app
npm install
node server.js
```

## Routes

| Method | Path | Auth required |
|--------|------|---------------|
| GET | `/api/categories` | Yes |
| POST | `/api/categories` | Yes |
| PUT | `/api/categories/:id` | Yes |
| DELETE | `/api/categories/:id` | Yes |
| GET | `/api/transactions` | Yes |
| POST | `/api/transactions` | Yes |
| PUT | `/api/transactions/:id` | Yes |
| DELETE | `/api/transactions/:id` | Yes |
| GET | `/api/reports/monthly` | Yes |
| GET | `/api/reports/by-category` | Yes |
| GET | `/api/auth/me` | Yes |
| POST | `/api/webhooks/clerk` | Svix signature |
| GET | `/config.js` | No |

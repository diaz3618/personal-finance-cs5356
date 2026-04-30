# pf-tracker

This directory contains the web application runtime. `server.js` serves the
static frontend, validates Clerk sessions, resolves the local `users.id`, sets
`@current_user_id` on each MySQL session, and hands reads or writes off to the
database layer.

**Stack:** HTML/CSS/JS frontend, Node.js + Express, MySQL 8.0, Clerk
authentication

## Prerequisites

- Docker Engine with Compose or Docker Desktop
- A Clerk application

## Setup

### Environment

Use the project root `.env` file, not an app-local one:

```bash
cp .env.example .env
```

Set these values in `.env`:

| Variable | Where to find it |
|----------|------------------|
| `CLERK_PUBLISHABLE_KEY` | Clerk Dashboard -> API Keys |
| `CLERK_SECRET_KEY` | Clerk Dashboard -> API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard -> Webhooks -> endpoint -> Signing Secret |
| `FRONTEND_URL` | Optional override for direct API access from a different browser origin |

### Clerk webhook

In the Clerk Dashboard, add a webhook endpoint:

- URL: `https://your-tunnel-or-domain/api/webhooks/clerk`
- Events: `user.created`, `user.deleted`
- Copy the signing secret into `CLERK_WEBHOOK_SECRET`

For local webhook testing, expose port 80 with
[ngrok](https://ngrok.com) or
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

### Start the stack

```bash
docker compose -f infra/docker-compose.yml up -d
```

The browser entry point is [http://localhost](http://localhost). Nginx proxies
`/api/*` to the Node process on port 3000 inside the Compose network.

### Rebuild after schema changes

If `database/init/01-schema.sql` changes, rebuild from a clean MySQL volume:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
```

This wipes the local data set. Re-seed with `database/init/02-seed.sql`.

## Development

Run the app directly when you need to debug the Express process outside
Compose:

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

## Related docs

- [`../README.md`](../README.md)
- [`../docs/system-overview.md`](../docs/system-overview.md)
- [`../docs/data-model.md`](../docs/data-model.md)
- [`../docs/database-workflows.md`](../docs/database-workflows.md)
- Repository: `https://github.com/diaz3618/personal-finance-cs5356`

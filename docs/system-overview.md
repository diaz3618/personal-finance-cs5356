# System Overview

`pf-tracker` is a personal-finance web app with most of the data rules kept in
MySQL. Nginx is the first hop. It serves `app/public/` and forwards `/api/*`
traffic to Express, which then talks to MySQL and Redis on the private
network.

## Stack

| Layer | Implementation |
|------|----------------|
| Frontend | Static HTML, CSS, and browser-side JavaScript in `app/public/` |
| Reverse proxy | Nginx |
| Application server | Node.js 22 + Express 5 |
| Primary datastore | MySQL 8.0 |
| Cache | Redis 7 |
| Authentication | Clerk |

## Request Path

Port 80 is the public entry point. Static assets come straight from Nginx. API
requests go to Express on port 3000. The handlers do input checks, resolve the
authenticated user, set the database session context, and then call into views,
functions, or stored procedures.

## Authentication Flow

Clerk handles sign-in and JWT validation. During an authenticated API request:

1. Clerk middleware validates the incoming token.
2. The application reads the Clerk user id from the verified session.
3. Redis is checked for a cached mapping from Clerk user id to local `users.id`.
4. On a cache miss, the app looks up the local row in MySQL and performs
   just-in-time user creation if needed.
5. The app acquires a pooled `app_user` connection and runs
   `SET @current_user_id = ?`.

That session variable is what ties the request to the row-scoped views in the
database.

## Data Access Model

The application uses two pools:

- `adminPool` handles Clerk webhook writes and user-resolution queries that run
  outside the row-scoped application account
- `appPool` runs normal authenticated traffic as `app_user`

`app_user` is deliberately limited. It does not read the base tables directly.
Most user-facing reads and writes go through security-definer views or stored
programs.

## Clerk Webhook Handling

`POST /api/webhooks/clerk` receives Svix-signed Clerk events. That path:

- upserts a local `users` row for `user.created`
- deletes the local row for `user.deleted`
- clears the Redis mapping for deleted users

That keeps the local `users` table aligned with Clerk without pushing account
provisioning into the browser.

## Runtime Environments

The repository supports two deployment targets:

- Docker Compose for local development
- Kubernetes manifests under `infra/k8s/`

Both targets keep the same four-service shape: `nginx`, `app`, `mysql`, and
`redis`. `ngrok` is available when webhook delivery needs a public endpoint.

## Related Docs

- [Data Model](./data-model.md)
- [Database Workflows](./database-workflows.md)
- [Technology Choices](./technology-choices.md)

# infra

This directory holds the active deployment assets for pf-tracker. The supported
paths are Docker Compose for local work and Kubernetes for cluster-style
deployments.

## Docker Compose

Docker Compose expects a project-root `.env` file:

```sh
cp ../.env.example ../.env
```

Run from `infra/`:

```sh
docker compose up --build
```

That starts four services:

| Service | Role |
|---------|------|
| `mysql` | MySQL 8.0, persistent volume, event scheduler enabled |
| `redis` | Redis 7, cache for resolved Clerk user IDs |
| `app` | Node.js/Express application server on port 3000 |
| `nginx` | Reverse proxy and static file server on port 80 |

Port 80 is the public entry point. Port 3306 is bound to localhost for direct
database access during development. The current project docs live in
`../docs/`, including the deployment and auth/RLS diagrams under
`../docs/diagrams/`.

To expose port 80 through a public tunnel for Clerk webhook delivery:

```sh
docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up -d
```

That overlay needs `NGROK_AUTHTOKEN` in `.env`
(https://dashboard.ngrok.com/authtokens). The tunnel URL appears at
http://localhost:4040 and in the ngrok container logs. Register that URL as a
Clerk webhook endpoint for `user.created` and `user.deleted`, then set
`CLERK_WEBHOOK_SECRET` in `.env` and restart the app container.

## Kubernetes

The manifests under `infra/k8s/` assume:

- `kubectl` is pointed at a running cluster
- an nginx ingress controller is installed
- a StorageClass named `standard` exists

All `**/secret.yaml` files ship with placeholder base64 values. Replace them
before applying the manifests. On a shared or long-lived cluster, Sealed
Secrets are a better fit than raw committed secrets.

Apply the stack with:

```sh
kubectl apply -k infra/k8s/
```

Verify it with:

```sh
kubectl get pods -n pf-tracker
kubectl get ingress -n pf-tracker
```

The Kustomization includes the namespace, ingress, MySQL, Redis, app, Nginx,
and ngrok resources that ship with the repo. Replace the placeholder secrets
before using these manifests outside a local test cluster.

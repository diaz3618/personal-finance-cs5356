# infra

Deployment configurations for pf-tracker. Three modes are supported: Docker Compose (development and local), Kubernetes with nginx-ingress (vanilla K8s), and K3s with Kustomize (edge/lightweight K3s clusters).

---

## Docker Compose

**Prerequisites**

- Docker Engine and Docker Compose v2 (`docker compose` subcommand)
- A `.env` file at the project root — copy `.env.example` and fill in real values:

```sh
cp ../.env.example ../.env
```

**Start**

Run from the `infra/` directory:

```sh
docker compose up --build
```

This starts four services:

| Service | Role |
|---------|------|
| `mysql` | MySQL 8.0, persistent volume, event scheduler enabled |
| `redis` | Redis 7, in-memory cache for resolved Clerk user IDs |
| `app` | Node.js/Express application server on port 3000 (internal only) |
| `nginx` | Reverse proxy and static file server, exposed on port 80 |

Port 80 is the public entry point. Port 3306 is bound to localhost only for direct DB access during development.

**ngrok overlay (webhook dev)**

To expose port 80 through a public tunnel for Clerk webhook delivery:

```sh
docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up -d
```

Requires `NGROK_AUTHTOKEN` in `.env` (get from https://dashboard.ngrok.com/authtokens). The tunnel URL appears at http://localhost:4040 and in the ngrok container logs. Register it as a Clerk webhook endpoint: `https://<tunnel-id>.ngrok.io/api/webhooks/clerk` with events `user.created` and `user.deleted`, then set `CLERK_WEBHOOK_SECRET` in `.env` and restart the app container.

---

## Kubernetes

**Prerequisites**

- `kubectl` configured against a running cluster
- An nginx-ingress controller deployed in the cluster
- A StorageClass named `standard` for MySQL persistent storage

**Prepare secrets**

All `**/secret.yaml` files contain placeholder base64 values. Replace them with real credentials encoded in base64 before applying. For production clusters, use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) to encrypt secrets before committing.

Replace `OWNER` in `app/deployment.yaml` and `nginx/deployment.yaml` image references with your GitHub username (GHCR images are at `ghcr.io/OWNER/pf-tracker-*`).

**Apply**

```sh
kubectl apply -f infra/k8s/
```

**Verify**

```sh
kubectl get pods -n pf-tracker
kubectl get ingress -n pf-tracker
```

---

## K3s

**Prerequisites**

- A running K3s cluster — Traefik ingress controller and `local-path` StorageClass are built in by default

**K3s differences from vanilla K8s**

K3s ships with Traefik instead of nginx-ingress and uses `local-path` as the default StorageClass instead of `standard`. The Kustomize overlay in `infra/k3s/` patches both differences automatically — no manual file edits needed.

**Apply base stack**

```sh
kubectl apply -k infra/k3s/
```

**ngrok overlay**

For webhook development on K3s:

```sh
kubectl apply -k infra/k3s/ngrok/
```

This applies the same K3s patches (Traefik ingress class, local-path storage) and includes the ngrok Deployment and its Secret. Set the ngrok auth token in `infra/k8s/ngrok/secret.yaml` before applying.

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

[ -f .env ] && set -a && . ./.env && set +a

COMPOSE_SERVICE="mysql"
CONTAINER=""
MAX_WAIT=300
POLL=5

echo "==> Starting MySQL container..."
docker compose up -d

CONTAINER=$(docker compose ps -q "$COMPOSE_SERVICE")
echo "==> Container: $CONTAINER"

echo "==> Waiting for MySQL to be ready (up to ${MAX_WAIT}s)..."
elapsed=0
while ! docker exec "$CONTAINER" mysqladmin ping -h localhost --silent 2>/dev/null; do
    if [ "$elapsed" -ge "$MAX_WAIT" ]; then
        echo "ERROR: MySQL was not ready within ${MAX_WAIT}s"
        docker compose logs --tail=30
        exit 1
    fi
    sleep "$POLL"
    elapsed=$((elapsed + POLL))
    echo "  ...waiting ($elapsed/${MAX_WAIT}s)"
done

echo "==> MySQL is ready. Initializing schema..."
docker exec -i "$CONTAINER" mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" < schema/schema.sql

echo "==> Loading seed data..."
docker exec -i "$CONTAINER" mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" < seed/seed.sql

echo "==> Verifying tables..."
docker exec "$CONTAINER" mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" personal_finance -e "SHOW TABLES;"

echo "==> Done. MySQL is running on port 3306."
echo "    Connect: docker exec -it $CONTAINER mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" personal_finance"

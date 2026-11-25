#!/usr/bin/env bash
# Deploy ScamShield's backend to a cloud server from this machine. Safe to re-run for every update.
#
#   deploy/deploy.sh <server-ip> [domain]
#
# domain defaults to <server-ip>.sslip.io (free DNS name that resolves to the IP, so Caddy can get HTTPS).
# Secrets come from your local .env (git-ignored) and are copied to the server's .env (chmod 600).
set -euo pipefail

HOST=${1:?usage: deploy/deploy.sh <server-ip> [domain]}
DOMAIN=${2:-$HOST.sslip.io}
KEY=${SSH_KEY:-$HOME/.ssh/scamshield_ed25519}
REMOTE=/opt/scamshield
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "root@$HOST")
cd "$(dirname "$0")/.."

echo "==> Server setup (first run only)"
"${SSH[@]}" "test -f $REMOTE/.setup-done" || "${SSH[@]}" 'bash -s' < deploy/setup-server.sh

echo "==> Production .env"
umask 077
python3 - "$DOMAIN" > deploy/.env.production <<'PY'
import sys
domain = sys.argv[1]
env = {}
for line in open(".env"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k] = v
env.update(DOMAIN=domain, DATA_DIR="/data", SANDBOX_URL="http://sandbox:9000",
           CORS_ORIGINS=env.get("PROD_CORS_ORIGINS", "https://localhost"), DISCOVERY_ENABLED="true")
for k in ("PUBLIC_API_URL", "PROD_CORS_ORIGINS"):
    env.pop(k, None)
print("\n".join(f"{k}={v}" for k, v in env.items()))
PY

echo "==> Copy code and data"
rsync -az --delete -e "ssh -i $KEY" \
  --exclude .git --exclude .venv --exclude node_modules --exclude frontend/dist --exclude .vite \
  --exclude __pycache__ --exclude '.env' --exclude 'deploy/.env.production' \
  --exclude data/scamshield.db --exclude data/evidence --exclude data/jobs --exclude data/eval_run \
  ./ "root@$HOST:$REMOTE/"
rsync -az -e "ssh -i $KEY" --chmod=600 deploy/.env.production "root@$HOST:$REMOTE/.env"

# First deploy only: bring the seeded demo database and its evidence along.
if ! "${SSH[@]}" "test -f $REMOTE/data/scamshield.db" && [ -f data/scamshield.db ]; then
  echo "==> Copy demo data (first deploy)"
  rsync -az -e "ssh -i $KEY" data/scamshield.db "root@$HOST:$REMOTE/data/"
  rsync -az -e "ssh -i $KEY" data/evidence "root@$HOST:$REMOTE/data/"
fi

echo "==> Build and start"
"${SSH[@]}" "cd $REMOTE && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build backend sandbox demo-sites caddy"

echo "==> Waiting for https://$DOMAIN/health"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    curl -sS "https://$DOMAIN/health"; echo
    echo "Backend is live: https://$DOMAIN"
    exit 0
  fi
  sleep 10
done
echo "Backend did not answer within 10 minutes. Check: ssh -i $KEY root@$HOST 'cd $REMOTE && docker compose logs --tail 50'" >&2
exit 1

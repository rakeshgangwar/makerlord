#!/usr/bin/env bash
# Deploy MakerLord to the infra server. Run from the repo root on the dev box.
#   ./deploy/deploy.sh          full deploy (bootstrap + sync + build + restart)
#   ./deploy/deploy.sh sync     sync + build + restart only
set -euo pipefail

HOST="${MAKERLORD_DEPLOY_HOST:-infra}"
DIR=/opt/makerlord
NODE_VERSION=v22.22.1

if [ "${1:-full}" = "full" ]; then
  echo "== bootstrap: node22 tarball, ngspice, dirs (system node untouched)"
  ssh "$HOST" bash -s <<EOF
set -euo pipefail
if [ ! -x /opt/node-v22/bin/node ]; then
  curl -fsSL https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz -o /tmp/node22.tar.xz
  mkdir -p /opt/node-v22
  tar -xJf /tmp/node22.tar.xz -C /opt/node-v22 --strip-components=1
fi
apt-get install -y -q ngspice > /dev/null 2>&1 || apt-get update -q && apt-get install -y -q ngspice
mkdir -p $DIR $DIR/projects
EOF
fi

echo "== sync tree"
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude vendor --exclude .env \
  --exclude .svelte-kit --exclude 'packages/ui/build' --exclude dist \
  --exclude projects --exclude '*.tsbuildinfo' \
  ./ "$HOST:$DIR/"

echo "== secrets (.env stays out of the sync; token appended once)"
scp -q .env "$HOST:$DIR/.env.base"
ssh "$HOST" bash -s <<'EOF'
set -euo pipefail
cd /opt/makerlord
if [ -f .env ] && grep -q MAKERLORD_ACCESS_TOKEN .env; then
  TOKEN_LINE=$(grep MAKERLORD_ACCESS_TOKEN .env)
else
  TOKEN_LINE="MAKERLORD_ACCESS_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
fi
cp .env.base .env && rm .env.base
echo "$TOKEN_LINE" >> .env
EOF

echo "== corpus (public fork, cloned server-side)"
ssh "$HOST" "cd $DIR && [ -d vendor/fritzing-parts/core ] || git clone --depth 1 https://github.com/rakeshgangwar/fritzing-parts vendor/fritzing-parts"

echo "== build"
ssh "$HOST" bash -s <<'EOF'
set -euo pipefail
cd /opt/makerlord
export PATH=/opt/node-v22/bin:$PATH
export CI=true
corepack enable --install-directory /opt/node-v22/bin > /dev/null 2>&1 || true
corepack prepare --activate > /dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm typecheck
ORIGIN=https://makerlord.dev pnpm --filter @makerlord/ui build
EOF

echo "== services + nginx"
scp -q deploy/makerlord-api.service deploy/makerlord-ui.service "$HOST:/etc/systemd/system/"
scp -q deploy/nginx-makerlord.conf "$HOST:/etc/nginx/sites-available/makerlord.dev"
ssh "$HOST" bash -s <<'EOF'
set -euo pipefail
ln -sf /etc/nginx/sites-available/makerlord.dev /etc/nginx/sites-enabled/makerlord.dev
nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable --now makerlord-api makerlord-ui
systemctl restart makerlord-api makerlord-ui
sleep 1
systemctl is-active makerlord-api makerlord-ui
EOF

echo "== done. TLS: run once on the server if not yet issued:"
echo "   ssh $HOST certbot --nginx -d makerlord.dev --non-interactive --agree-tos -m <email>"

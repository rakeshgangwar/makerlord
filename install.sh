#!/usr/bin/env bash
# maker-bridge installer — puts a `maker-bridge` command on your PATH and
# stores its config, so the local brain is one command from any terminal.
#
#   ./install.sh                       # from a repo checkout (builds if needed)
#   ./install.sh --bundle bridge.cjs   # from a downloaded CI artifact
#   ./install.sh --token <token>       # non-interactive token
set -euo pipefail

BIN_DIR="${MAKERLORD_BIN_DIR:-$HOME/.local/bin}"
CONF_DIR="$HOME/.makerlord"
CONF="$CONF_DIR/bridge.json"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TOKEN=""
BUNDLE=""
API="https://makerlord.dev"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)  TOKEN="$2"; shift 2 ;;
    --bundle) BUNDLE="$2"; shift 2 ;;
    --api)    API="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

command -v node >/dev/null || { echo "node >= 20 is required (nodejs.org)"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || { echo "node >= 20 required, found $(node -v)"; exit 1; }

# ── the bundle: use the one given, or build from this checkout ─────────
if [[ -n "$BUNDLE" ]]; then
  mkdir -p "$CONF_DIR"
  cp "$BUNDLE" "$CONF_DIR/bridge.cjs"
  TARGET="$CONF_DIR/bridge.cjs"
else
  if [[ ! -f "$REPO_DIR/dist/bridge.cjs" ]]; then
    echo "building the bridge bundle…"
    (cd "$REPO_DIR" && CI=true pnpm install --frozen-lockfile >/dev/null \
      && pnpm typecheck >/dev/null \
      && node scripts/build-bridge-bundle.mjs)
  fi
  TARGET="$REPO_DIR/dist/bridge.cjs"
fi

# ── token: flag > existing config > prompt ────────────────────────────
# Your token is PER-USER (mlt_…): mint it from the signed-in strip in
# the web UI ("bridge token" — shown once), or `maker token new --user
# <handle>` on the server.
if [[ -z "$TOKEN" && -f "$CONF" ]]; then
  TOKEN="$(node -p "try{JSON.parse(require('fs').readFileSync('$CONF','utf8')).token??''}catch{''}")"
fi
if [[ -z "$TOKEN" ]]; then
  read -rp "your per-user API token (mlt_…, minted in the web UI): " TOKEN
fi
[[ -n "$TOKEN" ]] || { echo "a token is required"; exit 1; }

mkdir -p "$CONF_DIR" "$BIN_DIR"
node -e "
const fs = require('fs');
fs.writeFileSync('$CONF', JSON.stringify({ token: '$TOKEN', api: '$API' }, null, 2) + '\n');
fs.chmodSync('$CONF', 0o600);
"

cat > "$BIN_DIR/maker-bridge" <<WRAP
#!/usr/bin/env bash
exec node "$TARGET" "\$@"
WRAP
chmod +x "$BIN_DIR/maker-bridge"
ln -sf "$BIN_DIR/maker-bridge" "$BIN_DIR/mlb"

echo
echo "installed: $BIN_DIR/maker-bridge (alias: mlb)  →  $TARGET"
echo "config:    $CONF (0600)"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: add $BIN_DIR to your PATH" ;;
esac
echo
echo "run \`maker-bridge\` — it auto-detects your ACP agent (claude-code,"
echo "codex, gemini, goose, qwen, kimi, or --agent <command>) and prints"
echo "the pairing code for the web app's ⚡ local brain."

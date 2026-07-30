#!/usr/bin/env bash
# maker-bridge installer — a guided setup for the local brain.
#
#   curl -fsSL https://makerlord.dev/install.sh | bash          # guided
#   … | bash -s -- --token <mlt_…>                              # non-interactive
#   ./install.sh                       # from a repo checkout (builds if needed)
#   ./install.sh --bundle bridge.cjs   # from a downloaded artifact
set -euo pipefail

BIN_DIR="${MAKERLORD_BIN_DIR:-$HOME/.local/bin}"
CONF_DIR="$HOME/.makerlord"
CONF="$CONF_DIR/bridge.json"
# Piped from curl there is no source file — that's fetch mode.
SRC="${BASH_SOURCE[0]:-}"
REPO_DIR=""
if [[ -n "$SRC" && -f "$(cd "$(dirname "$SRC")" && pwd)/scripts/build-bridge-bundle.mjs" ]]; then
  REPO_DIR="$(cd "$(dirname "$SRC")" && pwd)"
fi

TOKEN=""
BUNDLE=""
API="${MAKERLORD_API:-https://makerlord.dev}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --token)  TOKEN="$2"; shift 2 ;;
    --bundle) BUNDLE="$2"; shift 2 ;;
    --api)    API="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

say()  { printf '%s\n' "$*"; }
step() { printf '\n\033[1m[%s/4]\033[0m %s\n' "$1" "$2"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

say ""
say "  MakerLord — local brain setup"
say "  Your own agent (Claude Code, Codex, Gemini, Goose, Qwen, Kimi…)"
say "  drives your project; every tool call still runs on the hosted"
say "  engine, gates intact."

# ── [1/4] prerequisites ───────────────────────────────────────────────
step 1 "Checking prerequisites"
command -v node >/dev/null || { warn "node >= 20 is required — install from nodejs.org and re-run"; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || { warn "node >= 20 required, found $(node -v)"; exit 1; }
ok "node $(node -v)"

# ── [2/4] the bridge bundle: given > built from a checkout > fetched ──
step 2 "Getting the bridge"
if [[ -n "$BUNDLE" ]]; then
  mkdir -p "$CONF_DIR"
  cp "$BUNDLE" "$CONF_DIR/bridge.cjs"
  TARGET="$CONF_DIR/bridge.cjs"
  ok "using the bundle you provided"
elif [[ -n "$REPO_DIR" ]]; then
  if [[ ! -f "$REPO_DIR/dist/bridge.cjs" ]]; then
    say "  building from this checkout (a minute the first time)…"
    (cd "$REPO_DIR" && CI=true pnpm install --frozen-lockfile >/dev/null \
      && pnpm typecheck >/dev/null \
      && node scripts/build-bridge-bundle.mjs >/dev/null)
  fi
  TARGET="$REPO_DIR/dist/bridge.cjs"
  ok "built from the repo checkout"
else
  mkdir -p "$CONF_DIR"
  curl -fsSL "$API/bridge.cjs" -o "$CONF_DIR/bridge.cjs"
  TARGET="$CONF_DIR/bridge.cjs"
  ok "fetched from $API ($(du -h "$TARGET" | cut -f1 | tr -d ' '))"
fi

# ── [3/4] the token: flag > existing config > guided prompt ───────────
step 3 "Your bridge token"
if [[ -z "$TOKEN" && -f "$CONF" ]]; then
  TOKEN="$(node -p "try{JSON.parse(require('fs').readFileSync('$CONF','utf8')).token??''}catch{''}")"
  [[ -n "$TOKEN" ]] && ok "reusing the token already configured"
fi
if [[ -z "$TOKEN" ]]; then
  say "  The token authenticates the bridge as YOU. Mint it at"
  say "    $API/settings  →  \"Mint a bridge token\"  (shown once)."
  # /dev/tty so the prompt works when the script arrives through a pipe.
  read -rp "  paste it here (mlt_…): " TOKEN < /dev/tty
fi
[[ -n "$TOKEN" ]] || { warn "a token is required"; exit 1; }
case "$TOKEN" in
  mlt_*) ;;
  *) warn "that doesn't look like a bridge token (they start with mlt_) — continuing anyway" ;;
esac
if curl -fsS -m 8 -o /dev/null -H "Authorization: Bearer $TOKEN" "$API/api/projects" 2>/dev/null; then
  ok "token verified against $API"
else
  warn "could not verify the token against $API — installed anyway; mlb will tell you if it's wrong"
fi

# ── [4/4] install ─────────────────────────────────────────────────────
step 4 "Installing"
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
ok "command: $BIN_DIR/mlb (alias of maker-bridge)"
ok "config:  $CONF (0600)"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not on your PATH — add it to your shell profile" ;;
esac

say ""
say "  Done. Next:"
say "    1. run \`mlb\` — it auto-detects your agent and prints a 6-digit pairing code"
say "    2. open $API, click ⚡ local brain, enter the code once"
say "  The lamp turns green; your messages now drive your own agent."
say ""

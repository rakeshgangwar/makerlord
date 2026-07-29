#!/usr/bin/env bash
set -euo pipefail

fail=0
check() {
  if command -v "$1" >/dev/null 2>&1; then
    printf '  ok    %-10s %s\n' "$1" "$($1 --version 2>&1 | head -1)"
  else
    printf '  MISS  %-10s\n' "$1"; fail=1
  fi
}
echo "toolchain:"
for c in node pnpm git docker; do check "$c"; done

echo "corpus:"
corpus="${MAKERLORD_FRITZING_PATH:-./vendor/fritzing-parts}"
count=$(find "$corpus/core" -name '*.fzp' 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -ge 1794 ]; then
  printf '  ok    %s core parts\n' "$count"
else
  printf '  MISS  expected >=1794 core parts, found %s\n' "$count"; fail=1
fi

echo "disk:"
avail=$(df -BG --output=avail . | tail -1 | tr -dc '0-9')
if [ "$avail" -ge 20 ]; then
  printf '  ok    %sG available\n' "$avail"
else
  printf '  WARN  only %sG available; Slice 3 needs 20-30G\n' "$avail"
fi

exit $fail

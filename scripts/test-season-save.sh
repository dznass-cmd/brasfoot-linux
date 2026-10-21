#!/usr/bin/env bash
set -euo pipefail
BRASFOOT_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRASFOOT_SEASON_FILE="${1:-/tmp/brasfoot-engine-season-BRA_A.json}"
if [[ ! -f "$BRASFOOT_SEASON_FILE" ]]; then
  printf 'Missing season fixture. Run node scripts/test-engine-v2.cjs first.\n' >&2
  exit 1
fi
BRASFOOT_TEST_DIR="$(mktemp -d /tmp/brasfoot-season-test.XXXXXX)"
trap 'rm -rf -- "$BRASFOOT_TEST_DIR"' EXIT
cc -std=gnu11 -O2 -Wall -Wextra -Werror \
  "$BRASFOOT_PROJECT_DIR/scripts/test-offline-native.c" -o "$BRASFOOT_TEST_DIR/test-native" \
  $(pkg-config --cflags --libs gtk4 webkitgtk-6.0)
unshare --user --map-current-user --net env GDK_BACKEND=x11 \
  XDG_DATA_HOME="$BRASFOOT_TEST_DIR/data" XDG_CACHE_HOME="$BRASFOOT_TEST_DIR/cache" \
  "$BRASFOOT_TEST_DIR/test-native" "$BRASFOOT_PROJECT_DIR" "$BRASFOOT_TEST_DIR/season-export.json" --season "$BRASFOOT_SEASON_FILE"
python3 - "$BRASFOOT_TEST_DIR/season-export.json" <<'PY'
import json, sys
state = json.load(open(sys.argv[1]))
assert state['currentRound'] == 39
assert len([m for r in state['rounds'] for m in r['matches'] if m['isPlayed']]) == 380
print('PASS: complete native season export contains all 380 fixtures.')
PY

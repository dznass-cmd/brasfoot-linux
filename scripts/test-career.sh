#!/usr/bin/env bash
set -euo pipefail
BRASFOOT_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRASFOOT_CAREER_FILE="${1:-/tmp/brasfoot-career-legacy-complete.json}"
if [[ ! -f "$BRASFOOT_CAREER_FILE" ]]; then
  printf 'Missing legacy fixture. Run node scripts/test-career.cjs first.\n' >&2
  exit 1
fi
BRASFOOT_TEST_DIR="$(mktemp -d /tmp/brasfoot-career-test.XXXXXX)"
trap 'rm -rf -- "$BRASFOOT_TEST_DIR"' EXIT
cc -std=gnu11 -O2 -Wall -Wextra -Werror \
  "$BRASFOOT_PROJECT_DIR/scripts/test-offline-native.c" -o "$BRASFOOT_TEST_DIR/test-native" \
  $(pkg-config --cflags --libs gtk4 webkitgtk-6.0)
unshare --user --map-current-user --net env GDK_BACKEND=x11 \
  XDG_DATA_HOME="$BRASFOOT_TEST_DIR/data" XDG_CACHE_HOME="$BRASFOOT_TEST_DIR/cache" \
  "$BRASFOOT_TEST_DIR/test-native" "$BRASFOOT_PROJECT_DIR" "$BRASFOOT_TEST_DIR/career-export.json" --career "$BRASFOOT_CAREER_FILE"
python3 - "$BRASFOOT_TEST_DIR/career-export.json" <<'PY'
import json, sys
with open(sys.argv[1]) as file:
    state = json.load(file)
assert state['seasonYear'] == state['continuityProbe']['year'] + 1
assert state['currentRound'] == 1
assert len(state['seasonHistory']) == 1
assert sum(len(d['results']) for d in state['seasonHistory'][0]['divisions']) == 1520
assert state['activeMatch']['minute'] == 3 and state['activeMatch']['paused']
assert len(set(t for d in state['careerDivisions'] for t in d['teams'])) == 80
print('PASS: exported continued career preserves year, 1520 historical results, 80 clubs and a live next-year fixture.')
PY

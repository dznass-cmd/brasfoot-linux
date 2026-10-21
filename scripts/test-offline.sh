#!/usr/bin/env bash
set -euo pipefail
BRASFOOT_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRASFOOT_TEST_DIR="$(mktemp -d /tmp/brasfoot-offline-test.XXXXXX)"
trap 'rm -rf -- "$BRASFOOT_TEST_DIR"' EXIT
python3 "$BRASFOOT_PROJECT_DIR/scripts/check-offline.py"
cc -std=gnu11 -O2 -Wall -Wextra -Werror \
  "$BRASFOOT_PROJECT_DIR/scripts/test-offline-native.c" -o "$BRASFOOT_TEST_DIR/test-native" \
  $(pkg-config --cflags --libs gtk4 webkitgtk-6.0)
run_offline() {
  unshare --user --map-current-user --net env GDK_BACKEND=x11 \
    XDG_DATA_HOME="$BRASFOOT_TEST_DIR/data" XDG_CACHE_HOME="$BRASFOOT_TEST_DIR/cache" \
    "$BRASFOOT_TEST_DIR/test-native" "$BRASFOOT_PROJECT_DIR" "$@"
}
run_offline "$BRASFOOT_TEST_DIR/save.json"
run_offline "$BRASFOOT_TEST_DIR/save-resumed.json" --resume
python3 - "$BRASFOOT_TEST_DIR" <<'PY'
import json,sys
from pathlib import Path
for name in ('save.json','save-resumed.json'):
    state=json.loads((Path(sys.argv[1])/name).read_text())
    assert state['activeMatch']['minute']==3
    assert state['activeMatch']['paused']
    assert state['activeMatch']['substitutions'][state['activeMatch']['userSide']]==1
print('PASS: exported JSON saves are valid and preserve the live match offline.')
PY

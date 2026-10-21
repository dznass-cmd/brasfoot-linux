#!/usr/bin/env bash
set -euo pipefail
BRASFOOT_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRASFOOT_PROFILE_FIXTURE="${1:-/tmp/brasfoot-profile-preseason.json}"
if [[ ! -f "$BRASFOOT_PROFILE_FIXTURE" ]]; then
  printf 'Run node scripts/test-manager-profile.cjs to prepare the isolated fixture.\n' >&2
  exit 1
fi
BRASFOOT_PROFILE_TEST_DIR="$(mktemp -d /tmp/brasfoot-profile-test.XXXXXX)"
trap 'rm -rf -- "$BRASFOOT_PROFILE_TEST_DIR"' EXIT
cc -std=gnu11 -O2 -Wall -Wextra -Werror \
  "$BRASFOOT_PROJECT_DIR/scripts/test-offline-native.c" -o "$BRASFOOT_PROFILE_TEST_DIR/test-native" \
  $(pkg-config --cflags --libs gtk4 webkitgtk-6.0)
unshare --user --map-current-user --net env GDK_BACKEND=x11 \
  XDG_DATA_HOME="$BRASFOOT_PROFILE_TEST_DIR/data" XDG_CACHE_HOME="$BRASFOOT_PROFILE_TEST_DIR/cache" \
  "$BRASFOOT_PROFILE_TEST_DIR/test-native" "$BRASFOOT_PROJECT_DIR" "$BRASFOOT_PROFILE_TEST_DIR/profile-export.json" --profile "$BRASFOOT_PROFILE_FIXTURE"
python3 - "$BRASFOOT_PROFILE_TEST_DIR/profile-export.json" <<'PY'
import json, sys
with open(sys.argv[1]) as file:
    state = json.load(file)
assert state['userTeamId'] == state['profileProbe']['destinationId']
assert state['currentRound'] == 2
assert state['managerProfile']['name'] == 'Treinador Teste'
assert len(state['managerProfile']['tenures']) == 2
assert len(state['seasonHistory']) == 1
assert len(set(t['id'] for t in state['divisionTeams'] + state['reserveTeams'])) == 80
print('PASS: exported manager career preserves identity, two clubs, former results and the next round.')
PY

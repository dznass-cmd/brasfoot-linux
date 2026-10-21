#!/usr/bin/env bash
set -euo pipefail
BRASFOOT_PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRASFOOT_BINARY_TMP="$(mktemp "$BRASFOOT_PROJECT_DIR/.brasfoot-build.XXXXXX")"
trap 'rm -f -- "$BRASFOOT_BINARY_TMP"' EXIT
cc -std=gnu11 -O2 -Wall -Wextra -Werror \
  "$BRASFOOT_PROJECT_DIR/src-native/main.c" -o "$BRASFOOT_BINARY_TMP" \
  $(pkg-config --cflags --libs gtk4 webkitgtk-6.0)
chmod 755 "$BRASFOOT_BINARY_TMP"
mv -f -- "$BRASFOOT_BINARY_TMP" "$BRASFOOT_PROJECT_DIR/brasfoot-app"
printf 'Executável offline compilado: %s/brasfoot-app\n' "$BRASFOOT_PROJECT_DIR"

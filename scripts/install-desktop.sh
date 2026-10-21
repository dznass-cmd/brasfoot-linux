#!/bin/bash
set -e

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

mkdir -p "$TARGET_DIR"

sed \
  -e "s|^Exec=.*|Exec=\"$DIR/brasfoot\"|" \
  -e "s|^Icon=.*|Icon=\"$DIR/assets/icons/ic_champion.png\"|" \
  "$DIR/Brasfoot.desktop" > "$TARGET_DIR/Brasfoot.desktop"

chmod +x "$TARGET_DIR/Brasfoot.desktop"

echo "Atalho instalado com sucesso em $TARGET_DIR/Brasfoot.desktop"

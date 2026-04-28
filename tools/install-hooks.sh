#!/usr/bin/env bash
# Installer fuer Room8 Git-Hooks.
# Einmal pro Maschine ausfuehren: bash tools/install-hooks.sh

set -e
ROOT="$(git rev-parse --show-toplevel)"
SRC="$ROOT/tools/git-hooks"
DST="$ROOT/.git/hooks"

if [ ! -d "$SRC" ]; then
    echo "FAIL: $SRC nicht gefunden"
    exit 1
fi

for hook in "$SRC"/*; do
    name=$(basename "$hook")
    cp "$hook" "$DST/$name"
    chmod +x "$DST/$name"
    echo "OK   installed: $name"
done

echo ""
echo "Git-Hooks aktiv. Bypass im Notfall: git commit --no-verify"

#!/usr/bin/env bash
# Bootstrap Chromium source + depot_tools for the patched-binary build.
#
# Usage:  ./bootstrap.sh [/abs/path/to/source/root]
# Default source root: $HOME/agentic-chromium
#
# Disk:   ~30 GB after fetch, ~80 GB after first build.
# Time:   ~30-60 min on a fast connection.

set -euo pipefail

ROOT="${1:-$HOME/agentic-chromium}"
DEPOT="$ROOT/depot_tools"
SRC="$ROOT/src"

mkdir -p "$ROOT"
cd "$ROOT"

if [[ ! -d "$DEPOT" ]]; then
  echo ">> cloning depot_tools"
  git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$DEPOT"
fi
export PATH="$DEPOT:$PATH"

if [[ ! -d "$SRC" ]]; then
  echo ">> fetching chromium tree (this takes a while)"
  fetch --nohooks --no-history chromium
fi

cd "$SRC"
echo ">> syncing"
gclient sync --with_branch_heads --nohooks

echo ">> install build deps"
case "$(uname -s)" in
  Linux)  build/install-build-deps.sh --no-prompt ;;
  Darwin) echo "(macOS: dependencies installed by gclient)" ;;
  *)      echo "Run install-build-deps manually for $(uname -s)" ;;
esac

echo ">> runhooks"
gclient runhooks

echo ""
echo "Bootstrap complete."
echo "Source root: $SRC"
echo "Next step:   ./build.sh $SRC"

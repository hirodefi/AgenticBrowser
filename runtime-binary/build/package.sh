#!/usr/bin/env bash
# Package the built binary into a release archive that the JS runtime
# can auto-download and unpack into ~/.agentic-browser/binary/.

set -euo pipefail

SRC="${1:?usage: package.sh /path/to/chromium/src out/Agentic}"
OUT="${2:-out/Agentic}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING="$SCRIPT_DIR/../staging"
DIST="$SCRIPT_DIR/../dist"

UNAME="$(uname -s)"
MACHINE="$(uname -m)"
case "$UNAME" in
  Darwin) PLATFORM="darwin-$([[ $MACHINE == arm64 ]] && echo arm64 || echo x64)" ;;
  Linux)  PLATFORM="linux-$([[ $MACHINE == aarch64 ]] && echo arm64 || echo x64)" ;;
  *)      PLATFORM="$UNAME-$MACHINE" ;;
esac

VERSION="$(grep -E '^MAJOR=' "$SRC/chrome/VERSION" | cut -d= -f2).$(grep -E '^MINOR=' "$SRC/chrome/VERSION" | cut -d= -f2).$(grep -E '^BUILD=' "$SRC/chrome/VERSION" | cut -d= -f2).$(grep -E '^PATCH=' "$SRC/chrome/VERSION" | cut -d= -f2)"

mkdir -p "$STAGING" "$DIST"
rm -rf "$STAGING"/*

case "$UNAME" in
  Darwin)
    cp -R "$SRC/$OUT/Chromium.app" "$STAGING/"
    ARCHIVE="$DIST/agentic-browser-$PLATFORM-$VERSION.tar.gz"
    tar -czf "$ARCHIVE" -C "$STAGING" Chromium.app
    ;;
  Linux)
    mkdir -p "$STAGING/agentic-browser"
    cp "$SRC/$OUT/chrome" "$STAGING/agentic-browser/"
    cp -R "$SRC/$OUT"/{*.pak,*.bin,locales,resources} "$STAGING/agentic-browser/" 2>/dev/null || true
    ARCHIVE="$DIST/agentic-browser-$PLATFORM-$VERSION.tar.gz"
    tar -czf "$ARCHIVE" -C "$STAGING" agentic-browser
    ;;
  *)
    echo "Unsupported platform: $UNAME" >&2
    exit 1
    ;;
esac

echo "Archive: $ARCHIVE"
sha256sum "$ARCHIVE" 2>/dev/null || shasum -a 256 "$ARCHIVE"

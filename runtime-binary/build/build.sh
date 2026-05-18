#!/usr/bin/env bash
# Apply our patches and build the patched Chromium binary.
#
# Usage:  ./build.sh /abs/path/to/chromium/src [release|debug]
# Output: $SRC/out/Agentic/chrome (or chrome.exe / Chromium.app)

set -euo pipefail

SRC="${1:?usage: build.sh /path/to/chromium/src [release|debug]}"
FLAVOR="${2:-release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCHES_DIR="$SCRIPT_DIR/../patches"

cd "$SRC"

echo ">> applying patches"
# Apply in numeric order so dependencies between patches are explicit
shopt -s nullglob
PATCH_FILES=("$PATCHES_DIR"/*.patch)
if [[ ${#PATCH_FILES[@]} -gt 0 ]]; then
  for patch in $(printf '%s\n' "${PATCH_FILES[@]}" | sort); do
    name="$(basename "$patch")"
    if git -C "$SRC" apply --check "$patch" >/dev/null 2>&1; then
      git -C "$SRC" apply "$patch"
      echo "   applied $name"
    else
      echo "   skipped $name (already applied or non-applicable)"
    fi
  done
else
  echo "   (no patch files in $PATCHES_DIR yet)"
fi

OUT="out/Agentic"
mkdir -p "$OUT"

ARGS=(
  'target_os = "'"$(uname -s | tr '[:upper:]' '[:lower:]' | sed 's/darwin/mac/;s/_nt-.*//')"'"'
  'is_component_build = false'
  'symbol_level = 0'
  'blink_symbol_level = 0'
  'enable_nacl = false'
  'is_official_build = '"$([[ "$FLAVOR" == "release" ]] && echo true || echo false)"
  'is_debug = '"$([[ "$FLAVOR" == "debug" ]] && echo true || echo false)"
  'dcheck_always_on = false'
  'use_thin_lto = '"$([[ "$FLAVOR" == "release" ]] && echo true || echo false)"
  'chrome_pgo_phase = 0'
  'enable_widevine = false'
  'proprietary_codecs = true'
  'ffmpeg_branding = "Chrome"'
)
printf '%s\n' "${ARGS[@]}" > "$OUT/args.gn"

echo ">> gn gen"
gn gen "$OUT"

echo ">> ninja build (this is the long one)"
autoninja -C "$OUT" chrome

echo ""
echo "Build complete: $SRC/$OUT/"
echo "Next step:      ./package.sh $SRC $OUT"

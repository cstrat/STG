#!/usr/bin/env bash
# STG — SASE Traffic Generator launcher
# Handles Linux quirks so the AppImage runs + shows its icon correctly:
#   1. Unsets ELECTRON_RUN_AS_NODE (set by Claude Code / some IDEs)
#   2. Creates ~/.local/lib/libz.so symlink if missing (Ubuntu 22+ ships versioned only)
#   3. Uses APPIMAGE_EXTRACT_AND_RUN=1 so libfuse2 isn't required
#   4. Installs a user-level desktop file + icons on first run so the dock / app
#      switcher shows the STG icon instead of a generic Electron cog

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pick the AppImage that matches this machine's architecture. `uname -m` returns
# "aarch64" on arm64 and "x86_64" on amd64. Fall back to any AppImage if nothing
# arch-specific matches (single-arch dev builds).
MACH=$(uname -m)
case "$MACH" in
  aarch64|arm64)  ARCH_PAT='-arm64.AppImage' ;;
  x86_64|amd64)   ARCH_PAT='-x86_64.AppImage' ;;
  *)              ARCH_PAT='.AppImage' ;;
esac
APPIMAGE=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/dist" -maxdepth 1 -name "*${ARCH_PAT}" 2>/dev/null | head -1)
# Fall back to any AppImage if no arch-specific match
[ -z "$APPIMAGE" ] && APPIMAGE=$(find "$SCRIPT_DIR" "$SCRIPT_DIR/dist" -maxdepth 1 -name "*.AppImage" 2>/dev/null | head -1)

if [ -z "$APPIMAGE" ]; then
  echo "ERROR: No AppImage found near $SCRIPT_DIR"
  exit 1
fi

APP_ID="stg-sase-traffic-generator"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_ID.desktop"
ICON_BASE="$HOME/.local/share/icons/hicolor"

# ── libz.so symlink (only if genuinely missing) ──
if ! ldconfig -p 2>/dev/null | grep -q "libz\.so " && [ ! -f "$HOME/.local/lib/libz.so" ]; then
  LIBZ=$(ldconfig -p 2>/dev/null | grep "libz\.so\." | awk '{print $NF}' | head -1)
  if [ -n "$LIBZ" ]; then
    mkdir -p "$HOME/.local/lib"
    ln -sf "$LIBZ" "$HOME/.local/lib/libz.so"
  fi
fi

# ── Desktop file + icons (first run only, or when AppImage is newer) ──
install_desktop_integration() {
  # Extract icons from the AppImage (--appimage-extract creates squashfs-root/ in cwd).
  # The AppImage runtime needs libz.so + can't use FUSE on newer distros, so pass
  # the same env as the main launch.
  local workdir
  workdir=$(mktemp -d)
  (
    cd "$workdir" && \
    LD_LIBRARY_PATH="$HOME/.local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$APPIMAGE" --appimage-extract 'usr/share/icons/*' >/dev/null 2>&1
  ) || (
    cd "$workdir" && \
    LD_LIBRARY_PATH="$HOME/.local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$APPIMAGE" --appimage-extract >/dev/null 2>&1
  )

  local src_icons="$workdir/squashfs-root/usr/share/icons/hicolor"
  if [ -d "$src_icons" ]; then
    for size_dir in "$src_icons"/*; do
      [ -d "$size_dir/apps" ] || continue
      size_name=$(basename "$size_dir")
      mkdir -p "$ICON_BASE/$size_name/apps"
      cp -f "$size_dir/apps/"*.png "$ICON_BASE/$size_name/apps/$APP_ID.png" 2>/dev/null || true
    done
  fi
  rm -rf "$workdir"

  cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Type=Application
Name=STG - SASE Traffic Generator
Comment=Generate categorised traffic for SASE demos
Exec=bash "$SCRIPT_DIR/launch.sh"
Icon=$APP_ID
StartupWMClass=STG - SASE Traffic Generator
Terminal=false
Categories=Network;
EOF

  command -v gtk-update-icon-cache   >/dev/null 2>&1 && gtk-update-icon-cache -q "$ICON_BASE"       2>/dev/null || true
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$(dirname "$DESKTOP_FILE")" 2>/dev/null || true
}

# Re-install whenever the AppImage is newer than the desktop file
if [ ! -f "$DESKTOP_FILE" ] || [ "$APPIMAGE" -nt "$DESKTOP_FILE" ]; then
  install_desktop_integration
fi

# Clean up stale extractions from previous runs — APPIMAGE_EXTRACT_AND_RUN
# leaves ~300MB per launch in /tmp, so we evict anything older than this one.
find /tmp -maxdepth 1 -name 'appimage_extracted_*' -type d -mmin +1 -exec rm -rf {} + 2>/dev/null || true

exec env \
  -u ELECTRON_RUN_AS_NODE \
  APPIMAGE_EXTRACT_AND_RUN=1 \
  LD_LIBRARY_PATH="$HOME/.local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
  "$APPIMAGE" --no-sandbox --disable-setuid-sandbox "$@"

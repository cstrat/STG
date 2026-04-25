#!/bin/sh
# Run by dpkg as root after STG is removed/purged.
# Uninstall the AppArmor profile written by after-install.sh so we don't
# leave dangling /etc/apparmor.d entries.

set -e

SYMLINK_PATH="/usr/bin/stg-sase-traffic-generator"
PROFILE_PATH="/etc/apparmor.d/stg-sase-traffic-generator"

# Tear down the /usr/bin shortcut created by after-install.sh.
if [ -L "$SYMLINK_PATH" ]; then
  rm -f "$SYMLINK_PATH"
fi

# Tear down the AppArmor profile created by after-install.sh.
if [ -f "$PROFILE_PATH" ]; then
  if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then
    apparmor_parser -R "$PROFILE_PATH" >/dev/null 2>&1 || true
  fi
  rm -f "$PROFILE_PATH"
fi

exit 0

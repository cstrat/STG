#!/bin/sh
# Run by dpkg as root after STG is removed/purged.
# Uninstall the AppArmor profile written by after-install.sh so we don't
# leave dangling /etc/apparmor.d entries.

set -e

PROFILE_PATH="/etc/apparmor.d/stg-sase-traffic-generator"

if [ -f "$PROFILE_PATH" ]; then
  if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then
    apparmor_parser -R "$PROFILE_PATH" >/dev/null 2>&1 || true
  fi
  rm -f "$PROFILE_PATH"
fi

exit 0

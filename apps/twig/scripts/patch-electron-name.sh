#!/bin/bash
# Patches the Electron binary's Info.plist to show "Array (Development)" in the macOS menu bar

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
PLIST_FILE="$REPO_ROOT/node_modules/electron/dist/Electron.app/Contents/Info.plist"

if [ ! -f "$PLIST_FILE" ]; then
  exit 0
fi

if /usr/libexec/PlistBuddy -c "Print :CFBundleName" "$PLIST_FILE" | grep -q "Array (Development)"; then
  exit 0
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleName 'Array (Development)'" "$PLIST_FILE"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'Array (Development)'" "$PLIST_FILE"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier 'com.posthog.array.dev'" "$PLIST_FILE"

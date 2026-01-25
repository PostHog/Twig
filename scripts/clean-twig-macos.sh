#!/bin/bash

# Clean Twig app data from macOS
#
# Usage:
#   ./scripts/clean-twig-macos.sh           # Clean data only
#   ./scripts/clean-twig-macos.sh --app     # Clean data and delete app

set -e

DELETE_APP=false

for arg in "$@"; do
  case $arg in
    --app)
      DELETE_APP=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--app]"
      echo ""
      echo "Options:"
      echo "  --app    Also delete Twig.app from /Applications"
      echo ""
      echo "This script removes:"
      echo "  - ~/Library/Application Support/@posthog/Array"
      echo "  - ~/Library/Application Support/@posthog/Twig"
      echo "  - ~/Library/Application Support/@posthog/twig-dev"
      echo "  - ~/Library/Preferences/com.posthog.array.plist"
      echo "  - ~/Library/Caches/com.posthog.array"
      echo "  - ~/Library/Logs/Twig"
      echo "  - ~/Library/Saved Application State/com.posthog.array.savedState"
      exit 0
      ;;
  esac
done

echo "Cleaning Twig data from macOS..."
echo ""

# Application Support - actual electron data locations
if [ -d "$HOME/Library/Application Support/@posthog/Array" ]; then
  echo "Removing ~/Library/Application Support/@posthog/Array"
  rm -rf "$HOME/Library/Application Support/@posthog/Array"
fi

if [ -d "$HOME/Library/Application Support/@posthog/Twig" ]; then
  echo "Removing ~/Library/Application Support/@posthog/Twig"
  rm -rf "$HOME/Library/Application Support/@posthog/Twig"
fi

if [ -d "$HOME/Library/Application Support/@posthog/twig-dev" ]; then
  echo "Removing ~/Library/Application Support/@posthog/twig-dev"
  rm -rf "$HOME/Library/Application Support/@posthog/twig-dev"
fi

# Clean up empty @posthog parent folder if it exists and is empty
if [ -d "$HOME/Library/Application Support/@posthog" ]; then
  rmdir "$HOME/Library/Application Support/@posthog" 2>/dev/null || true
fi

# Legacy locations (in case they exist)
if [ -d "$HOME/Library/Application Support/twig" ]; then
  echo "Removing ~/Library/Application Support/twig"
  rm -rf "$HOME/Library/Application Support/twig"
fi

if [ -d "$HOME/Library/Application Support/Twig" ]; then
  echo "Removing ~/Library/Application Support/Twig"
  rm -rf "$HOME/Library/Application Support/Twig"
fi

# Preferences
if [ -f "$HOME/Library/Preferences/com.posthog.array.plist" ]; then
  echo "Removing ~/Library/Preferences/com.posthog.array.plist"
  rm -f "$HOME/Library/Preferences/com.posthog.array.plist"
fi

if [ -f "$HOME/Library/Preferences/com.posthog.twig.plist" ]; then
  echo "Removing ~/Library/Preferences/com.posthog.twig.plist"
  rm -f "$HOME/Library/Preferences/com.posthog.twig.plist"
fi

# Caches
if [ -d "$HOME/Library/Caches/com.posthog.array" ]; then
  echo "Removing ~/Library/Caches/com.posthog.array"
  rm -rf "$HOME/Library/Caches/com.posthog.array"
fi

if [ -d "$HOME/Library/Caches/com.posthog.twig" ]; then
  echo "Removing ~/Library/Caches/com.posthog.twig"
  rm -rf "$HOME/Library/Caches/com.posthog.twig"
fi

if [ -d "$HOME/Library/Caches/twig" ]; then
  echo "Removing ~/Library/Caches/twig"
  rm -rf "$HOME/Library/Caches/twig"
fi

if [ -d "$HOME/Library/Caches/Twig" ]; then
  echo "Removing ~/Library/Caches/Twig"
  rm -rf "$HOME/Library/Caches/Twig"
fi

# Logs
if [ -d "$HOME/Library/Logs/twig" ]; then
  echo "Removing ~/Library/Logs/twig"
  rm -rf "$HOME/Library/Logs/twig"
fi

if [ -d "$HOME/Library/Logs/Twig" ]; then
  echo "Removing ~/Library/Logs/Twig"
  rm -rf "$HOME/Library/Logs/Twig"
fi

# Saved Application State
if [ -d "$HOME/Library/Saved Application State/com.posthog.array.savedState" ]; then
  echo "Removing ~/Library/Saved Application State/com.posthog.array.savedState"
  rm -rf "$HOME/Library/Saved Application State/com.posthog.array.savedState"
fi

if [ -d "$HOME/Library/Saved Application State/com.posthog.twig.savedState" ]; then
  echo "Removing ~/Library/Saved Application State/com.posthog.twig.savedState"
  rm -rf "$HOME/Library/Saved Application State/com.posthog.twig.savedState"
fi

# App (optional)
if [ "$DELETE_APP" = true ]; then
  if [ -d "/Applications/Twig.app" ]; then
    echo "Removing /Applications/Twig.app"
    rm -rf "/Applications/Twig.app"
  fi
  if [ -d "/Applications/Array.app" ]; then
    echo "Removing /Applications/Array.app"
    rm -rf "/Applications/Array.app"
  fi
fi

echo ""
echo "Done!"

if [ "$DELETE_APP" = false ]; then
  echo ""
  echo "Note: Twig.app was not deleted. Use --app flag to also remove the app."
fi

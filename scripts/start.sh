#!/bin/bash
set -e

echo "DEBUG: ARRAY_WORKSPACE_NAME=$ARRAY_WORKSPACE_NAME"
echo "DEBUG: ARRAY_WORKSPACE_PATH=$ARRAY_WORKSPACE_PATH"

cd "$ARRAY_WORKSPACE_PATH"
ARRAY_APP_IDENTIFIER="com.posthog.array.$ARRAY_WORKSPACE_NAME"
WORKSPACE_DATA_DIR="$HOME/Library/Application Support/$ARRAY_APP_IDENTIFIER"

if [ ! -d "$WORKSPACE_DATA_DIR" ]; then
    echo "Creating data directory: $WORKSPACE_DATA_DIR"
    mkdir -p "$WORKSPACE_DATA_DIR"
fi

# Create workspace-specific Vite cache directory. Maybe we can do without this.
VITE_CACHE_DIR="$WORKSPACE_DATA_DIR/vite-cache"
mkdir -p "$VITE_CACHE_DIR"

# Export all env vars so they're available to child processes
export ARRAY_WORKSPACE_NAME
export ARRAY_WORKSPACE_PATH
export ARRAY_ROOT_PATH
export ARRAY_APP_IDENTIFIER
export ARRAY_WORKSPACE_DATA_DIR="$WORKSPACE_DATA_DIR"
export VITE_DEV_SERVER_PORT="$ARRAY_WORKSPACE_PORTS_START"
export VITE_CACHE_DIR

echo "DEBUG: Exported ARRAY_WORKSPACE_NAME=$ARRAY_WORKSPACE_NAME"

pnpm dev

#!/usr/bin/env bash
# Wrapper script to run arr CLI via bun.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

# Self-install: ./arr.sh install
if [ "$1" = "install" ]; then
  mkdir -p ~/bin
  ln -sf "$SCRIPT_DIR/arr.sh" ~/bin/arr
  echo "Installed: ~/bin/arr -> $SCRIPT_DIR/arr.sh"
  echo "Make sure ~/bin is in your PATH"
  exit 0
fi

exec bun run "$SCRIPT_DIR/bin/arr.ts" "$@"

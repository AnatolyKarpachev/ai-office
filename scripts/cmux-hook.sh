#!/bin/bash
# pixel-agents CMUX auto-launch hook
# Called from Claude Code SessionStart hook

# Change this to wherever you cloned/installed pixel-agents
PIXEL_AGENTS_DIR="$HOME/pixel-agents"
PID_FILE="$HOME/.pixel-agents/.server.pid"
PORT="${PIXEL_AGENTS_PORT:-9876}"

# Check if server is already running via PID file
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    exit 0
  fi
  # Stale PID file — remove it
  rm -f "$PID_FILE"
fi

# Start server in daemon mode
cd "$PIXEL_AGENTS_DIR"
npx office-for-claude-agents start --daemon --no-open --port "$PORT"

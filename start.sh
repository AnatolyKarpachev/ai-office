#!/bin/bash
# Auto-restart wrapper for pixel-agents server
# Keeps the server running on port 9876, restarts on crash

PORT=9876
cd "$(dirname "$0")"

cleanup() {
  echo "[start.sh] Shutting down..."
  kill "$SERVER_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

while true; do
  # Kill any stale process on the port
  lsof -t -i :"$PORT" 2>/dev/null | xargs kill 2>/dev/null
  sleep 1

  echo "[start.sh] Starting pixel-agents server on port $PORT..."
  node dist/server.js &
  SERVER_PID=$!

  # Wait for server process to exit
  wait "$SERVER_PID"
  EXIT_CODE=$?

  echo "[start.sh] Server exited (code $EXIT_CODE). Restarting in 2s..."
  sleep 2
done

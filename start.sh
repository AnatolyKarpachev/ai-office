#!/bin/bash
# DEPRECATED: Server is managed by LaunchAgent (com.pixel-agents.server)
# This script no longer starts a competing instance.

echo "[start.sh] Server is managed by LaunchAgent."
echo "  Status:  launchctl list com.pixel-agents.server"
echo "  Restart: launchctl kickstart -k gui/$(id -u)/com.pixel-agents.server"
echo "  Logs:    ~/.pixel-agents/server.log"
echo "  Errors:  ~/.pixel-agents/server.err"
exit 0

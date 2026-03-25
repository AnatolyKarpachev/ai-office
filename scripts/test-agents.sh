#!/bin/bash
# Spawn fake JSONL sessions to test pixel-agents visualization
# Usage: ./scripts/test-agents.sh [count] [idle_count]

COUNT=${1:-8}
IDLE_COUNT=${2:-4}
PROJECT_DIR="$HOME/.claude/projects/-test-pixel-agents"
mkdir -p "$PROJECT_DIR"

echo "Spawning $COUNT test agents ($IDLE_COUNT idle, $((COUNT - IDLE_COUNT)) active)..."

for i in $(seq 1 $COUNT); do
  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  JSONL_FILE="$PROJECT_DIR/$SESSION_ID.jsonl"

  IS_ACTIVE=$( [ $i -le $((COUNT - IDLE_COUNT)) ] && echo true || echo false )

  # Write initial user message
  cat > "$JSONL_FILE" <<JSONL
{"type":"user","message":{"role":"user","content":"Test agent $i"},"sessionId":"$SESSION_ID","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)","uuid":"$(uuidgen)","cwd":"/test/project","gitBranch":"main","version":"2.1.81","userType":"external","entrypoint":"cli"}
JSONL

  if [ "$IS_ACTIVE" = "true" ]; then
    # Active agent: write assistant with tool_use
    TOOL_ID="toolu_$(openssl rand -hex 8)"
    cat >> "$JSONL_FILE" <<JSONL
{"type":"assistant","message":{"model":"claude-opus-4-6","role":"assistant","content":[{"type":"tool_use","id":"$TOOL_ID","name":"Edit","input":{"file_path":"/test/file$i.ts","old_string":"old","new_string":"new"}}],"usage":{"input_tokens":$((RANDOM % 5000 + 1000)),"output_tokens":$((RANDOM % 500 + 50)),"cache_read_input_tokens":$((RANDOM % 10000)),"cache_creation_input_tokens":$((RANDOM % 2000))}},"sessionId":"$SESSION_ID","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)","uuid":"$(uuidgen)","cwd":"/test/project","gitBranch":"main","version":"2.1.81","userType":"external","entrypoint":"cli"}
JSONL
    echo "  Agent $i: ACTIVE (Edit) - $SESSION_ID"
  else
    # Idle agent: write turn_duration (turn ended = waiting)
    cat >> "$JSONL_FILE" <<JSONL
{"type":"assistant","message":{"model":"claude-opus-4-6","role":"assistant","content":[{"type":"text","text":"Done."}],"usage":{"input_tokens":$((RANDOM % 5000 + 1000)),"output_tokens":$((RANDOM % 500 + 50)),"cache_read_input_tokens":$((RANDOM % 10000)),"cache_creation_input_tokens":$((RANDOM % 2000))}},"sessionId":"$SESSION_ID","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)","uuid":"$(uuidgen)","cwd":"/test/project","gitBranch":"main","version":"2.1.81","userType":"external","entrypoint":"cli"}
{"type":"system","subtype":"turn_duration","durationMs":$((RANDOM % 30000 + 5000)),"sessionId":"$SESSION_ID","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)","uuid":"$(uuidgen)"}
JSONL
    echo "  Agent $i: IDLE - $SESSION_ID"
  fi
done

echo ""
echo "Done! $COUNT test sessions created in $PROJECT_DIR"
echo "To clean up: rm -rf $PROJECT_DIR"

#!/bin/bash
# Test all endpoints of MoltBot/ClawdBot honeypot
#
# Usage: ./scripts/test.sh [host] [port]
# Example: ./scripts/test.sh 80.42.32.100 18789

HOST="${1:-127.0.0.1}"
PORT="${2:-18789}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔════════════════════════════════════════════╗"
echo "║  MoltBot/ClawdBot Endpoint Tester          ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "Target: $HOST:$PORT"
echo ""

# Test HTTP
echo "────────────────────────────────────────────"
bash "$SCRIPT_DIR/test-http.sh" "$HOST" "$PORT"
echo ""

# Test WebSocket
echo "────────────────────────────────────────────"
node "$SCRIPT_DIR/test-ws.js" "$HOST" "$PORT"

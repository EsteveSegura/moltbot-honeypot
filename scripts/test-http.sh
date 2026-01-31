#!/bin/bash
# Test HTTP endpoints of MoltBot/ClawdBot honeypot

HOST="${1:-127.0.0.1}"
GATEWAY_PORT="${2:-18789}"
UI_PORT="${3:-80}"
GATEWAY_BASE="http://$HOST:$GATEWAY_PORT"
UI_BASE="http://$HOST:$UI_PORT"

echo "=== Testing ClawdBot Honeypot ==="
echo "Gateway: $GATEWAY_BASE"
echo "UI: $UI_BASE"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_endpoint() {
    local base=$1
    local method=$2
    local path=$3
    local data=$4
    local desc=$5

    echo -n "[$method] $path - $desc... "

    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$base$path" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$base$path" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}OK${NC} ($http_code)"
        echo "  Response: $(echo "$body" | head -c 200)"
    else
        echo -e "${RED}FAIL${NC} ($http_code)"
        echo "  Response: $body"
    fi
    echo ""
}

# ==========================================
# GATEWAY API (port 18789)
# ==========================================
echo -e "${YELLOW}=== Gateway API ($GATEWAY_BASE) ===${NC}\n"

# Root endpoint (JSON status)
test_endpoint "$GATEWAY_BASE" "GET" "/" "" "Root (JSON status)"

# Health
test_endpoint "$GATEWAY_BASE" "GET" "/health" "" "Health check"

# Models API
test_endpoint "$GATEWAY_BASE" "GET" "/v1/models" "" "Model catalog"

# Chat completions
test_endpoint "$GATEWAY_BASE" "POST" "/v1/chat/completions" \
    '{"model":"clawdbot:main","messages":[{"role":"user","content":"hello"}]}' \
    "Chat completions"

# OpenResponses API
test_endpoint "$GATEWAY_BASE" "POST" "/v1/responses" \
    '{"input":"test request","model":"clawdbot:main"}' \
    "OpenResponses API"

# Tools
test_endpoint "$GATEWAY_BASE" "POST" "/tools/invoke" \
    '{"tool":"bash","args":{"command":"whoami"}}' \
    "Tool invoke (bash)"

# Hooks
echo -e "\n${YELLOW}=== Gateway Hooks ===${NC}\n"

test_endpoint "$GATEWAY_BASE" "GET" "/hooks/status" "" "Hooks status"
test_endpoint "$GATEWAY_BASE" "POST" "/hooks/wake" '{"text":"wake up","mode":"now"}' "Hooks wake"
test_endpoint "$GATEWAY_BASE" "POST" "/hooks/agent" '{"message":"run task","sessionKey":"test-session"}' "Hooks agent"

# ==========================================
# UI SERVER (port 80)
# ==========================================
echo -e "\n${YELLOW}=== UI Server ($UI_BASE) ===${NC}\n"

test_endpoint "$UI_BASE" "GET" "/" "" "Home"
test_endpoint "$UI_BASE" "GET" "/overview" "" "Overview"
test_endpoint "$UI_BASE" "GET" "/chat" "" "Chat"
test_endpoint "$UI_BASE" "GET" "/sessions" "" "Sessions"
test_endpoint "$UI_BASE" "GET" "/agents" "" "Agents"
test_endpoint "$UI_BASE" "GET" "/channels" "" "Channels"
test_endpoint "$UI_BASE" "GET" "/instances" "" "Instances"
test_endpoint "$UI_BASE" "GET" "/skills" "" "Skills"
test_endpoint "$UI_BASE" "GET" "/cron" "" "Cron Jobs"
test_endpoint "$UI_BASE" "GET" "/nodes" "" "Nodes"
test_endpoint "$UI_BASE" "GET" "/config" "" "Config"
test_endpoint "$UI_BASE" "GET" "/settings" "" "Settings"
test_endpoint "$UI_BASE" "GET" "/logs" "" "Logs"
test_endpoint "$UI_BASE" "GET" "/debug" "" "Debug"

# Error handling
echo -e "\n${YELLOW}=== Error Handling ===${NC}\n"

test_endpoint "$GATEWAY_BASE" "GET" "/nonexistent" "" "Gateway 404"
test_endpoint "$UI_BASE" "GET" "/nonexistent" "" "UI 404"

echo "=== HTTP tests completed ==="

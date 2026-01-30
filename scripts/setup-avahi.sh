#!/bin/bash
# Setup avahi-daemon for mDNS exposure (required for Shodan indexing)

set -e

# Config (override with environment variables)
SERVICE_NAME="${HONEYPOT_SERVICE_NAME:-clawdbot}"
PORT="${HONEYPOT_PORT:-18789}"
HOSTNAME="${MDNS_HOSTNAME:-workstation}"

# Service type based on service name
case "$SERVICE_NAME" in
  clawdbot) SERVICE_TYPE="_clawdbot-gw._tcp" ; DISPLAY_SUFFIX="ClawdBot" ;;
  openclaw) SERVICE_TYPE="_openclaw-gw._tcp" ; DISPLAY_SUFFIX="OpenClaw" ;;
  *)        SERVICE_TYPE="_moltbot-gw._tcp"  ; DISPLAY_SUFFIX="MoltBot" ;;
esac

DISPLAY_NAME="$HOSTNAME ($DISPLAY_SUFFIX)"
SERVICE_FILE="/etc/avahi/services/${SERVICE_NAME}-honeypot.service"

echo "=== Avahi mDNS Setup ==="
echo ""
echo "Service: $SERVICE_NAME"
echo "Type: $SERVICE_TYPE"
echo "Port: $PORT"
echo "Display name: $DISPLAY_NAME"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Error: Run as root (sudo)"
  exit 1
fi

# Install avahi if not present
if ! command -v avahi-daemon &> /dev/null; then
  echo "Installing avahi-daemon..."
  apt update && apt install -y avahi-daemon avahi-utils
fi

# Create service file
echo "Creating $SERVICE_FILE..."
cat > "$SERVICE_FILE" << EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>$DISPLAY_NAME</name>
  <service>
    <type>$SERVICE_TYPE</type>
    <port>$PORT</port>
    <txt-record>role=gateway</txt-record>
    <txt-record>gatewayPort=$PORT</txt-record>
    <txt-record>lanHost=$HOSTNAME.local</txt-record>
    <txt-record>displayName=$DISPLAY_NAME</txt-record>
    <txt-record>cliPath=/home/user/.npm-global/lib/node_modules/$SERVICE_NAME/dist/entry.js</txt-record>
    <txt-record>sshPort=22</txt-record>
    <txt-record>transport=gateway</txt-record>
    <txt-record>Name=$DISPLAY_NAME</txt-record>
  </service>
</service-group>
EOF

# Restart avahi
echo "Restarting avahi-daemon..."
systemctl restart avahi-daemon

# Open firewall port
echo "Opening port 5353/udp..."
if command -v ufw &> /dev/null; then
  ufw allow 5353/udp
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=5353/udp
  firewall-cmd --reload
fi

echo ""
echo "=== Done ==="
echo ""
echo "Verify with: avahi-browse -r $SERVICE_TYPE"
echo ""
echo "Your banner for Shodan:"
echo "  mDNS:"
echo "    services:"
echo "      $PORT/tcp ${SERVICE_TYPE#_}:"
echo "        $HOSTNAME"
echo "        role=gateway"
echo "        gatewayPort=$PORT"
echo "        lanHost=$HOSTNAME.local"
echo "        displayName=$DISPLAY_NAME"
echo "        sshPort=22"
echo "        transport=gateway"
echo "        Name=$DISPLAY_NAME"

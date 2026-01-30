# MoltBot/ClawdBot Honeypot

Honeypot to detect scans and attacks targeting exposed MoltBot/ClawdBot instances on the internet.

Replicates the HTTP gateway, WebSocket, and mDNS services to appear on Shodan as a real instance.

## Requirements

- Node.js 18+

## Installation

```bash
npm install
```

### mDNS Setup (required for Shodan indexing)

For Shodan to detect your honeypot via mDNS, you need avahi-daemon:

```bash
sudo ./scripts/setup-avahi.sh
```

This installs avahi-daemon, creates the service file, and opens port 5353/UDP.

To use a different service name:

```bash
sudo HONEYPOT_SERVICE_NAME=clawdbot ./scripts/setup-avahi.sh
```

## Usage

```bash
# Start honeypot + admin dashboard
npm start

# Honeypot only (no admin)
npm run honeypot

# Admin only
npm run admin

# Development mode (auto-reload)
npm run dev
```

By default it exposes MoltBot. To switch to ClawdBot:

```bash
HONEYPOT_SERVICE_NAME=clawdbot npm start
```

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Honeypot | 18789 | HTTP + WebSocket (same port as real MoltBot) |
| Admin | 41892 | Dashboard with Basic Auth |

## Admin Dashboard

- URL: `http://127.0.0.1:41892`
- Username: `admin`
- Password: `admin-secret-2024`

Shows real-time: HTTP requests, WebSocket connections, unique IPs, attack categories.

For remote access:

```bash
# To expose admin on the internet
ADMIN_HOST=0.0.0.0 npm start
```

Make sure to open port 41892 in your firewall.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HONEYPOT_SERVICE_NAME` | `clawdbot` | Service to mimic: `moltbot`, `clawdbot`, `openclaw` |
| `HONEYPOT_HOST` | `0.0.0.0` | Honeypot host |
| `HONEYPOT_PORT` | `18789` | Honeypot port |
| `ADMIN_HOST` | `127.0.0.1` | Admin host |
| `ADMIN_PORT` | `41892` | Admin port |
| `ADMIN_USERNAME` | `admin` | Basic Auth username |
| `ADMIN_PASSWORD` | `admin-secret-2024` | Basic Auth password |
| `MDNS_ENABLED` | `false` | Enable Node.js mDNS (disable if using avahi) |
| `MDNS_HOSTNAME` | `workstation` | mDNS hostname |
| `DATA_DIR` | `./data` | Directory for attack logs |

## Testing Endpoints

Test against any MoltBot/ClawdBot instance:

```bash
# Test all endpoints (HTTP + WebSocket)
./scripts/test.sh 80.42.32.100

# With custom port
./scripts/test.sh 80.42.32.100 18789

# HTTP only
./scripts/test-http.sh 80.42.32.100

# WebSocket only
node scripts/test-ws.js 80.42.32.100
```

## Honeypot Endpoints

- `GET /` - Gateway UI
- `GET /v1/models` - Model catalog
- `POST /v1/chat/completions` - OpenAI-compatible API
- `POST /v1/responses` - OpenResponses API
- `POST /tools/invoke` - Tool execution
- `GET /health` - Health check
- `WS /` - WebSocket gateway

## Captured Data

Attacks are saved in `./data/`:

- `stats.json` - Aggregated statistics
- `attacks-YYYY-MM-DD.jsonl` - Daily attack log

## Project Structure

```text
src/
├── config/index.js          # Configuration
├── storage/attack-store.js  # Attack storage
├── honeypot/
│   ├── http-server.js       # HTTP endpoints
│   ├── websocket-server.js  # WebSocket protocol
│   ├── mdns-advertiser.js   # mDNS/Bonjour
│   └── index.js
├── admin/
│   ├── server.js            # Dashboard API
│   └── public/index.html    # UI
└── index.js
```

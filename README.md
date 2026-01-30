# MoltBot/ClawdBot Honeypot

Honeypot to detect scans and attacks targeting exposed MoltBot/ClawdBot instances on the internet.

Replicates the HTTP gateway, WebSocket, and mDNS services to appear on Shodan as a real instance.

## Requirements

- Node.js 18+

## Installation

```bash
npm install
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HONEYPOT_SERVICE_NAME` | `moltbot` | Service to mimic: `moltbot`, `clawdbot`, `openclaw` |
| `HONEYPOT_HOST` | `0.0.0.0` | Honeypot host |
| `HONEYPOT_PORT` | `18789` | Honeypot port |
| `ADMIN_HOST` | `127.0.0.1` | Admin host |
| `ADMIN_PORT` | `41892` | Admin port |
| `ADMIN_USERNAME` | `admin` | Basic Auth username |
| `ADMIN_PASSWORD` | `honeypot-secret-2024` | Basic Auth password |
| `MDNS_ENABLED` | `true` | Enable mDNS/Bonjour |
| `MDNS_HOSTNAME` | `honeypot-server` | mDNS hostname |
| `DATA_DIR` | `./data` | Directory for attack logs |

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

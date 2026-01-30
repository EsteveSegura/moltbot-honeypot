/**
 * MoltBot/ClawdBot Honeypot
 *
 * Main entry point. Starts both the honeypot server and admin UI.
 *
 * Usage:
 *   npm start              - Start both honeypot and admin
 *   npm run honeypot       - Start honeypot only
 *   npm run admin          - Start admin only
 *
 * Environment variables:
 *   HONEYPOT_SERVICE_NAME  - Service to mimic: "moltbot", "clawdbot", or "openclaw"
 *   HONEYPOT_PORT          - Honeypot port (default: 18789)
 *   ADMIN_PORT             - Admin UI port (default: 3000)
 *   MDNS_ENABLED           - Enable mDNS advertising (default: true)
 */

import config from './config/index.js';
import { startHoneypot, stopHoneypot } from './honeypot/index.js';
import { startAdminServer, stopAdminServer } from './admin/server.js';

const args = process.argv.slice(2);
const honeypotOnly = args.includes('--honeypot-only');
const adminOnly = args.includes('--admin-only');

async function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║        🍯 MoltBot/ClawdBot Honeypot                        ║');
  console.log('║        Security Research Tool                              ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Service Mode: ${config.displayName}`);
  console.log(`Change with: HONEYPOT_SERVICE_NAME=clawdbot npm start`);
  console.log('');

  try {
    if (!adminOnly) {
      await startHoneypot();
    }

    if (!honeypotOnly) {
      await startAdminServer();
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Honeypot is running. Press Ctrl+C to stop.               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('');
  console.log('Shutting down...');

  try {
    await stopHoneypot();
    await stopAdminServer();
  } catch (err) {
    console.error('Error during shutdown:', err);
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();

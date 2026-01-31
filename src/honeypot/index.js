/**
 * Honeypot Server Entry Point
 *
 * Combines HTTP, WebSocket, and mDNS into a single honeypot server.
 */

import { createServer } from 'http';
import config from '../config/index.js';
import { createHttpApp } from './http-server.js';
import { createWebSocketServer } from './websocket-server.js';
import { startMdnsServer, stopMdnsServer } from './mdns-server.js';
import { startUiServer, stopUiServer } from './ui-server.js';

let httpServer = null;
let wss = null;

export async function startHoneypot() {
  // Create Express app
  const app = createHttpApp();

  // Create HTTP server from Express app
  httpServer = createServer(app);

  // Attach WebSocket server to HTTP server (same port, multiplexed)
  wss = createWebSocketServer(httpServer);

  // Start mDNS UDP server
  await startMdnsServer();

  // Start UI server (separate port)
  await startUiServer();

  // Start listening
  return new Promise((resolve, reject) => {
    httpServer.listen(config.honeypot.port, config.honeypot.host, () => {
      console.log('');
      console.log(`=== ${config.displayName} Honeypot Started ===`);
      console.log(`Gateway API: http://${config.honeypot.host}:${config.honeypot.port}`);
      if (config.ui.enabled) {
        console.log(`UI Server:   http://${config.ui.host}:${config.ui.port}`);
      }
      console.log(`Service: ${config.serviceName}`);
      console.log(`mDNS: _${config.mdnsServiceType}._tcp.local`);
      console.log('');
      console.log('Monitoring traffic...');
      console.log('');
      resolve({ httpServer, wss });
    });

    httpServer.on('error', reject);
  });
}

export async function stopHoneypot() {
  console.log('Stopping honeypot...');

  await stopMdnsServer();
  await stopUiServer();

  if (wss) {
    wss.close();
  }

  if (httpServer) {
    httpServer.close();
  }

  console.log('Honeypot stopped');
}

export default { startHoneypot, stopHoneypot };

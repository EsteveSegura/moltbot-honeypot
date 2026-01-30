/**
 * Admin UI Server
 *
 * Provides a web interface to monitor honeypot attacks.
 * Runs on a separate port for security.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config/index.js';
import attackStore from '../storage/attack-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Basic Auth middleware
 */
function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }

  const base64Credentials = authHeader.slice(6);
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (username === config.admin.username && password === config.admin.password) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

export function createAdminServer() {
  const app = express();

  // Basic Auth protection for all routes
  app.use(basicAuth);

  // Serve static files
  app.use(express.static(join(__dirname, 'public')));

  // API: Get stats
  app.get('/api/stats', (req, res) => {
    res.json(attackStore.getStats());
  });

  // API: Get recent attacks
  app.get('/api/attacks', (req, res) => {
    const limit = parseInt(req.query.limit || '100', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const type = req.query.type;

    let attacks;
    if (type) {
      attacks = attackStore.getAttacksByType(type, limit);
    } else {
      attacks = attackStore.getRecentAttacks(limit, offset);
    }

    res.json({
      attacks,
      total: attackStore.attacks.length,
      limit,
      offset,
    });
  });

  // API: Get unique IPs
  app.get('/api/ips', (req, res) => {
    res.json({
      ips: attackStore.getUniqueIps(),
      count: attackStore.stats.uniqueIps.size,
    });
  });

  // API: Get config (non-sensitive)
  app.get('/api/config', (req, res) => {
    res.json({
      serviceName: config.serviceName,
      displayName: config.displayName,
      honeypotPort: config.honeypot.port,
      adminPort: config.admin.port,
      version: config.version,
    });
  });

  // SSE: Real-time attack stream
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial stats
    res.write(`data: ${JSON.stringify({ type: 'stats', data: attackStore.getStats() })}\n\n`);

    // Poll for new attacks every second
    let lastCount = attackStore.attacks.length;
    const interval = setInterval(() => {
      const currentCount = attackStore.attacks.length;
      if (currentCount > lastCount) {
        const newAttacks = attackStore.attacks.slice(lastCount);
        for (const attack of newAttacks) {
          res.write(`data: ${JSON.stringify({ type: 'attack', data: attack })}\n\n`);
        }
        lastCount = currentCount;
      }

      // Send stats update every 5 seconds
      if (Date.now() % 5000 < 1000) {
        res.write(`data: ${JSON.stringify({ type: 'stats', data: attackStore.getStats() })}\n\n`);
      }
    }, 1000);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  return app;
}

let adminServer = null;

export async function startAdminServer() {
  const app = createAdminServer();

  return new Promise((resolve, reject) => {
    adminServer = app.listen(config.admin.port, config.admin.host, () => {
      console.log('');
      console.log('=== Admin UI Started ===');
      console.log(`Dashboard: http://${config.admin.username}:${config.admin.password}@${config.admin.host}:${config.admin.port}`);
      console.log(`Auth: ${config.admin.username} / ${config.admin.password}`);
      console.log('');
      resolve(adminServer);
    });

    adminServer.on('error', reject);
  });
}

export async function stopAdminServer() {
  if (adminServer) {
    adminServer.close();
    console.log('Admin server stopped');
  }
}

export default { createAdminServer, startAdminServer, stopAdminServer };

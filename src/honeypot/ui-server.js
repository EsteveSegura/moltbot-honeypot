/**
 * UI Server for Honeypot
 *
 * Serves the fake ClawdBot UI on a separate port (default: 80)
 * This mimics the real ClawdBot web interface.
 */

import express from 'express';
import { randomUUID } from 'crypto';
import config from '../config/index.js';
import attackStore from '../storage/attack-store.js';

let uiServer = null;

export function createUiApp() {
  const app = express();

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Global middleware - capture all traffic and set headers
  app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    // Record the attack
    attackStore.recordHttpRequest({
      ip,
      method: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body,
      userAgent: req.headers['user-agent'],
      source: 'ui',
    });

    // Log to console
    console.log(`[UI] ${req.method} ${req.path} from ${ip}`);

    // Set headers to mimic real ClawdBot UI
    res.setHeader('server', `${config.serviceName}-ui/${config.version}`);
    res.setHeader('x-powered-by', config.serviceName);
    res.setHeader('x-request-id', randomUUID());
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'SAMEORIGIN');

    next();
  });

  // Helper function for frontend pages
  const renderPage = (title, content, activeNav = '') => `
<!DOCTYPE html>
<html>
  <head>
    <title>${title} - ${config.uiTitle}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🤖</text></svg>">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; }
      .layout { display: flex; min-height: 100vh; }
      .sidebar { width: 220px; background: #1a1a2e; padding: 20px 0; border-right: 1px solid #2a2a4a; position: fixed; height: 100vh; overflow-y: auto; }
      .sidebar-header { padding: 0 20px 20px; border-bottom: 1px solid #2a2a4a; margin-bottom: 10px; }
      .sidebar-header h2 { color: #e94560; font-size: 18px; }
      .sidebar-header span { color: #888; font-size: 12px; }
      .nav-section { padding: 10px 0; }
      .nav-section-title { color: #666; font-size: 11px; text-transform: uppercase; padding: 8px 20px; letter-spacing: 1px; }
      .nav-item { display: block; padding: 10px 20px; color: #aaa; text-decoration: none; font-size: 14px; transition: all 0.2s; }
      .nav-item:hover { background: #252542; color: #fff; }
      .nav-item.active { background: #e94560; color: #fff; }
      .main { flex: 1; display: flex; flex-direction: column; margin-left: 220px; }
      .header { background: #1a1a2e; padding: 20px 30px; border-bottom: 1px solid #2a2a4a; display: flex; justify-content: space-between; align-items: center; }
      .header h1 { font-size: 22px; font-weight: 500; }
      .header-actions { display: flex; gap: 10px; }
      .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; transition: all 0.2s; }
      .btn:hover { opacity: 0.9; }
      .btn-primary { background: #e94560; color: #fff; }
      .btn-secondary { background: #2a2a4a; color: #fff; }
      .content { flex: 1; padding: 30px; }
      .card { background: #1a1a2e; border-radius: 8px; padding: 20px; margin-bottom: 20px; border: 1px solid #2a2a4a; }
      .card-title { font-size: 14px; color: #888; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
      .stat-card { background: #1a1a2e; border-radius: 8px; padding: 20px; border: 1px solid #2a2a4a; }
      .stat-value { font-size: 32px; font-weight: 600; color: #fff; }
      .stat-label { color: #888; font-size: 13px; margin-top: 5px; }
      .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; }
      .badge-success { background: #1db954; color: #fff; }
      .badge-warning { background: #f59e0b; color: #000; }
      .badge-info { background: #3b82f6; color: #fff; }
      .badge-error { background: #ef4444; color: #fff; }
      .table { width: 100%; border-collapse: collapse; }
      .table th, .table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #2a2a4a; }
      .table th { color: #888; font-weight: 500; font-size: 12px; text-transform: uppercase; }
      .table tr:hover { background: #252542; }
      .empty-state { text-align: center; padding: 60px 20px; color: #666; }
      .empty-state-icon { font-size: 48px; margin-bottom: 15px; }
      .input { background: #0f0f1a; border: 1px solid #2a2a4a; padding: 10px 15px; border-radius: 6px; color: #fff; width: 100%; }
      .input:focus { outline: none; border-color: #e94560; }
      .chat-container { display: flex; flex-direction: column; height: calc(100vh - 140px); }
      .chat-messages { flex: 1; overflow-y: auto; padding: 20px; }
      .chat-input-area { padding: 20px; background: #1a1a2e; border-top: 1px solid #2a2a4a; display: flex; gap: 10px; }
      .chat-input-area input { flex: 1; }
      .message { margin-bottom: 15px; padding: 12px 16px; border-radius: 8px; max-width: 80%; }
      .message-user { background: #e94560; margin-left: auto; }
      .message-assistant { background: #2a2a4a; }
      .log-entry { font-family: 'SF Mono', Monaco, monospace; font-size: 13px; padding: 8px 12px; border-bottom: 1px solid #2a2a4a; }
      .log-time { color: #666; }
      .log-level-info { color: #3b82f6; }
      .log-level-warn { color: #f59e0b; }
      .log-level-error { color: #ef4444; }
      select.input { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23888' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 35px; }
    </style>
  </head>
  <body>
    <div class="layout">
      <nav class="sidebar">
        <div class="sidebar-header">
          <h2>${config.displayName}</h2>
          <span>v${config.version}</span>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Main</div>
          <a href="/" class="nav-item ${activeNav === 'home' ? 'active' : ''}">Home</a>
          <a href="/overview" class="nav-item ${activeNav === 'overview' ? 'active' : ''}">Overview</a>
          <a href="/chat" class="nav-item ${activeNav === 'chat' ? 'active' : ''}">Chat</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Workspace</div>
          <a href="/sessions" class="nav-item ${activeNav === 'sessions' ? 'active' : ''}">Sessions</a>
          <a href="/agents" class="nav-item ${activeNav === 'agents' ? 'active' : ''}">Agents</a>
          <a href="/channels" class="nav-item ${activeNav === 'channels' ? 'active' : ''}">Channels</a>
          <a href="/instances" class="nav-item ${activeNav === 'instances' ? 'active' : ''}">Instances</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Automation</div>
          <a href="/skills" class="nav-item ${activeNav === 'skills' ? 'active' : ''}">Skills</a>
          <a href="/cron" class="nav-item ${activeNav === 'cron' ? 'active' : ''}">Cron Jobs</a>
          <a href="/nodes" class="nav-item ${activeNav === 'nodes' ? 'active' : ''}">Nodes</a>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">System</div>
          <a href="/config" class="nav-item ${activeNav === 'config' ? 'active' : ''}">Config</a>
          <a href="/settings" class="nav-item ${activeNav === 'settings' ? 'active' : ''}">Settings</a>
          <a href="/logs" class="nav-item ${activeNav === 'logs' ? 'active' : ''}">Logs</a>
          <a href="/debug" class="nav-item ${activeNav === 'debug' ? 'active' : ''}">Debug</a>
        </div>
      </nav>
      <main class="main">
        ${content}
      </main>
    </div>
  </body>
</html>
  `;

  // Frontend: Home
  app.get('/', (req, res) => {
    res.send(renderPage('Home', `
      <div class="header">
        <h1>${config.displayName} Gateway</h1>
        <div class="header-actions">
          <button class="btn btn-secondary">Refresh</button>
          <button class="btn btn-primary">New Session</button>
        </div>
      </div>
      <div class="content">
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Active Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Connected Nodes</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${Math.floor(process.uptime())}s</div>
            <div class="stat-label">Uptime</div>
          </div>
          <div class="stat-card">
            <div class="stat-value"><span class="badge badge-success">Online</span></div>
            <div class="stat-label">Status</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Quick Actions</div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-primary">Start Agent</button>
            <button class="btn btn-secondary">View Logs</button>
            <button class="btn btn-secondary">Settings</button>
          </div>
        </div>
      </div>
    `, 'home'));
  });

  // Frontend: Overview
  app.get('/overview', (req, res) => {
    res.send(renderPage('Overview', `
      <div class="header">
        <h1>Overview</h1>
      </div>
      <div class="content">
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Total Requests</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Active Agents</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Messages Today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Errors</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">System Health</div>
          <table class="table">
            <tr><td>API Server</td><td><span class="badge badge-success">Healthy</span></td></tr>
            <tr><td>WebSocket Server</td><td><span class="badge badge-success">Healthy</span></td></tr>
            <tr><td>Database</td><td><span class="badge badge-success">Connected</span></td></tr>
            <tr><td>Memory Usage</td><td>${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</td></tr>
          </table>
        </div>
      </div>
    `, 'overview'));
  });

  // Frontend: Chat
  app.get('/chat', (req, res) => {
    res.send(renderPage('Chat', `
      <div class="header">
        <h1>Chat</h1>
        <div class="header-actions">
          <button class="btn btn-secondary">Clear</button>
          <button class="btn btn-primary">New Chat</button>
        </div>
      </div>
      <div class="chat-container">
        <div class="chat-messages">
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <p>Start a conversation with ${config.displayName}</p>
          </div>
        </div>
        <div class="chat-input-area">
          <input type="text" class="input" placeholder="Type a message..." />
          <button class="btn btn-primary">Send</button>
        </div>
      </div>
    `, 'chat'));
  });

  // Frontend: Sessions
  app.get('/sessions', (req, res) => {
    res.send(renderPage('Sessions', `
      <div class="header">
        <h1>Sessions</h1>
        <div class="header-actions">
          <button class="btn btn-primary">New Session</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Created</th>
                <th>Messages</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" class="empty-state">No sessions found</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'sessions'));
  });

  // Frontend: Agents
  app.get('/agents', (req, res) => {
    res.send(renderPage('Agents', `
      <div class="header">
        <h1>Agents</h1>
        <div class="header-actions">
          <button class="btn btn-primary">Deploy Agent</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Agent ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" class="empty-state">No agents deployed</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'agents'));
  });

  // Frontend: Channels
  app.get('/channels', (req, res) => {
    res.send(renderPage('Channels', `
      <div class="header">
        <h1>Channels</h1>
        <div class="header-actions">
          <button class="btn btn-primary">Add Channel</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Type</th>
                <th>Status</th>
                <th>Messages</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" class="empty-state">No channels configured</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'channels'));
  });

  // Frontend: Instances
  app.get('/instances', (req, res) => {
    res.send(renderPage('Instances', `
      <div class="header">
        <h1>Instances</h1>
        <div class="header-actions">
          <button class="btn btn-primary">New Instance</button>
        </div>
      </div>
      <div class="content">
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value">1</div>
            <div class="stat-label">Running</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">0</div>
            <div class="stat-label">Stopped</div>
          </div>
        </div>
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Instance</th>
                <th>Host</th>
                <th>Port</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${config.mdns.hostname}</td>
                <td>${config.honeypot.host}</td>
                <td>${config.honeypot.port}</td>
                <td><span class="badge badge-success">Running</span></td>
                <td><button class="btn btn-secondary">Manage</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'instances'));
  });

  // Frontend: Skills
  app.get('/skills', (req, res) => {
    res.send(renderPage('Skills', `
      <div class="header">
        <h1>Skills</h1>
        <div class="header-actions">
          <button class="btn btn-primary">Install Skill</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Version</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>bash</td>
                <td>1.0.0</td>
                <td><span class="badge badge-success">Enabled</span></td>
                <td><button class="btn btn-secondary">Configure</button></td>
              </tr>
              <tr>
                <td>read_file</td>
                <td>1.0.0</td>
                <td><span class="badge badge-success">Enabled</span></td>
                <td><button class="btn btn-secondary">Configure</button></td>
              </tr>
              <tr>
                <td>write_file</td>
                <td>1.0.0</td>
                <td><span class="badge badge-success">Enabled</span></td>
                <td><button class="btn btn-secondary">Configure</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'skills'));
  });

  // Frontend: Cron Jobs
  app.get('/cron', (req, res) => {
    res.send(renderPage('Cron Jobs', `
      <div class="header">
        <h1>Cron Jobs</h1>
        <div class="header-actions">
          <button class="btn btn-primary">New Job</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Schedule</th>
                <th>Last Run</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" class="empty-state">No cron jobs configured</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'cron'));
  });

  // Frontend: Nodes
  app.get('/nodes', (req, res) => {
    res.send(renderPage('Nodes', `
      <div class="header">
        <h1>Nodes</h1>
        <div class="header-actions">
          <button class="btn btn-primary">Add Node</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Node ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Connected</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" class="empty-state">No nodes connected</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `, 'nodes'));
  });

  // Frontend: Config
  app.get('/config', (req, res) => {
    res.send(renderPage('Config', `
      <div class="header">
        <h1>Configuration</h1>
        <div class="header-actions">
          <button class="btn btn-primary">Save Changes</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <div class="card-title">General</div>
          <div style="display: grid; gap: 15px;">
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Service Name</label>
              <input type="text" class="input" value="${config.serviceName}" readonly />
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Display Name</label>
              <input type="text" class="input" value="${config.displayName}" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Version</label>
              <input type="text" class="input" value="${config.version}" readonly />
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Network</div>
          <div style="display: grid; gap: 15px;">
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Host</label>
              <input type="text" class="input" value="${config.honeypot.host}" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Port</label>
              <input type="text" class="input" value="${config.honeypot.port}" />
            </div>
          </div>
        </div>
      </div>
    `, 'config'));
  });

  // Frontend: Settings
  app.get('/settings', (req, res) => {
    res.send(renderPage('Settings', `
      <div class="header">
        <h1>Settings</h1>
        <div class="header-actions">
          <button class="btn btn-primary">Save</button>
        </div>
      </div>
      <div class="content">
        <div class="card">
          <div class="card-title">API Settings</div>
          <div style="display: grid; gap: 15px;">
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">API Token</label>
              <input type="password" class="input" value="••••••••••••" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Rate Limit (req/min)</label>
              <input type="number" class="input" value="60" />
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Agent Settings</div>
          <div style="display: grid; gap: 15px;">
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Default Model</label>
              <select class="input">
                <option>claude-3-5-sonnet</option>
                <option>claude-3-opus</option>
                <option>gpt-4o</option>
              </select>
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #888;">Max Tokens</label>
              <input type="number" class="input" value="4096" />
            </div>
          </div>
        </div>
      </div>
    `, 'settings'));
  });

  // Frontend: Logs
  app.get('/logs', (req, res) => {
    const now = new Date();
    res.send(renderPage('Logs', `
      <div class="header">
        <h1>Logs</h1>
        <div class="header-actions">
          <button class="btn btn-secondary">Clear</button>
          <button class="btn btn-secondary">Export</button>
          <button class="btn btn-primary">Refresh</button>
        </div>
      </div>
      <div class="content">
        <div class="card" style="font-family: 'SF Mono', Monaco, monospace; max-height: 600px; overflow-y: auto;">
          <div class="log-entry"><span class="log-time">${now.toISOString()}</span> <span class="log-level-info">[INFO]</span> Server started on port ${config.honeypot.port}</div>
          <div class="log-entry"><span class="log-time">${now.toISOString()}</span> <span class="log-level-info">[INFO]</span> WebSocket server initialized</div>
          <div class="log-entry"><span class="log-time">${now.toISOString()}</span> <span class="log-level-info">[INFO]</span> mDNS service registered as ${config.mdns.hostname}</div>
          <div class="log-entry"><span class="log-time">${now.toISOString()}</span> <span class="log-level-info">[INFO]</span> Ready to accept connections</div>
        </div>
      </div>
    `, 'logs'));
  });

  // Frontend: Debug
  app.get('/debug', (req, res) => {
    res.send(renderPage('Debug', `
      <div class="header">
        <h1>Debug</h1>
      </div>
      <div class="content">
        <div class="card">
          <div class="card-title">System Information</div>
          <table class="table">
            <tr><td>Node.js Version</td><td>${process.version}</td></tr>
            <tr><td>Platform</td><td>${process.platform}</td></tr>
            <tr><td>Architecture</td><td>${process.arch}</td></tr>
            <tr><td>PID</td><td>${process.pid}</td></tr>
            <tr><td>Uptime</td><td>${Math.floor(process.uptime())} seconds</td></tr>
            <tr><td>Memory (Heap Used)</td><td>${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB</td></tr>
            <tr><td>Memory (Heap Total)</td><td>${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB</td></tr>
          </table>
        </div>
        <div class="card">
          <div class="card-title">Configuration</div>
          <pre style="background: #0f0f1a; padding: 15px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify({
            serviceName: config.serviceName,
            displayName: config.displayName,
            version: config.version,
            protocol: config.protocol,
            gatewayPort: config.honeypot.port,
            uiPort: config.ui.port,
            mdns: config.mdns
          }, null, 2)}</pre>
        </div>
        <div class="card">
          <div class="card-title">WebSocket Test</div>
          <p style="color: #888; margin-bottom: 10px;">Gateway: ws://${config.honeypot.host}:${config.honeypot.port}</p>
          <button class="btn btn-primary">Test Connection</button>
        </div>
      </div>
    `, 'debug'));
  });

  // Catch-all for unknown routes
  app.all('*', (req, res) => {
    res.status(404).send(renderPage('Not Found', `
      <div class="header">
        <h1>404 - Not Found</h1>
      </div>
      <div class="content">
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>The page you're looking for doesn't exist.</p>
          <a href="/" class="btn btn-primary" style="display: inline-block; margin-top: 20px; text-decoration: none;">Go Home</a>
        </div>
      </div>
    `, ''));
  });

  return app;
}

export async function startUiServer() {
  if (!config.ui.enabled) {
    console.log('[UI] Server disabled');
    return;
  }

  const app = createUiApp();

  return new Promise((resolve, reject) => {
    uiServer = app.listen(config.ui.port, config.ui.host, () => {
      console.log('[UI] Server started');
      console.log(`UI: http://${config.ui.host}:${config.ui.port}`);
      resolve(uiServer);
    });
    uiServer.on('error', reject);
  });
}

export async function stopUiServer() {
  if (uiServer) {
    return new Promise((resolve) => {
      uiServer.close(resolve);
      uiServer = null;
    });
  }
}

export default { createUiApp, startUiServer, stopUiServer };

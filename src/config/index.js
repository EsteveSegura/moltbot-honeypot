/**
 * Honeypot Configuration
 *
 * Centralized configuration for the MoltBot/ClawdBot honeypot.
 * Modify SERVICE_NAME to switch between "moltbot" and "clawdbot" exposure.
 */

// Service name configuration - change this to control what name is exposed
// Options: "moltbot", "clawdbot", "openclaw"
const SERVICE_NAME = process.env.HONEYPOT_SERVICE_NAME || 'moltbot';

// Service name mappings for different exposure types
const SERVICE_CONFIGS = {
  moltbot: {
    displayName: 'MoltBot',
    serviceName: 'moltbot',
    mdnsServiceType: 'moltbot-gw',
    serverHeader: 'MoltBot-Gateway',
    uiTitle: 'MoltBot Control UI',
    instanceSuffix: '(MoltBot)',
  },
  clawdbot: {
    displayName: 'ClawdBot',
    serviceName: 'clawdbot',
    mdnsServiceType: 'clawdbot-gw',
    serverHeader: 'ClawdBot-Gateway',
    uiTitle: 'ClawdBot Control UI',
    instanceSuffix: '(ClawdBot)',
  },
  openclaw: {
    displayName: 'OpenClaw',
    serviceName: 'openclaw',
    mdnsServiceType: 'openclaw-gw',
    serverHeader: 'OpenClaw-Gateway',
    uiTitle: 'OpenClaw Control UI',
    instanceSuffix: '(OpenClaw)',
  },
};

const serviceConfig = SERVICE_CONFIGS[SERVICE_NAME] || SERVICE_CONFIGS.moltbot;

export const config = {
  // Service identity
  serviceName: SERVICE_NAME,
  ...serviceConfig,

  // Honeypot server settings
  honeypot: {
    host: process.env.HONEYPOT_HOST || '0.0.0.0',
    port: parseInt(process.env.HONEYPOT_PORT || '18789', 10),
    token: process.env.HONEYPOT_TOKEN || 'gw-token-7f3a9b2e',
  },

  // Admin UI settings
  admin: {
    host: process.env.ADMIN_HOST || '127.0.0.1',
    port: parseInt(process.env.ADMIN_PORT || '41892', 10),
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin-secret-2024',
  },

  // mDNS/Bonjour settings
  mdns: {
    enabled: process.env.MDNS_ENABLED !== 'false',
    hostname: process.env.MDNS_HOSTNAME || 'workstation',
    instanceName: process.env.MDNS_INSTANCE_NAME || null,
  },

  // Storage settings
  storage: {
    dataDir: process.env.DATA_DIR || './data',
    maxAttacksInMemory: parseInt(process.env.MAX_ATTACKS_MEMORY || '10000', 10),
  },

  // Version info (mimicking real service)
  version: '2026.1.24',
  protocol: 3,
};

export default config;

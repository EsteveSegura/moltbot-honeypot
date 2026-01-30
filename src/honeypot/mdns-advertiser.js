/**
 * mDNS/Bonjour Advertiser
 *
 * Publishes the honeypot as a discoverable service via mDNS.
 * This makes it appear in Shodan scans and local network discovery.
 */

import config from '../config/index.js';

let bonjour = null;
let service = null;

export async function startMdnsAdvertiser() {
  if (!config.mdns.enabled) {
    console.log('[mDNS] Disabled by configuration');
    return null;
  }

  try {
    const bonjourModule = await import('bonjour-service');
    const Bonjour = bonjourModule.Bonjour || bonjourModule.default;
    bonjour = new Bonjour();

    const hostname = config.mdns.hostname;
    const instanceName = config.mdns.instanceName || `${hostname} ${config.instanceSuffix}`;

    service = bonjour.publish({
      name: instanceName,
      type: config.mdnsServiceType,
      port: config.honeypot.port,
      txt: {
        role: 'gateway',
        gatewayPort: String(config.honeypot.port),
        lanHost: `${hostname}.local`,
        displayName: instanceName,
        transport: 'gateway',
        // These fields are exposed by real installations and help with fingerprinting
        // In minimal mode, real MoltBot omits cliPath and sshPort
        // We include them to appear more like a full installation
        sshPort: '22',
        cliPath: `/home/user/.npm-global/lib/node_modules/${config.serviceName}/dist/entry.js`,
      },
    });

    console.log(`[mDNS] Service published: _${config.mdnsServiceType}._tcp.local`);
    console.log(`[mDNS] Instance name: ${instanceName}`);

    return service;
  } catch (err) {
    console.error('[mDNS] Failed to start advertiser:', err.message);
    console.log('[mDNS] Continuing without mDNS (install bonjour-service if needed)');
    return null;
  }
}

export async function stopMdnsAdvertiser() {
  if (service) {
    try {
      service.stop();
      console.log('[mDNS] Service stopped');
    } catch (err) {
      console.error('[mDNS] Error stopping service:', err.message);
    }
  }
  if (bonjour) {
    try {
      bonjour.destroy();
    } catch (err) {
      // Ignore
    }
  }
}

export default { startMdnsAdvertiser, stopMdnsAdvertiser };

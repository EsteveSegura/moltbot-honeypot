/**
 * Simple mDNS/DNS-SD Server
 *
 * Responds to DNS queries on port 5353 with service information.
 * This is a simplified implementation for honeypot purposes.
 */

import dgram from 'dgram';
import config from '../config/index.js';

let server = null;

// DNS record types
const DNS_TYPE = {
  A: 1,
  PTR: 12,
  TXT: 16,
  SRV: 33,
  ANY: 255,
};

// Build TXT record data
function buildTxtRecords() {
  const hostname = config.mdns.hostname;
  const displayName = config.mdns.instanceName || `${hostname} (${config.displayName})`;

  const records = [
    `role=gateway`,
    `gatewayPort=${config.honeypot.port}`,
    `lanHost=${hostname}.local`,
    `displayName=${displayName}`,
    `cliPath=/home/user/.npm-global/lib/node_modules/${config.serviceName}/dist/entry.js`,
    `sshPort=22`,
    `transport=gateway`,
    `Name=${displayName}`,
  ];

  return records;
}

// Encode a DNS name (e.g., "_clawdbot-gw._tcp.local")
function encodeName(name) {
  const parts = name.split('.');
  const buffers = parts.map(part => {
    const len = Buffer.alloc(1);
    len.writeUInt8(part.length);
    return Buffer.concat([len, Buffer.from(part)]);
  });
  return Buffer.concat([...buffers, Buffer.from([0])]);
}

// Encode TXT record data
function encodeTxtRecord(strings) {
  const buffers = strings.map(str => {
    const len = Buffer.alloc(1);
    len.writeUInt8(str.length);
    return Buffer.concat([len, Buffer.from(str)]);
  });
  return Buffer.concat(buffers);
}

// Parse incoming DNS query (simplified)
function parseQuery(msg) {
  try {
    // DNS header is 12 bytes
    const id = msg.readUInt16BE(0);
    const flags = msg.readUInt16BE(2);
    const qdcount = msg.readUInt16BE(4);

    // Check if it's a query (QR bit = 0)
    const isQuery = (flags & 0x8000) === 0;

    if (!isQuery || qdcount === 0) {
      return null;
    }

    // Parse question section (simplified - just extract the name)
    let offset = 12;
    let name = '';
    while (offset < msg.length) {
      const len = msg.readUInt8(offset);
      if (len === 0) {
        offset++;
        break;
      }
      if (name.length > 0) name += '.';
      name += msg.slice(offset + 1, offset + 1 + len).toString();
      offset += len + 1;
    }

    const qtype = msg.readUInt16BE(offset);

    return { id, name, qtype };
  } catch (e) {
    return null;
  }
}

// Build DNS response
function buildResponse(query) {
  const hostname = config.mdns.hostname;
  const serviceType = `_${config.mdnsServiceType}._tcp.local`;
  const serviceName = `${hostname}.${serviceType}`;
  const txtRecords = buildTxtRecords();

  // DNS Header
  const header = Buffer.alloc(12);
  header.writeUInt16BE(query.id, 0);           // ID
  header.writeUInt16BE(0x8400, 2);             // Flags: QR=1, AA=1
  header.writeUInt16BE(0, 4);                  // QDCOUNT
  header.writeUInt16BE(1, 6);                  // ANCOUNT
  header.writeUInt16BE(0, 8);                  // NSCOUNT
  header.writeUInt16BE(2, 10);                 // ARCOUNT

  // Answer section - PTR record pointing to service
  const ptrName = encodeName(serviceType);
  const ptrData = encodeName(serviceName);
  const ptrRecord = Buffer.alloc(10 + ptrData.length);
  let offset = 0;

  // Copy name
  const answerName = encodeName(query.name.includes('_services') ? '_services._dns-sd._udp.local' : serviceType);

  // Build answer
  const answer = Buffer.concat([
    answerName,
    Buffer.from([0, DNS_TYPE.PTR, 0, 1]),     // TYPE=PTR, CLASS=IN
    Buffer.from([0, 0, 0x11, 0x94]),          // TTL=4500
    Buffer.from([0, ptrData.length]),          // RDLENGTH
    ptrData
  ]);

  // Additional records - TXT record with service info
  const txtData = encodeTxtRecord(txtRecords);
  const txtRecord = Buffer.concat([
    encodeName(serviceName),
    Buffer.from([0, DNS_TYPE.TXT, 0, 1]),     // TYPE=TXT, CLASS=IN
    Buffer.from([0, 0, 0x11, 0x94]),          // TTL=4500
    Buffer.from([(txtData.length >> 8) & 0xff, txtData.length & 0xff]),
    txtData
  ]);

  // SRV record
  const srvTarget = encodeName(`${hostname}.local`);
  const srvData = Buffer.alloc(6 + srvTarget.length);
  srvData.writeUInt16BE(0, 0);                 // Priority
  srvData.writeUInt16BE(0, 2);                 // Weight
  srvData.writeUInt16BE(config.honeypot.port, 4); // Port
  srvTarget.copy(srvData, 6);

  const srvRecord = Buffer.concat([
    encodeName(serviceName),
    Buffer.from([0, DNS_TYPE.SRV, 0, 1]),     // TYPE=SRV, CLASS=IN
    Buffer.from([0, 0, 0x11, 0x94]),          // TTL=4500
    Buffer.from([(srvData.length >> 8) & 0xff, srvData.length & 0xff]),
    srvData
  ]);

  return Buffer.concat([header, answer, txtRecord, srvRecord]);
}

export async function startMdnsServer() {
  if (!config.mdns.enabled) {
    console.log('[mDNS-UDP] Disabled by configuration');
    return null;
  }

  return new Promise((resolve, reject) => {
    server = dgram.createSocket('udp4');

    server.on('message', (msg, rinfo) => {
      const query = parseQuery(msg);

      if (query) {
        console.log(`[mDNS-UDP] Query from ${rinfo.address}: ${query.name} (type ${query.qtype})`);

        // Respond to any mDNS query
        const response = buildResponse(query);
        server.send(response, rinfo.port, rinfo.address, (err) => {
          if (err) {
            console.error('[mDNS-UDP] Send error:', err.message);
          }
        });
      }
    });

    server.on('error', (err) => {
      console.error('[mDNS-UDP] Server error:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.log('[mDNS-UDP] Port 5353 in use (avahi running?). Skipping.');
        resolve(null);
      } else {
        reject(err);
      }
    });

    server.bind(5353, '0.0.0.0', () => {
      console.log('[mDNS-UDP] Listening on port 5353');
      console.log(`[mDNS-UDP] Service: _${config.mdnsServiceType}._tcp.local`);
      resolve(server);
    });
  });
}

export async function stopMdnsServer() {
  if (server) {
    server.close();
    console.log('[mDNS-UDP] Server stopped');
  }
}

export default { startMdnsServer, stopMdnsServer };

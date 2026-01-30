/**
 * Simple mDNS/DNS-SD Server
 *
 * Responds to DNS queries on port 5353 with service information.
 * Emulates real ClawdBot/MoltBot mDNS responses.
 */

import dgram from 'dgram';
import os from 'os';
import config from '../config/index.js';

let server = null;

// DNS record types
const DNS_TYPE = {
  A: 1,
  AAAA: 28,
  PTR: 12,
  TXT: 16,
  SRV: 33,
  NSEC: 47,
};

// Get public IP (or fallback)
function getPublicIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Get IPv6 link-local
function getIPv6LinkLocal() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv6' && iface.address.startsWith('fe80::')) {
        return iface.address;
      }
    }
  }
  return null;
}

// Build TXT record data (matching real ClawdBot)
function buildTxtRecords() {
  const hostname = config.mdns.hostname;
  const displayName = hostname;

  const records = [
    `role=gateway`,
    `gatewayPort=${config.honeypot.port}`,
    `lanHost=${hostname}.local`,
    `displayName=${displayName}`,
    `cliPath=/home/user/.npm-global/lib/node_modules/${config.serviceName}/dist/entry.js`,
    `sshPort=22`,
    `transport=gateway`,
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

// Encode IPv4 address
function encodeIPv4(ip) {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  return Buffer.from(parts);
}

// Encode IPv6 address
function encodeIPv6(ip) {
  // Remove fe80:: prefix handling and expand
  const full = ip.replace('fe80::', 'fe80:0000:0000:0000:');
  const parts = full.split(':');
  const buf = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    const val = parseInt(parts[i] || '0', 16);
    buf.writeUInt16BE(val, i * 2);
  }
  return buf;
}

// Parse incoming DNS query
function parseQuery(msg) {
  try {
    const id = msg.readUInt16BE(0);
    const flags = msg.readUInt16BE(2);
    const qdcount = msg.readUInt16BE(4);

    const isQuery = (flags & 0x8000) === 0;
    if (!isQuery || qdcount === 0) {
      return null;
    }

    // Parse question section
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
    const qclass = msg.readUInt16BE(offset + 2);

    // Store original question for response
    const questionData = msg.slice(12, offset + 4);

    return { id, name, qtype, qclass, questionData, qdcount };
  } catch (e) {
    return null;
  }
}

// Build DNS response (matching real ClawdBot format)
function buildResponse(query) {
  const hostname = config.mdns.hostname;
  const serviceType = `_${config.mdnsServiceType}._tcp.local`;
  // Real ClawdBot uses "hostname (Clawdbot)" format with space (0x20)
  const serviceName = `${hostname} (${config.displayName}).${serviceType}`;
  const hostLocal = `${hostname}.local`;
  const txtRecords = buildTxtRecords();
  const publicIP = getPublicIP();
  const ipv6 = getIPv6LinkLocal();

  const TTL = 10; // Real ClawdBot uses TTL=10

  // DNS Header
  const header = Buffer.alloc(12);
  header.writeUInt16BE(query.id, 0);
  header.writeUInt16BE(0x8400, 2);             // Flags: QR=1, AA=1
  header.writeUInt16BE(1, 4);                  // QDCOUNT=1 (include question)
  header.writeUInt16BE(1, 6);                  // ANCOUNT=1
  header.writeUInt16BE(0, 8);                  // NSCOUNT=0

  // Count additional records (TXT, SRV, A, optionally AAAA, NSEC x2)
  let arcount = 4; // TXT + SRV + A + NSEC(service)
  if (ipv6) arcount += 1; // AAAA
  arcount += 1; // NSEC(host)
  header.writeUInt16BE(arcount, 10);

  // Question section (echo back)
  const question = query.questionData;

  // Answer section - PTR record
  const ptrName = encodeName(serviceType);
  const ptrData = encodeName(serviceName);
  const ptrRecord = Buffer.concat([
    ptrName,
    Buffer.from([0, DNS_TYPE.PTR]),            // TYPE=PTR
    Buffer.from([0, 1]),                        // CLASS=IN
    Buffer.from([0, 0, 0, TTL]),               // TTL
    Buffer.from([(ptrData.length >> 8) & 0xff, ptrData.length & 0xff]),
    ptrData
  ]);

  // Additional: TXT record
  const txtData = encodeTxtRecord(txtRecords);
  const txtRecord = Buffer.concat([
    encodeName(serviceName),
    Buffer.from([0, DNS_TYPE.TXT, 0, 1]),
    Buffer.from([0, 0, 0, TTL]),
    Buffer.from([(txtData.length >> 8) & 0xff, txtData.length & 0xff]),
    txtData
  ]);

  // Additional: SRV record
  const srvTarget = encodeName(hostLocal);
  const srvRdata = Buffer.alloc(6);
  srvRdata.writeUInt16BE(0, 0);                // Priority
  srvRdata.writeUInt16BE(0, 2);                // Weight
  srvRdata.writeUInt16BE(config.honeypot.port, 4);
  const srvData = Buffer.concat([srvRdata, srvTarget]);
  const srvRecord = Buffer.concat([
    encodeName(serviceName),
    Buffer.from([0, DNS_TYPE.SRV, 0, 1]),
    Buffer.from([0, 0, 0, TTL]),
    Buffer.from([(srvData.length >> 8) & 0xff, srvData.length & 0xff]),
    srvData
  ]);

  // Additional: A record
  const aData = encodeIPv4(publicIP);
  const aRecord = Buffer.concat([
    encodeName(hostLocal),
    Buffer.from([0, DNS_TYPE.A, 0, 1]),
    Buffer.from([0, 0, 0, TTL]),
    Buffer.from([0, 4]),                        // RDLENGTH=4
    aData
  ]);

  // Additional: AAAA record (if available)
  let aaaaRecord = Buffer.alloc(0);
  if (ipv6) {
    const aaaaData = encodeIPv6(ipv6);
    aaaaRecord = Buffer.concat([
      encodeName(hostLocal),
      Buffer.from([0, DNS_TYPE.AAAA, 0, 1]),
      Buffer.from([0, 0, 0, TTL]),
      Buffer.from([0, 16]),                     // RDLENGTH=16
      aaaaData
    ]);
  }

  // Additional: NSEC record for service (indicates TXT and SRV exist)
  const nsecServiceBitmap = Buffer.from([0, 5, 0x00, 0x00, 0x80, 0x00, 0x40]); // TXT + SRV
  const nsecServiceNext = encodeName(serviceName);
  const nsecServiceData = Buffer.concat([nsecServiceNext, nsecServiceBitmap]);
  const nsecServiceRecord = Buffer.concat([
    encodeName(serviceName),
    Buffer.from([0, DNS_TYPE.NSEC, 0, 1]),
    Buffer.from([0, 0, 0, TTL]),
    Buffer.from([(nsecServiceData.length >> 8) & 0xff, nsecServiceData.length & 0xff]),
    nsecServiceData
  ]);

  // Additional: NSEC record for host (indicates A and AAAA exist)
  const nsecHostBitmap = ipv6
    ? Buffer.from([0, 4, 0x40, 0x00, 0x00, 0x08]) // A + AAAA
    : Buffer.from([0, 1, 0x40]);                   // A only
  const nsecHostNext = encodeName(hostLocal);
  const nsecHostData = Buffer.concat([nsecHostNext, nsecHostBitmap]);
  const nsecHostRecord = Buffer.concat([
    encodeName(hostLocal),
    Buffer.from([0, DNS_TYPE.NSEC, 0, 1]),
    Buffer.from([0, 0, 0, TTL]),
    Buffer.from([(nsecHostData.length >> 8) & 0xff, nsecHostData.length & 0xff]),
    nsecHostData
  ]);

  return Buffer.concat([
    header,
    question,
    ptrRecord,
    txtRecord,
    srvRecord,
    aRecord,
    aaaaRecord,
    nsecServiceRecord,
    nsecHostRecord
  ]);
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
        console.log('[mDNS-UDP] Port 5353 in use. Disable avahi: sudo systemctl stop avahi-daemon');
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

#!/usr/bin/env node
/**
 * Test WebSocket endpoints of MoltBot/ClawdBot honeypot
 */

import WebSocket from 'ws';

const host = process.argv[2] || '127.0.0.1';
const port = process.argv[3] || '18789';
const url = `ws://${host}:${port}`;

console.log(`=== Testing WebSocket on ${url} ===\n`);

const ws = new WebSocket(url);
let messageId = 1;
const pendingTests = [];
let testIndex = 0;

const tests = [
  {
    name: 'Connect with auth',
    message: {
      type: 'req',
      id: null,
      method: 'connect',
      params: { auth: { token: 'test-token-123' } },
    },
  },
  {
    name: 'Health check',
    message: {
      type: 'req',
      id: null,
      method: 'health',
      params: {},
    },
  },
  {
    name: 'Send message',
    message: {
      type: 'req',
      id: null,
      method: 'send',
      params: { target: 'telegram', message: 'test message' },
    },
  },
  {
    name: 'Agent request',
    message: {
      type: 'req',
      id: null,
      method: 'agent',
      params: { prompt: 'execute whoami' },
    },
  },
  {
    name: 'Chat send',
    message: {
      type: 'req',
      id: null,
      method: 'chat.send',
      params: { message: 'hello from test' },
    },
  },
  {
    name: 'Sessions list',
    message: {
      type: 'req',
      id: null,
      method: 'sessions.list',
      params: {},
    },
  },
  {
    name: 'Unknown method',
    message: {
      type: 'req',
      id: null,
      method: 'unknown.method',
      params: {},
    },
  },
];

function sendNextTest() {
  if (testIndex >= tests.length) {
    console.log('\n=== WebSocket tests completed ===');
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 500);
    return;
  }

  const test = tests[testIndex];
  const id = messageId++;
  test.message.id = id;
  pendingTests[id] = test.name;

  console.log(`[SEND] ${test.name}`);
  console.log(`  → ${JSON.stringify(test.message).slice(0, 100)}`);
  ws.send(JSON.stringify(test.message));
  testIndex++;
}

ws.on('open', () => {
  console.log('[CONNECTED]\n');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'event') {
      console.log(`[EVENT] ${msg.event}`);
      console.log(`  ← ${JSON.stringify(msg.payload).slice(0, 100)}`);

      // After connect.challenge, start sending tests
      if (msg.event === 'connect.challenge') {
        console.log('');
        setTimeout(sendNextTest, 100);
      }
    } else if (msg.type === 'res') {
      const testName = pendingTests[msg.id] || 'unknown';
      const status = msg.ok ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`[RECV] ${testName} - ${status}`);
      console.log(`  ← ${JSON.stringify(msg.payload || msg.error).slice(0, 150)}`);
      console.log('');

      setTimeout(sendNextTest, 200);
    }
  } catch (err) {
    console.log(`[ERROR] Parse error: ${err.message}`);
  }
});

ws.on('error', (err) => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});

ws.on('close', () => {
  console.log('[DISCONNECTED]');
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('[TIMEOUT] Tests took too long');
  ws.close();
  process.exit(1);
}, 30000);

/**
 * WebSocket Server for Honeypot
 *
 * Implements the WebSocket gateway protocol that mimics MoltBot/ClawdBot.
 */

import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import config from '../config/index.js';
import attackStore from '../storage/attack-store.js';

export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const clientId = randomUUID();

    console.log(`[WS] New connection from ${ip}, ID: ${clientId}`);

    // Record the connection
    attackStore.recordWsConnection({
      ip,
      headers: req.headers,
    });

    // Send connection challenge (mimics real protocol)
    ws.send(
      JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: {
          nonce: randomUUID(),
          ts: Date.now(),
        },
      })
    );

    ws.on('message', data => {
      try {
        const message = JSON.parse(data.toString());

        console.log(`[WS MESSAGE] ${clientId}:`, JSON.stringify(message).slice(0, 200));

        // Record the message
        attackStore.recordWsMessage({
          ip,
          clientId,
          message,
        });

        if (message.type === 'req') {
          handleRequest(ws, message, clientId);
        }
      } catch (err) {
        console.log(`[WS ERROR] ${clientId}: ${err.message}`);
        attackStore.recordWsMessage({
          ip,
          clientId,
          message: { error: 'parse_error', raw: data.toString().slice(0, 500) },
        });
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Connection closed: ${clientId}`);
    });

    ws.on('error', err => {
      console.log(`[WS ERROR] ${clientId}: ${err.message}`);
    });

    // Send periodic tick events (mimics real protocol)
    const tickInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'event',
            event: 'tick',
            payload: { ts: Date.now() },
          })
        );
      } else {
        clearInterval(tickInterval);
      }
    }, 30000);

    // Clean up on close
    ws.on('close', () => {
      clearInterval(tickInterval);
    });
  });

  return wss;
}

function handleRequest(ws, message, clientId) {
  const { method, params, id } = message;

  switch (method) {
    case 'connect':
      handleConnect(ws, message, clientId);
      break;

    case 'health':
      sendResponse(ws, id, true, {
        status: 'ok',
        uptime: process.uptime(),
        version: config.version,
      });
      break;

    case 'send':
      console.log('[WS SEND REQUEST]', {
        target: params?.target,
        message: params?.message?.slice?.(0, 100) || params?.message,
      });
      sendResponse(ws, id, true, {
        messageId: `msg_${randomUUID()}`,
        status: 'sent',
      });
      break;

    case 'agent':
    case 'agent.run':
      console.log('[WS AGENT REQUEST - DANGEROUS]', {
        prompt: params?.prompt?.slice?.(0, 100) || params?.message?.slice?.(0, 100),
      });
      sendResponse(ws, id, true, {
        runId: `run_${randomUUID()}`,
        status: 'queued',
      });
      // Send fake agent events
      setTimeout(() => {
        sendEvent(ws, 'agent.started', { runId: `run_${randomUUID()}` });
      }, 200);
      setTimeout(() => {
        sendEvent(ws, 'agent.completed', {
          runId: `run_${randomUUID()}`,
          output: `${config.displayName} agent response`,
        });
      }, 1000);
      break;

    case 'chat.send':
      console.log('[WS CHAT SEND]', {
        message: params?.message?.slice?.(0, 100),
      });
      sendResponse(ws, id, true, {
        messageId: `msg_${randomUUID()}`,
        status: 'sent',
      });
      break;

    case 'chat.history':
      sendResponse(ws, id, true, {
        messages: [],
        hasMore: false,
      });
      break;

    case 'sessions.list':
      sendResponse(ws, id, true, {
        sessions: [],
      });
      break;

    case 'node.list':
      sendResponse(ws, id, true, {
        nodes: [],
      });
      break;

    case 'status':
      sendResponse(ws, id, true, {
        status: 'running',
        version: config.version,
        protocol: config.protocol,
      });
      break;

    default:
      console.log(`[WS UNKNOWN METHOD] ${method}`);
      sendResponse(ws, id, false, null, {
        code: 'UNKNOWN_METHOD',
        message: `Method ${method} not implemented`,
      });
  }
}

function handleConnect(ws, message, clientId) {
  const { params, id } = message;
  const token = params?.auth?.token;
  const password = params?.auth?.password;

  console.log('[WS CONNECT ATTEMPT]', {
    hasToken: !!token,
    hasPassword: !!password,
    tokenPreview: token?.slice?.(0, 10) + '...',
  });

  // Accept any auth for honeypot (to capture credentials)
  // In a real scenario you might want to validate against config.honeypot.token

  sendResponse(ws, id, true, {
    type: 'hello-ok',
    protocol: config.protocol,
    server: {
      version: config.version,
      connId: `ws-${clientId}`,
      name: config.displayName,
    },
    features: {
      methods: ['health', 'send', 'agent', 'chat.send', 'chat.history', 'sessions.list', 'node.list'],
      events: ['tick', 'presence', 'agent', 'chat', 'health', 'shutdown'],
    },
    snapshot: {
      presence: [],
      health: { status: 'ok' },
      stateVersion: { presence: 0, health: 0 },
      uptimeMs: process.uptime() * 1000,
    },
    policy: {
      maxPayload: 1048576,
      maxBufferedBytes: 1048576,
      tickIntervalMs: 30000,
    },
  });
}

function sendResponse(ws, id, ok, payload, error = null) {
  if (ws.readyState !== ws.OPEN) return;

  const response = {
    type: 'res',
    id,
    ok,
  };

  if (ok) {
    response.payload = payload;
  } else {
    response.error = error;
  }

  ws.send(JSON.stringify(response));
}

function sendEvent(ws, event, payload) {
  if (ws.readyState !== ws.OPEN) return;

  ws.send(
    JSON.stringify({
      type: 'event',
      event,
      payload,
    })
  );
}

export default createWebSocketServer;

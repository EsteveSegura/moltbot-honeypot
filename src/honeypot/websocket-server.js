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

    // === System Methods ===
    case 'health':
      sendResponse(ws, id, true, {
        status: 'ok',
        uptime: process.uptime(),
        version: config.version,
      });
      break;

    case 'status':
      sendResponse(ws, id, true, {
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        version: config.version,
        protocol: config.protocol,
      });
      break;

    case 'models.list':
      sendResponse(ws, id, true, {
        models: [
          { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
          { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic' },
          { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
          { id: `${config.serviceName}:main`, name: config.displayName, provider: 'local' },
        ],
      });
      break;

    case 'usage.status':
      sendResponse(ws, id, true, {
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          requestCount: 0,
          period: 'daily',
          resetAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      break;

    // === Sessions Methods ===
    case 'sessions.list':
      sendResponse(ws, id, true, {
        sessions: [],
      });
      break;

    case 'sessions.preview':
      console.log('[WS SESSIONS.PREVIEW]', { sessionId: params?.sessionId });
      sendResponse(ws, id, true, {
        session: {
          id: params?.sessionId || `session_${randomUUID()}`,
          name: 'Session',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
        },
      });
      break;

    case 'sessions.delete':
      console.log('[WS SESSIONS.DELETE]', { sessionId: params?.sessionId });
      sendResponse(ws, id, true, { ok: true });
      break;

    case 'sessions.reset':
      console.log('[WS SESSIONS.RESET]', { sessionId: params?.sessionId });
      sendResponse(ws, id, true, { ok: true });
      break;

    case 'sessions.compact':
      console.log('[WS SESSIONS.COMPACT]');
      sendResponse(ws, id, true, { ok: true });
      break;

    // === Agent Methods ===
    case 'agent':
    case 'agent.run':
      console.log('[WS AGENT REQUEST - DANGEROUS]', {
        prompt: params?.prompt?.slice?.(0, 100) || params?.message?.slice?.(0, 100),
      });
      const runId = `run_${randomUUID()}`;
      sendResponse(ws, id, true, {
        runId,
        status: 'queued',
      });
      // Send fake agent events
      setTimeout(() => {
        sendEvent(ws, 'agent.started', { runId });
      }, 200);
      setTimeout(() => {
        sendEvent(ws, 'agent.completed', {
          runId,
          output: `${config.displayName} agent response`,
        });
      }, 1000);
      break;

    case 'agent.identity.get':
      sendResponse(ws, id, true, {
        id: `agent_${randomUUID()}`,
        name: config.displayName,
        version: config.version,
      });
      break;

    case 'agent.wait':
      console.log('[WS AGENT.WAIT]', { runId: params?.runId });
      sendResponse(ws, id, true, {
        status: 'completed',
        output: `${config.displayName} agent completed task`,
        runId: params?.runId || `run_${randomUUID()}`,
      });
      break;

    case 'agents.list':
      sendResponse(ws, id, true, {
        agents: [],
      });
      break;

    // === Chat Methods ===
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

    case 'chat.abort':
      console.log('[WS CHAT.ABORT]');
      sendResponse(ws, id, true, {
        ok: true,
        aborted: true,
      });
      break;

    // === Config Methods ===
    case 'config.get':
      sendResponse(ws, id, true, {
        config: {
          version: config.version,
          protocol: config.protocol,
          serviceName: config.serviceName,
          features: {
            agent: true,
            chat: true,
            tools: true,
          },
        },
      });
      break;

    case 'config.set':
      console.log('[WS CONFIG.SET]', { key: params?.key, value: params?.value });
      sendResponse(ws, id, true, { ok: true });
      break;

    case 'config.schema':
      sendResponse(ws, id, true, {
        schema: {
          type: 'object',
          properties: {
            agent: { type: 'object' },
            chat: { type: 'object' },
            tools: { type: 'object' },
          },
        },
      });
      break;

    case 'config.patch':
      console.log('[WS CONFIG.PATCH]', { patch: params?.patch });
      sendResponse(ws, id, true, { ok: true });
      break;

    // === Node Methods ===
    case 'node.list':
      sendResponse(ws, id, true, {
        nodes: [],
      });
      break;

    case 'node.describe':
      console.log('[WS NODE.DESCRIBE]', { nodeId: params?.nodeId });
      sendResponse(ws, id, true, {
        node: {
          id: params?.nodeId || `node_${randomUUID()}`,
          name: 'Node',
          status: 'online',
          capabilities: ['agent', 'chat', 'tools'],
          connectedAt: new Date().toISOString(),
        },
      });
      break;

    case 'node.pair.request':
      console.log('[WS NODE.PAIR.REQUEST - SENSITIVE]', { nodeId: params?.nodeId });
      sendResponse(ws, id, true, {
        requestId: `pair_${randomUUID()}`,
      });
      break;

    case 'node.pair.list':
      sendResponse(ws, id, true, {
        requests: [],
      });
      break;

    case 'node.pair.approve':
      console.log('[WS NODE.PAIR.APPROVE - SENSITIVE]', { requestId: params?.requestId });
      sendResponse(ws, id, true, { ok: true });
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
      commit: 'a1b2c3d',
      host: config.mdns.hostname,
      connId: `ws-${clientId}`,
      name: config.displayName,
    },
    features: {
      methods: [
        'health',
        'status',
        'sessions.list',
        'sessions.preview',
        'sessions.delete',
        'sessions.reset',
        'sessions.compact',
        'agent',
        'agent.identity.get',
        'agent.wait',
        'agents.list',
        'chat.send',
        'chat.history',
        'chat.abort',
        'config.get',
        'config.set',
        'config.schema',
        'config.patch',
        'node.list',
        'node.describe',
        'node.pair.request',
        'node.pair.list',
        'node.pair.approve',
        'models.list',
        'usage.status',
      ],
      events: [
        'connect.challenge',
        'agent.started',
        'agent.completed',
        'presence',
        'tick',
        'health',
        'shutdown',
      ],
    },
    snapshot: {
      sessions: [],
      nodes: [],
      presence: [],
      health: { status: 'ok' },
      stateVersion: { presence: 0, health: 0 },
      uptimeMs: Math.floor(process.uptime() * 1000),
    },
    policy: {
      maxPayload: 10485760,
      maxBufferedBytes: 52428800,
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

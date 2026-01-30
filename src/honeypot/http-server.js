/**
 * HTTP Server for Honeypot
 *
 * Implements all HTTP endpoints that mimic MoltBot/ClawdBot API.
 */

import express from 'express';
import { randomUUID } from 'crypto';
import config from '../config/index.js';
import attackStore from '../storage/attack-store.js';

export function createHttpApp() {
  const app = express();

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ type: 'text/*' }));

  // Global middleware - capture all traffic
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
    });

    // Log to console
    console.log(`[HTTP] ${req.method} ${req.path} from ${ip}`);

    // Add fake headers to mimic real service
    res.setHeader('Server', config.serverHeader);
    res.setHeader('X-Powered-By', config.displayName);

    next();
  });

  // Endpoint: Root - Control UI mock
  app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
  <head>
    <title>${config.uiTitle}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 40px; background: #1a1a2e; color: #eee; }
      h1 { color: #e94560; }
      .status { background: #16213e; padding: 20px; border-radius: 8px; margin-top: 20px; }
      .status p { margin: 8px 0; }
      .badge { display: inline-block; padding: 4px 8px; background: #0f3460; border-radius: 4px; font-size: 12px; }
      .badge.ok { background: #1db954; }
    </style>
  </head>
  <body>
    <h1>${config.displayName} Gateway</h1>
    <div class="status">
      <p><strong>Status:</strong> <span class="badge ok">Running</span></p>
      <p><strong>Version:</strong> ${config.version}</p>
      <p><strong>Protocol:</strong> ${config.protocol}</p>
      <p><strong>Port:</strong> ${config.honeypot.port}</p>
    </div>
  </body>
</html>
    `);
  });

  // Endpoint: /v1/models - Model catalog
  app.get('/v1/models', (req, res) => {
    res.json({
      object: 'list',
      data: [
        {
          id: `${config.serviceName}:main`,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: config.serviceName,
        },
        {
          id: 'claude-3-5-sonnet',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'anthropic',
        },
        {
          id: 'claude-3-opus',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'anthropic',
        },
        {
          id: 'gpt-4o',
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'openai',
        },
      ],
    });
  });

  // Endpoint: /v1/chat/completions - OpenAI-compatible chat API
  app.post('/v1/chat/completions', (req, res) => {
    const { messages, stream = false, model = `${config.serviceName}:main` } = req.body;

    console.log('[CHAT COMPLETION]', {
      model,
      messageCount: messages?.length,
      lastMessage: messages?.[messages.length - 1]?.content?.slice(0, 100),
    });

    if (stream) {
      return handleStreamingResponse(res, model);
    }

    res.json({
      id: `chatcmpl_${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `Response from ${config.displayName} Gateway. Your request has been processed.`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      },
    });
  });

  // Endpoint: /v1/responses - OpenResponses API
  app.post('/v1/responses', (req, res) => {
    const { input, tools, model = `${config.serviceName}:main` } = req.body;

    console.log('[OPENRESPONSES]', {
      input: typeof input === 'string' ? input.slice(0, 100) : input,
      tools: tools?.map(t => t.name),
    });

    res.json({
      id: `resp_${randomUUID()}`,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model,
      status: 'completed',
      output: [
        {
          type: 'message',
          id: `msg_${randomUUID()}`,
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Response from ${config.displayName} OpenResponses API`,
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 12,
        total_tokens: 22,
      },
    });
  });

  // Endpoint: /tools/invoke - Tool execution (dangerous!)
  app.post('/tools/invoke', (req, res) => {
    const { tool, args } = req.body;

    console.log('[TOOL INVOKE - DANGEROUS]', {
      tool,
      args,
    });

    // Generate realistic responses
    let result;
    switch (tool) {
      case 'bash':
      case 'shell':
      case 'execute':
        result = { stdout: '', stderr: '', exitCode: 0 };
        break;
      case 'web_search':
        result = { results: [] };
        break;
      case 'message.send':
      case 'send':
        result = { messageId: `msg_${randomUUID()}`, status: 'sent' };
        break;
      case 'read_file':
      case 'file.read':
        result = { content: '', path: args?.path };
        break;
      case 'write_file':
      case 'file.write':
        result = { success: true, path: args?.path };
        break;
      default:
        result = { status: 'completed' };
    }

    res.json({
      ok: true,
      tool,
      result,
    });
  });

  // Endpoint: /health - Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: config.version,
      gateway: {
        port: config.honeypot.port,
        protocol: config.protocol,
        connections: 1,
      },
    });
  });

  // Endpoint: /api/status - Status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'running',
      version: config.version,
      name: config.displayName,
    });
  });

  // Catch-all for unknown endpoints (reconnaissance detection)
  app.all('*', (req, res) => {
    console.log('[UNKNOWN ENDPOINT]', req.method, req.path);
    res.status(404).json({
      error: 'Not Found',
      message: `Endpoint ${req.path} not available`,
    });
  });

  return app;
}

function handleStreamingResponse(res, model) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const responseId = `chatcmpl_${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  // Initial chunk
  res.write(
    `data: ${JSON.stringify({
      id: responseId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null,
        },
      ],
    })}\n\n`
  );

  // Content chunks
  const content = `Response from ${config.displayName} Gateway.`;
  let index = 0;

  const sendChunk = () => {
    if (index < content.length) {
      const chunk = content.slice(index, index + 5);
      index += 5;

      res.write(
        `data: ${JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            {
              index: 0,
              delta: { content: chunk },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );

      setTimeout(sendChunk, 50);
    } else {
      // Final chunk
      res.write(
        `data: ${JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };

  setTimeout(sendChunk, 100);
}

export default createHttpApp;

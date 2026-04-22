import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import type { ServerDeps } from '../shared/types.js';
import { handleWebhookEvent, type WebhookEvent } from './webhook-handler.js';

const logger = pino({ name: 'http-transport' });

/**
 * Start an HTTP server with streamable HTTP transport for the MCP server.
 * Includes /health endpoint for monitoring and /webhook for CRM event ingestion.
 */
export async function startHttpTransport(
  server: McpServer,
  port: number,
  deps?: ServerDeps
): Promise<void> {
  // Track active transports for session management
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: '0.5.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // Webhook endpoint — receives CRM events and routes to agents
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (!deps) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Webhook handler not configured' }));
        return;
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks).toString();
        const event = JSON.parse(body) as WebhookEvent;

        if (!event.type || !event.timestamp) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields: type, timestamp' }));
          return;
        }

        const result = await handleWebhookEvent(event, deps);
        res.writeHead(result.processed ? 200 : 422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        logger.error({ err }, 'Webhook processing error');
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      }
      return;
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (req.method === 'POST') {
          // Check for existing session
          let transport: StreamableHTTPServerTransport;
          if (sessionId && transports.has(sessionId)) {
            transport = transports.get(sessionId)!;
          } else {
            // New session
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => crypto.randomUUID(),
            });
            await server.connect(transport);

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid) transports.delete(sid);
            };
          }

          await transport.handleRequest(req, res);

          // Store by session ID after handling (session ID is set during first request)
          if (transport.sessionId && !transports.has(transport.sessionId)) {
            transports.set(transport.sessionId, transport);
          }
        } else if (req.method === 'GET') {
          // SSE stream for server-initiated messages
          if (sessionId && transports.has(sessionId)) {
            const transport = transports.get(sessionId)!;
            await transport.handleRequest(req, res);
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No active session. Send a POST first.' }));
          }
        } else if (req.method === 'DELETE') {
          // Session cleanup
          if (sessionId && transports.has(sessionId)) {
            const transport = transports.get(sessionId)!;
            await transport.handleRequest(req, res);
            transports.delete(sessionId);
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Session not found' }));
          }
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } catch (err) {
        logger.error({ err }, 'Error handling MCP request');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
      return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /mcp for MCP protocol or /health for status.' }));
  });

  httpServer.listen(port, () => {
    logger.info({ port }, 'MCP HTTP server listening');
  });
}

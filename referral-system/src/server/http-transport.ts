import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';

const logger = pino({ name: 'http-transport' });

/**
 * Start an HTTP server with streamable HTTP transport for the MCP server.
 * Includes /health endpoint for monitoring.
 */
export async function startHttpTransport(
  server: McpServer,
  port: number
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

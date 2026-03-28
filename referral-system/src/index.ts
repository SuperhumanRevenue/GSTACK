import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { CacheClient } from './cache/redis.js';
import { createMcpServer } from './server/mcp-server.js';
import { HubSpotStub } from './integrations/crm/hubspot-stub.js';
import { EnrichmentStub } from './integrations/enrichment/stub.js';
import { ConversationIntelStub } from './integrations/conversation-intel/stub.js';
import { NotificationStub } from './integrations/notifications/stub.js';
import { IntentStub } from './integrations/intent/stub.js';
import type { ServerDeps } from './shared/types.js';

const logger = pino({ name: 'referral-system' });

async function main() {
  // 1. Load config
  const config = loadConfig();
  logger.info({ transport: config.mcpTransport, env: config.nodeEnv }, 'Starting referral system');

  // 2. Connect to database
  const db = createDbClient(config.databaseUrl);
  logger.info('Database connected');

  // 3. Initialize cache (optional — degrades gracefully)
  const cache = new CacheClient(config.redisUrl);

  // 4. Initialize integration adapters (stubs for now)
  const crm = new HubSpotStub();
  const enrichment = new EnrichmentStub();
  const conversationIntel = new ConversationIntelStub();
  const notifications = new NotificationStub();
  const intent = new IntentStub();

  // 5. Assemble dependency container
  const deps: ServerDeps = {
    db,
    cache,
    crm,
    enrichment,
    conversationIntel,
    notifications,
    intent,
    config,
  };

  // 6. Create MCP server with all tools
  const server = createMcpServer(deps);

  // 7. Start transport
  if (config.mcpTransport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('MCP server running on stdio transport');
  } else {
    // Streamable HTTP transport — Phase 5
    logger.error('HTTP transport not yet implemented. Use MCP_TRANSPORT=stdio');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start referral system');
  process.exit(1);
});

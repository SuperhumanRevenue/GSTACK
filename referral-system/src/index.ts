import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { CacheClient } from './cache/redis.js';
import { createMcpServer } from './server/mcp-server.js';
import { startHttpTransport } from './server/http-transport.js';

// Integration adapters
import { HubSpotStub } from './integrations/crm/hubspot-stub.js';
import { HubSpotAdapter } from './integrations/crm/hubspot.js';
import { EnrichmentStub } from './integrations/enrichment/stub.js';
import { ApolloAdapter } from './integrations/enrichment/apollo.js';
import { CachedEnrichmentAdapter } from './integrations/enrichment/cached.js';
import { ConversationIntelStub } from './integrations/conversation-intel/stub.js';
import { NotificationStub } from './integrations/notifications/stub.js';
import { SlackAdapter } from './integrations/notifications/slack.js';
import { IntentStub } from './integrations/intent/stub.js';
import { LLMStub } from './integrations/llm/stub.js';
import { WebSearchStub } from './integrations/web-search/stub.js';
import { RateLimiter, DEFAULT_RATE_LIMITS } from './integrations/rate-limiter.js';
import type { ServerDeps } from './shared/types.js';
import type { CRMAdapter } from './integrations/crm/interface.js';
import type { EnrichmentAdapter } from './integrations/enrichment/interface.js';
import type { NotificationAdapter } from './integrations/notifications/interface.js';

const logger = pino({ name: 'referral-system' });

async function main() {
  // 1. Load config
  const config = loadConfig();
  logger.info({ transport: config.mcpTransport, env: config.nodeEnv }, 'Starting referral system v0.5.0');

  // 2. Connect to database
  const db = createDbClient(config.databaseUrl);
  logger.info('Database connected');

  // 3. Initialize cache (optional — degrades gracefully)
  const cache = new CacheClient(config.redisUrl);

  // 4. Initialize rate limiter
  const rateLimiter = new RateLimiter(DEFAULT_RATE_LIMITS);

  // 5. Initialize integration adapters
  // CRM: HubSpot live or stub
  let crm: CRMAdapter;
  if (config.hubspotAccessToken) {
    crm = new HubSpotAdapter(config.hubspotAccessToken);
    logger.info('CRM: HubSpot (live)');
  } else {
    crm = new HubSpotStub();
    logger.info('CRM: HubSpot (stub)');
  }

  // Enrichment: Apollo live (with cache) or stub
  let enrichment: EnrichmentAdapter;
  if (config.enableEnrichment && config.apolloApiKey) {
    const apolloAdapter = new ApolloAdapter(config.apolloApiKey);
    enrichment = new CachedEnrichmentAdapter(apolloAdapter, cache);
    logger.info('Enrichment: Apollo (live + cached)');
  } else {
    enrichment = new EnrichmentStub();
    logger.info('Enrichment: Stub');
  }

  // Conversation intel: always stub for now
  const conversationIntel = new ConversationIntelStub();

  // Notifications: Slack live or stub
  let notifications: NotificationAdapter;
  if (config.enableSlackNotifications && config.slackBotToken && config.slackReferralChannel) {
    notifications = new SlackAdapter(config.slackBotToken, config.slackReferralChannel);
    logger.info('Notifications: Slack (live)');
  } else {
    notifications = new NotificationStub();
    logger.info('Notifications: Stub');
  }

  // Intent: always stub for now
  const intent = new IntentStub();

  // LLM: stub for now (swap for Claude/GPT/Gemini adapter)
  const llm = new LLMStub();
  logger.info('LLM: Stub');

  // Web Search: stub for now (swap for Tavily adapter)
  const webSearch = new WebSearchStub();
  logger.info('Web Search: Stub');

  // 6. Assemble dependency container
  const deps: ServerDeps = {
    db,
    cache,
    crm,
    enrichment,
    conversationIntel,
    notifications,
    intent,
    llm,
    webSearch,
    config,
  };

  // 7. Create MCP server with all 26 tools
  const server = createMcpServer(deps);

  // 8. Start transport
  if (config.mcpTransport === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('MCP server running on stdio transport');
  } else {
    await startHttpTransport(server, config.port);
    logger.info({ port: config.port }, 'MCP server running on streamable HTTP transport');
  }
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start referral system');
  process.exit(1);
});

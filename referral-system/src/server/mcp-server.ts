import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../shared/types.js';
import { registerReadinessTools } from '../agents/readiness-scorer/index.js';
import { registerMapperTools } from '../agents/relationship-mapper/index.js';
import { registerAskTools } from '../agents/ask-architect/index.js';
import { registerProgramManagerTools } from '../agents/program-manager/index.js';
import { registerIncentiveTools } from '../agents/incentive-designer/index.js';
import { registerSignalGuideTools } from '../agents/signal-guide/index.js';

const VERSION = '0.5.0';

export function createMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer({
    name: 'referral-system',
    version: VERSION,
  });

  // Phase 1: Readiness Scorer (4 tools)
  registerReadinessTools(server, deps);

  // Phase 2: Relationship Mapper (3 tools)
  registerMapperTools(server, deps);

  // Phase 3: Ask Architect (3 tools)
  registerAskTools(server, deps);

  // Phase 3+4: Program Manager (8 tools — 2 CRUD + 6 analytics)
  registerProgramManagerTools(server, deps);

  // Phase 4: Incentive Designer (4 tools)
  registerIncentiveTools(server, deps);

  // Signal Guide Engine (4 tools)
  registerSignalGuideTools(server, deps);

  return server;
}

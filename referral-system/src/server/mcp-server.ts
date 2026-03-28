import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerDeps } from '../shared/types.js';
import { registerReadinessTools } from '../agents/readiness-scorer/index.js';
import { registerMapperTools } from '../agents/relationship-mapper/index.js';
import { registerAskTools } from '../agents/ask-architect/index.js';
import { registerProgramManagerTools } from '../agents/program-manager/index.js';

const VERSION = '0.3.0';

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

  // Phase 3: Program Manager CRUD (2 tools)
  registerProgramManagerTools(server, deps);

  // Phase 4: Program Manager Analytics (6 tools) — TODO
  // Phase 4: Incentive Designer (4 tools) — TODO

  return server;
}

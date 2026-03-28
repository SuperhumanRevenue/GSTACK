# Referral System

Agent-native B2B referral pipeline system. Five MCP agents that transform ad-hoc referral asks into a systematic, scored, and tracked pipeline source.

## Agents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **Readiness Scorer** | Score accounts for referral readiness (5-dimension, 100-point model) | 4 |
| **Relationship Mapper** | Map champion networks to target accounts | 3 |
| **Ask Architect** | Compose hyper-specific referral asks with response branching | 3 |
| **Program Manager** | Master ledger, super-referrer identification, reports | 8 |
| **Incentive Designer** | Design incentive packages based on company + referrer profiles | 4 |

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Start local Supabase (PostgreSQL)
npx supabase start

# 3. Copy env and configure
cp .env.example .env

# 4. Generate and run migrations
bun run db:generate
bun run db:migrate

# 5. Seed dev data
bun run db:seed

# 6. Start MCP server (stdio)
bun run dev
```

## Tech Stack

- **Runtime:** Bun + TypeScript
- **Protocol:** MCP (Model Context Protocol) via `@modelcontextprotocol/sdk`
- **Database:** Supabase (PostgreSQL) via Drizzle ORM
- **Cache:** Redis (optional — degrades gracefully)
- **CRM:** HubSpot (primary), Salesforce (adapter ready)
- **Testing:** Vitest

## Testing

```bash
bun run test        # Run all tests
bun run test:watch  # Watch mode
bun run typecheck   # Type check only
```

## Architecture

Each agent is a directory under `src/agents/` containing:
- `types.ts` — Agent-specific type definitions
- Pure scoring/composition functions (no side effects)
- `index.ts` — MCP tool definitions that wrap the pure functions

All agents receive a `ServerDeps` dependency container with DB, cache, and integration adapters. Integration adapters follow the interface pattern — swap HubSpot for Salesforce without changing agent code.

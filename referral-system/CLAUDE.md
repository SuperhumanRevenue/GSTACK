# Referral System — Claude Code Context

## What This Is
A five-agent MCP server system for B2B referral pipeline generation.
Sales-led motion, $30K-$MM+ ACV deals.

## Architecture
- 5 agents: Readiness Scorer, Relationship Mapper, Ask Architect, Program Manager, Incentive Designer
- Each agent exposes MCP tools registered on a single server
- Supabase (PostgreSQL) for persistence, Redis for caching (optional)
- Integration adapters for CRM (HubSpot primary, Salesforce ready), enrichment (Apollo/Clearbit),
  conversation intelligence (Gong/Fathom), Slack notifications

## Key Patterns
- All external-facing outputs require human approval (no auto-send)
- Anti-triggers hard-block referral asks on at-risk accounts
- Scoring model uses 100-point scale with 5 weighted dimensions
- Three-version ask system: live, async, soft seed
- Response routing: yes → intro template, maybe → 2-touch followup, no → graceful close
- Dependency injection via ServerDeps container — all agents receive deps, never import directly
- Pure-function scoring engines for testability
- Adapter pattern for all external integrations (swap providers without code changes)

## Tech Stack
- TypeScript + Bun runtime
- MCP SDK (@modelcontextprotocol/sdk) with streamable HTTP transport
- Drizzle ORM + postgres.js → Supabase PostgreSQL
- Zod for all input validation
- Vitest for testing

## Commands
- `bun run dev` — Start MCP server in dev mode (stdio transport)
- `bun run build` — TypeScript compilation
- `bun run test` — Run test suite
- `bun run db:generate` — Generate migrations from schema changes
- `bun run db:migrate` — Run database migrations
- `bun run db:seed` — Seed development data
- `npx supabase start` — Start local Supabase (PostgreSQL + dashboard)
- `npx supabase stop` — Stop local Supabase

## Testing
- Vitest for unit + integration tests
- Factory-based fixtures (buildAccount(), buildChampion(), etc.)
- Pure scoring functions tested without DB
- MCP Inspector for tool testing

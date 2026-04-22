# Referral System — Testing Guide

## Running Tests

```bash
bun run test              # Run all 292 tests (~4s, no API keys needed)
bun run test:watch        # Re-run on every file save
bun run typecheck         # Type-check only (no test execution)
```

---

## What's Tested (20 Test Files, 292 Tests)

### Scoring & Intelligence

| File | Tests | What it covers |
|------|-------|---------------|
| `scoring-engine.test.ts` | 22 | 5-dimension readiness scoring, tier assignment, anti-trigger blocking |
| `pcp-builder.test.ts` | 30 | Power-law distribution, Gini coefficient, tier assignment, ICP weights |
| `signal-guide.test.ts` | 14 | 100-signal master library, custom signal generation, filtering |
| `success-tracker.test.ts` | 15 | Deal health scoring, stalled alerts, cohort comparison |
| `analytics.test.ts` | 5 | Pipeline analytics, conversion rates |

### Relationship & Network

| File | Tests | What it covers |
|------|-------|---------------|
| `network-analyzer.test.ts` | 13 | Graph building, ICP matching, second-order path discovery |
| `connection-scorer.test.ts` | 19 | Connection strength, role match, pain alignment, composite scores |
| `target-matcher.test.ts` | 9 | Target account matching against ICP criteria |
| `portfolio-mapper.test.ts` | 15 | Corporate relationships, subsidiary/PE portfolio discovery |

### Ask & Program Management

| File | Tests | What it covers |
|------|-------|---------------|
| `ask-architect.test.ts` | 33 | 3-version ask generation, response routing, template selection |
| `program-manager.test.ts` | 18 | Referral lifecycle, status updates, monthly reports |
| `incentive-designer.test.ts` | 26 | Reward packages, budget constraints, industry norms |
| `super-referrer.test.ts` | 10 | Super-referrer scoring, tier assignment (Platinum→Bronze) |
| `target-scorer-pm.test.ts` | 8 | Target scoring on 5 dimensions |

### Orchestration & Integration

| File | Tests | What it covers |
|------|-------|---------------|
| `full-analysis.test.ts` | 13 | 5-phase orchestrator pipeline, cross-agent wiring, executive summary |
| `webhook-handler.test.ts` | 11 | 10 CRM event types, trigger creation, champion updates |
| `cross-agent-wiring.test.ts` | 16 | PCP→readiness boost, signal timing, deal health→champion adjustment |

### Infrastructure

| File | Tests | What it covers |
|------|-------|---------------|
| `rate-limiter.test.ts` | 6 | Per-provider rate limiting, window reset |
| `cached-enrichment.test.ts` | 5 | Cache hit/miss, TTL expiration |
| `sync.test.ts` | 4 | Sync module exports (HubSpot, Fathom, Sheets, orchestrator) |

---

## How to Test Manually

### Step 1: Verify unit tests pass

```bash
bun run test
```

Expected output: `292 passed` in ~4 seconds. No database or API keys required.

### Step 2: Type-check the full codebase

```bash
bun run typecheck
```

This catches type errors across all 41 MCP tools, 10 agents, and the sync layer.

### Step 3: Test with demo data (requires database)

```bash
# Start local Supabase (or set DATABASE_URL to your remote instance)
npx supabase start

# Push schema and load demo data
bun run db:push
bun run db:seed
```

This creates:
- 10 accounts (Stripe $2.4M, Datadog $1.8M, Notion $450K, etc.)
- 20 champions (2 per account with realistic titles)
- 15 trigger events (12 positive, 3 anti-triggers)
- 10 referrals across all pipeline stages
- 8 revenue snapshots for PCP analysis
- 5 connection maps

### Step 4: Test MCP tools via MCP Inspector

```bash
# Install MCP Inspector if you don't have it
npx @modelcontextprotocol/inspector

# Start the referral server
bun run dev
```

In MCP Inspector, connect to the server and test tools:

1. **Quick health check:**
   ```json
   orchestrator_quick_health { "accountId": "<id from seed data>" }
   ```

2. **Score an account:**
   ```json
   referral_scorer_score_account { "accountId": "<id>" }
   ```

3. **Score the full portfolio:**
   ```json
   referral_scorer_score_portfolio {}
   ```

4. **Run full analysis:**
   ```json
   orchestrator_run_full_analysis { "accountId": "<id>" }
   ```

### Step 5: Test data sync (dry run first)

```bash
# Preview what would sync — no database writes
DRY_RUN=1 bun run sync

# Test individual sources
DRY_RUN=1 bun run sync:hubspot
DRY_RUN=1 bun run sync:fathom
DRY_RUN=1 bun run sync:sheets

# Real sync once dry run looks good
bun run sync
```

### Step 6: Test webhooks (requires HTTP transport)

```bash
# Start in HTTP mode
MCP_TRANSPORT=streamable_http bun run dev
```

Then send test webhook events:

```bash
# Test a closed-won deal
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "deal.closed_won",
    "timestamp": "2026-04-22T10:00:00Z",
    "accountId": "<id from seed data>",
    "data": {
      "dealName": "Acme Enterprise",
      "amount": 150000,
      "dealStage": "closedwon"
    }
  }'

# Test NPS submission (promoter)
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "nps.submitted",
    "timestamp": "2026-04-22T10:00:00Z",
    "accountId": "<id>",
    "data": { "score": 9 }
  }'

# Test champion departure (should hard-block asks)
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "champion.departed",
    "timestamp": "2026-04-22T10:00:00Z",
    "accountId": "<id>",
    "data": {
      "championId": "<champion-id>",
      "reason": "Left company"
    }
  }'

# Health check
curl http://localhost:3001/health
```

Expected responses:
- `200` with `{ "processed": true, "actions": [...] }` for valid events
- `422` for unrecognized event types
- `400` for malformed JSON

---

## Testing with Your Real Data

### Backtest against historical data

Once sync is running with your real HubSpot/Fathom data:

```bash
# 1. Sync everything
bun run sync

# 2. Score all accounts
# Use MCP Inspector or call via API:
referral_scorer_score_portfolio {}

# 3. Compare scores against actual referral outcomes
# Accounts that actually produced referrals should score higher.
# Check:
#   - Did your known referrers land in Hot tier?
#   - Did accounts with support issues land in Not Yet?
#   - Did the anti-triggers correctly block at-risk accounts?

# 4. Run PCP analysis against real revenue
pcp_analyze_distribution {}
# Compare: do your top accounts match the power-law tier?

# 5. Full analysis on your best account
orchestrator_run_full_analysis { "accountId": "<your-best-account-id>" }
# Does the executive summary match your intuition?
```

### Validate survey referral parsing

Your survey column ("If you enjoyed the work we did together, do you know 2-3 peers...") gets parsed automatically. To verify:

```bash
# Dry run sheets sync — check the output for parsed referrals
DRY_RUN=1 bun run sync:sheets
```

Look for:
- Correct name extraction from free-text responses
- Email addresses parsed correctly
- Company names detected
- Connection maps created with score 8/10

### Validate Fathom signal extraction

```bash
DRY_RUN=1 bun run sync:fathom
```

Check that:
- QBR calls are detected by title keywords
- Positive sentiment → `strong` relationship strength
- Training calls → `active_engagement` triggers
- Negative sentiment → anti-trigger events
- Unmatched participant emails are reported (these are people not yet in your champions table)

---

## Troubleshooting

### Tests fail on import

```bash
bun run typecheck   # Check for type errors first
bun install         # Make sure dependencies are installed
```

### Sync says "no token" or "API key not set"

Check your `.env` file has the right variable names:
```
HUBSPOT_ACCESS_TOKEN=pat-na1-...    # Not HUBSPOT_API_KEY
FATHOM_API_KEY=...
GOOGLE_SHEETS_API_KEY=...
```

### Sync connects but returns 0 records

- **HubSpot:** Check that your private app has scopes for `crm.objects.companies.read`, `crm.objects.contacts.read`, `crm.objects.deals.read`
- **Fathom:** Check that the API key has read access to call recordings
- **Sheets:** Check that the spreadsheet is shared with the API key's service account, or use a public sheet with an API key

### Database connection fails

```bash
# If using local Supabase
npx supabase status    # Check it's running
npx supabase start     # Start if not

# If using remote, test the connection string
psql $DATABASE_URL -c "SELECT 1"
```

### Webhook returns 503

The server needs `deps` passed to the HTTP transport. Make sure you started with:
```bash
MCP_TRANSPORT=streamable_http bun run dev
```
Not just running the HTTP transport directly.

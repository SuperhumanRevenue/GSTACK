# Referral System — User Guide

## Quick Start

```bash
# 1. Install
cd referral-system
bun install

# 2. Database setup
npx supabase start                # Local PostgreSQL (or set DATABASE_URL to remote)
bun run db:push                   # Sync schema to database
bun run db:seed                   # Load demo data (10 accounts, 20 champions)

# 3. Configure
cp .env.example .env              # Edit with your API keys (see Environment section below)

# 4. Start the server
bun run dev                       # stdio transport (default, for MCP Inspector / Claude)

# 5. Sync your data
bun run sync                      # Pull from HubSpot + Fathom + Google Sheets
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |

### CRM (HubSpot)

| Variable | Description |
|----------|-------------|
| `CRM_PROVIDER` | `hubspot` (default) or `salesforce` |
| `HUBSPOT_ACCESS_TOKEN` | HubSpot private app token |

### Conversation Intelligence (Fathom)

| Variable | Description |
|----------|-------------|
| `FATHOM_API_KEY` | Fathom API key for call transcript sync |

### Google Sheets (Surveys + Referral Tracking)

| Variable | Description |
|----------|-------------|
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API key |
| `SURVEY_SPREADSHEET_ID` | Spreadsheet ID for survey responses |
| `REFERRAL_SPREADSHEET_ID` | Spreadsheet ID for referral tracking sheet |

### LLM (for Signal Guides + Executive Summaries)

| Variable | Description |
|----------|-------------|
| `ENABLE_LLM` | `true` to enable |
| `LLM_PROVIDER` | `anthropic` (default), `openai`, or `gemini` |
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GEMINI_API_KEY` | Google Gemini API key |

### Web Search (for Portfolio Mapper + Signal Guide)

| Variable | Description |
|----------|-------------|
| `ENABLE_WEB_SEARCH` | `true` to enable |
| `EXA_API_KEY` | Exa search API key |

### Enrichment

| Variable | Description |
|----------|-------------|
| `ENABLE_ENRICHMENT` | `true` to enable |
| `ENRICHMENT_PROVIDER` | `apollo` (default) or `clearbit` |
| `APOLLO_API_KEY` | Apollo API key |
| `PHANTOMBUSTER_API_KEY` | PhantomBuster API key (LinkedIn enrichment overlay) |
| `PHANTOMBUSTER_PROFILE_AGENT_ID` | PhantomBuster profile scrape agent |

### Notifications

| Variable | Description |
|----------|-------------|
| `ENABLE_SLACK_NOTIFICATIONS` | `true` to enable |
| `SLACK_BOT_TOKEN` | Slack bot token |
| `SLACK_REFERRAL_CHANNEL` | Channel for referral updates |
| `SLACK_APPROVAL_CHANNEL` | Channel for approval requests |

### Scoring Thresholds (all have sensible defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `READINESS_HOT_THRESHOLD` | 80 | Score ≥ this = Hot tier |
| `READINESS_WARM_THRESHOLD` | 55 | Score ≥ this = Warm tier |
| `SUPER_REFERRER_PLATINUM_THRESHOLD` | 80 | Platinum super-referrer tier |
| `SUPER_REFERRER_GOLD_THRESHOLD` | 60 | Gold tier |
| `SUPER_REFERRER_SILVER_THRESHOLD` | 40 | Silver tier |
| `MAX_FOLLOW_UPS` | 2 | Max follow-ups per referral ask |
| `ASK_COOLDOWN_DAYS` | 90 | Days between asks to same champion |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | HTTP port (streamable_http mode) |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `streamable_http` |
| `REDIS_URL` | — | Optional Redis for caching |

---

## Commands

```bash
# Server
bun run dev                    # Start MCP server (stdio)
bun run build                  # TypeScript compile

# Database
bun run db:generate            # Generate migrations from schema changes
bun run db:migrate             # Run migrations
bun run db:push                # Quick-sync schema to DB (dev)
bun run db:seed                # Load demo data
bun run db:studio              # Open Drizzle Studio (DB browser)

# Data Sync
bun run sync                   # Sync all sources (HubSpot + Fathom + Sheets)
bun run sync:hubspot           # HubSpot only
bun run sync:fathom            # Fathom only
bun run sync:sheets            # Google Sheets only
DRY_RUN=1 bun run sync        # Preview what would sync (no DB writes)

# Testing
bun run test                   # Run all tests
bun run test:watch             # Watch mode
bun run typecheck              # Type-check only
```

---

## Data Sync

The sync layer pulls your real data into the referral system database. Run it on a schedule or manually before analysis.

### What Gets Synced

| Source | What it pulls | What it creates |
|--------|--------------|-----------------|
| **HubSpot** | Companies, contacts, deals | Accounts, champions, trigger events |
| **Fathom** | Call transcripts + sentiment | Relationship signals, champion strength updates |
| **Google Sheets** | Survey responses, referral tracking | Connection maps, referrals, NPS triggers |

### HubSpot Sync

Maps HubSpot objects to the referral database:
- **Companies → accounts** (upserts by CRM account ID)
- **Contacts → champions** (upserts by email, infers seniority from title)
- **Deals → trigger events** (closed-won deals become expansion triggers)

Seniority inference: CEO/CTO/CFO/COO → `c_suite`, VP → `vp`, Director/Head of → `director`, else → `manager`

Relationship strength: Last activity <30 days → `strong`, <90 days → `warm`, else → `cold`

### Fathom Sync

Parses call transcripts for relationship signals:
- **QBR calls** → `qbr_success` or negative anti-trigger
- **Renewal/expansion discussions** → `renewal_discussion` trigger
- **Case study mentions** → `case_study_willingness` trigger
- **Training/enablement** → `active_engagement` trigger
- **Negative sentiment** → `support_escalation` anti-trigger
- **NPS/satisfaction mentions** → `nps_high` trigger

Also updates champion `relationshipStrength` and `lastInteractionDate` based on call recency and sentiment.

### Google Sheets Sync

Two sheet types:

**1. Survey Responses** (from your Google Form)
- Parses the referral column: *"If you enjoyed the work we did together, do you know 2-3 peers, former colleagues or friends that would benefit from AI adoption..."*
- Extracts names, emails, companies from free-text responses
- Creates connection map entries (score: 8/10 — survey referrals are warm by definition)
- Creates NPS trigger events from score column

**2. Referral Tracking Sheet**
- Reads source company/contact → target company/contact mappings
- Creates connection maps (score: 9/10 — explicit referrals)
- Creates referral records with status mapping

---

## The 10 Agents & 41 MCP Tools

### 1. Readiness Scorer — *"Which accounts are ready for a referral ask?"*

| Tool | Description |
|------|-------------|
| `referral_scorer_score_account` | Score one account on 5 dimensions (100-point scale) |
| `referral_scorer_score_portfolio` | Score all accounts, returns tiered priority list |
| `referral_scorer_detect_triggers` | Scan for new trigger events across platforms |
| `referral_scorer_get_readiness_history` | Historical score progression for an account |

**Scoring model (100 points):**
- Value Delivered (25 pts) — CS health, NPS, usage
- Relationship Strength (20 pts) — Champion seniority, interaction recency
- Recency of Win (20 pts) — Recent expansions, closed deals
- Network Value (20 pts) — Network reach, former companies
- Ask History (15 pts) — Prior asks, response rates, cooldown

**Tiers:** Hot (≥80) → Warm (55-79) → Not Yet (<55)

**Anti-triggers hard-block all asks:** support escalation, usage declining >20%, champion departed, churn risk.

### 2. Relationship Mapper — *"Who can introduce us?"*

| Tool | Description |
|------|-------------|
| `referral_mapper_map_champion_network` | Map champion's network against ICP + target accounts |
| `referral_mapper_find_warm_paths` | Find all warm intro paths to a specific target company |
| `referral_mapper_enrich_champion` | Enrich champion profile with network data |

### 3. Ask Architect — *"What exactly should we say?"*

| Tool | Description |
|------|-------------|
| `referral_ask_compose` | Generate 3 ask versions: live script, async message, soft seed |
| `referral_ask_handle_response` | Route response: Yes → intro template, Maybe → follow-up, No → graceful close |
| `referral_ask_get_templates` | Get ask templates filtered by ACV/industry/trigger |

Three versions per ask:
- **Live** — Phone/meeting script
- **Async** — Email/Slack message
- **Soft Seed** — Casual mention to plant the idea

### 4. Program Manager — *"Track everything, report on performance"*

| Tool | Description |
|------|-------------|
| `referral_pm_create_referral` | Create a referral record in the ledger |
| `referral_pm_update_referral` | Update status (ask_pending → intro_sent → meeting_booked → closed_won) |
| `referral_pm_score_super_referrers` | Calculate super-referrer scores and tiers |
| `referral_pm_score_target` | Score a referral target on 5 dimensions |
| `referral_pm_generate_report` | Generate monthly health or leadership summary |
| `referral_pm_get_leaderboard` | Super-referrer leaderboard |
| `referral_pm_get_company_scoreboard` | Referral performance by account |
| `referral_pm_recalibrate_model` | Re-tune scoring weights from outcome data (requires 50+ completed referrals) |

**Referral lifecycle:** `ask_pending` → `ask_sent` → `intro_pending` → `intro_sent` → `meeting_booked` → `opportunity_created` → `closed_won` / `closed_lost`

### 5. Incentive Designer — *"What should we offer champions?"*

| Tool | Description |
|------|-------------|
| `referral_incentive_design_package` | Personalized incentive for a specific champion |
| `referral_incentive_design_program` | Company-wide referral program design with budget + ROI |
| `referral_incentive_evaluate` | Check if a proposed reward is within budget constraints |
| `referral_incentive_get_industry_norms` | Industry benchmarks for referral incentives |

Reward ceiling = 30% of outbound CAC. Never uses words like "commission" or "payment."

### 6. Signal Guide Engine — *"What buying signals should we watch for?"*

| Tool | Description |
|------|-------------|
| `signal_guide_ingest_customer` | Ingest positioning, messaging, case studies, packaging |
| `signal_guide_research_market` | Web search for competitors, trends, tech landscape |
| `signal_guide_generate` | LLM-powered custom signal guide from 100-signal master library |
| `signal_guide_get_guide` | Retrieve generated guide with filtering |

### 7. PCP Builder — *"Which accounts are our power-law winners?"*

| Tool | Description |
|------|-------------|
| `pcp_ingest_revenue` | Bulk-load revenue snapshots |
| `pcp_analyze_distribution` | Power-law analysis: Gini coefficient, tier assignment |
| `pcp_score_target` | Score prospect against empirical ICP weights |
| `pcp_get_analysis` | Retrieve analysis with tier breakdown |

**Tiers:** Power Law (top 3%, ~35% revenue) → High Value (next 7%) → Core (next 40%) → Long Tail (bottom 50%)

### 8. Success Tracker — *"How is the referral pipeline performing?"*

| Tool | Description |
|------|-------------|
| `success_pipeline_health` | Health dashboard for all active referral deals |
| `success_stalled_alerts` | Identify stalled deals needing intervention |
| `success_cohort_analysis` | Referral vs outbound: win rates, velocity, deal size |
| `success_score_deal` | Score health of a specific deal |
| `success_velocity_report` | Stage-by-stage conversion rates and timing |

### 9. Portfolio Mapper — *"What corporate relationships can we leverage?"*

| Tool | Description |
|------|-------------|
| `portfolio_map_company` | Discover investors, parent companies, subsidiaries |
| `portfolio_find_opportunities` | Find second-order referral paths (customer → shared investor → target) |
| `portfolio_get_maps` | View portfolio groupings and customer overlap |
| `portfolio_get_opportunities` | Retrieve saved opportunities with status filtering |

### 10. Orchestrator — *"Run the whole thing at once"*

| Tool | Description |
|------|-------------|
| `orchestrator_run_full_analysis` | Full 5-phase analysis with cross-agent wiring |
| `orchestrator_quick_health` | Fast health check: readiness + deal health + top action |

The full analysis chains all agents in 5 phases:
1. **Data gathering** — Load account, champions, triggers, referrals
2. **Readiness scoring** — Score with PCP boost applied
3. **Relationship mapping** — Network analysis + warm paths
4. **Success dashboard** — Deal health + pipeline velocity
5. **Executive summary** — LLM-generated briefing (if enabled)

---

## Webhook Integration

For real-time CRM event processing, point your CRM webhooks at:

```
POST http://your-server:3001/webhook
```

Requires `MCP_TRANSPORT=streamable_http`.

### Supported Events

| Event Type | What Happens |
|------------|-------------|
| `deal.closed_won` | Records expansion trigger, re-scores champions |
| `deal.closed_lost` | Records anti-trigger |
| `deal.stage_changed` | Records pipeline progression |
| `nps.submitted` | Updates account NPS, triggers on score ≥ 9 |
| `champion.departed` | Marks champion departed, hard-blocks referral asks |
| `champion.promoted` | Updates title/seniority, records trigger |
| `expansion.closed` | Records expansion trigger |
| `support.escalation` | Flags escalation active, pauses asks |
| `qbr.completed` | Records QBR outcome |
| `usage.alert` | Updates usage trend, flags churn risk if declining |

### Webhook Payload

```json
{
  "type": "deal.closed_won",
  "timestamp": "2026-04-03T10:00:00Z",
  "accountId": "uuid-here",
  "data": {
    "dealName": "Acme Enterprise",
    "amount": 150000,
    "dealStage": "closedwon"
  }
}
```

---

## Typical Workflows

### Weekly Pipeline Review

```
1. bun run sync                              # Pull latest data
2. orchestrator_run_full_analysis             # Full intelligence report
3. referral_pm_generate_report type=monthly   # Monthly health report
4. success_stalled_alerts                     # Check for stuck deals
```

### Preparing a Referral Ask

```
1. referral_scorer_score_account {account_id}    # Check readiness
2. referral_mapper_map_champion_network {id}     # Find best intro paths
3. referral_ask_compose {champion_id, target}    # Generate 3 ask versions
4. referral_pm_create_referral {...}             # Log to ledger
5. [Human reviews and sends the ask]
6. referral_ask_handle_response {yes/maybe/no}   # Get response playbook
7. referral_pm_update_referral {status}           # Track progression
```

### Quarterly Business Review

```
1. bun run sync                                        # Fresh data
2. pcp_analyze_distribution                            # Power-law tiers
3. referral_pm_score_super_referrers                   # Champion rankings
4. referral_pm_generate_report type=leadership_summary # Executive deck
5. success_cohort_analysis                             # Referral vs outbound
6. referral_pm_recalibrate_model                       # Tune scoring weights
```

### New Customer Onboarding

```
1. [Account created in HubSpot]
2. bun run sync:hubspot                          # Sync new account
3. referral_mapper_enrich_champion {id}          # Enrich their network
4. signal_guide_ingest_customer {context}        # Load their profile
5. signal_guide_generate {id}                    # Custom signal guide
6. referral_incentive_design_package {id}        # Design incentive
```

---

## Server Transports

### stdio (default — for development + MCP Inspector)

```bash
bun run dev
```

Use with MCP Inspector or any MCP client that spawns a subprocess.

### Streamable HTTP (for production + webhooks)

```bash
MCP_TRANSPORT=streamable_http bun run dev
```

Endpoints:
- `POST /mcp` — MCP protocol messages
- `GET /mcp` — SSE stream for responses
- `DELETE /mcp` — Session cleanup
- `GET /health` — Health check (returns version, uptime)
- `POST /webhook` — CRM webhook ingestion

---

## Testing

```bash
bun run test              # 292 tests across 20 files, ~4s
bun run test:watch        # Re-run on file changes
bun run typecheck         # Type-check without running tests
```

All scoring engines are pure functions tested without a database. Integration tests with a real DB are planned for Phase 2 of testing.

---

## Architecture Notes

- **No auto-send.** Every outgoing communication requires human approval. The system composes asks and templates but never sends them.
- **Anti-triggers are hard blocks.** If an account has an active support escalation, declining usage, or departed champion, the system refuses to generate referral asks.
- **Graceful degradation.** Missing API keys = that integration uses a stub. The system always runs; you just get less data.
- **Idempotent syncs.** Run `bun run sync` as often as you want. It upserts, never duplicates.
- **Cross-agent wiring.** The orchestrator automatically applies intelligence from one agent to another (PCP boosts readiness scores, deal health adjusts champion scores, etc.).

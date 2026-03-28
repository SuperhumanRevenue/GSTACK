# Referral Readiness Scorer

Score customer accounts for referral readiness using a 5-dimension model with anti-trigger safety gates.

## When to Use

- Before making any referral ask to a customer champion
- For weekly/monthly portfolio scoring to identify hot referral candidates
- To detect new trigger events (QBR success, NPS spike, usage growth) that open referral windows
- To track readiness progression over time

## MCP Tools

### `referral_scorer_score_account`
Score a single account for referral readiness.
- **Input:** `account_id` (required), `champion_id` (optional), `override_data` (optional)
- **Output:** 0-100 score, tier (Hot/Warm/Not Yet), 5-dimension breakdown, trigger event, anti-triggers, rationale, recommended action

### `referral_scorer_score_portfolio`
Score all accounts in a portfolio. Returns tiered priority list.
- **Input:** `account_ids` (optional — omit for all), `min_acv`, `industry` filters
- **Output:** Summary counts, Hot/Warm/Not Yet lists sorted by score

### `referral_scorer_detect_triggers`
Scan for new trigger events since last scan.
- **Input:** `since` (ISO date, default 7 days), `account_ids` (optional)
- **Output:** New positive triggers, new anti-triggers, score changes

### `referral_scorer_get_readiness_history`
Get historical readiness scores to show progression.
- **Input:** `account_id`, `period` (30d/90d/180d/1y)
- **Output:** Score history table, trend direction

## Scoring Model

| Dimension | Max Points | What It Measures |
|-----------|-----------|-----------------|
| Value Delivered | 25 | CS health, NPS, tenure, usage trend |
| Relationship Strength | 20 | Champion seniority, exec sponsor, recency of interaction |
| Recency of Win | 20 | QBR outcome, recent positive triggers |
| Network Value | 20 | Network reach, former companies, communities |
| Ask History | 15 | Clean ask history (no recent declines) |

## Anti-Triggers (Hard Blocks)

These conditions force an account to "Not Yet" regardless of score:
- Support escalation active
- Usage declining 20%+
- Champion departed
- Churn risk active

## Tiers

| Tier | Score Range | Meaning |
|------|------------|---------|
| Hot | 80-100 | Ready for referral ask now |
| Warm | 55-79 | Nurture and monitor for triggers |
| Not Yet | 0-54 | Focus on value delivery |

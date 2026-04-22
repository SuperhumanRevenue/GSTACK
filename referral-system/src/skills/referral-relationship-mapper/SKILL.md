# Referral Relationship Mapper

Map champion professional networks against ICP and target accounts to find warm introduction paths.

## When to Use

- After a champion scores "Hot" on readiness — find who they can introduce you to
- When you have a specific target account and need a warm path in
- To enrich champion profiles with network data from enrichment APIs

## MCP Tools (Phase 2)

### `referral_mapper_map_champion_network`
Map a champion's professional network against ICP and target accounts.
- **Input:** `champion_id`, `target_account_ids` (optional), `icp_criteria`, `max_results`
- **Output:** High/moderate value intros, network gaps, reverse referral opportunities

### `referral_mapper_find_warm_paths`
Find all warm introduction paths to a specific target account.
- **Input:** `target_company`, `target_contact` (optional), `target_title` (optional)
- **Output:** Ranked paths through existing customers, best path, existing relationships

### `referral_mapper_enrich_champion`
Enrich a champion's profile with network data from enrichment APIs.
- **Input:** `champion_id`, `linkedin_url` (optional)
- **Output:** Network reach score, former companies, communities, ICP connections

## Connection Scoring (5 Factors, 1-10 each)

| Factor | What It Measures |
|--------|-----------------|
| Connection Strength | How well they actually know each other |
| Target Account Priority | How much we want this account |
| Role Match | Does the champion know the right buyer? |
| Pain Alignment | Does target have the pain we solve? |
| Timing Signal | Is there buying intent right now? |

# Referral Ask Architect

Compose hyper-specific referral asks in three versions with response branching.

## When to Use

- When a champion is ready (Hot tier) and you've mapped their network
- To generate the actual ask content (live script, async message, or soft seed)
- To handle champion responses (yes/maybe/no) with appropriate follow-up

## MCP Tools (Phase 3)

### `referral_ask_compose`
Generate a referral ask in three versions tailored to the champion, value moment, and target.
- **Input:** `champion_id`, `connection_map_id`, `trigger_event`, `results_to_reference`, `acv_range`, `champion_communication_style`
- **Output:** Recommended version + all 3 versions (live/async/soft seed) with key mechanics

### `referral_ask_handle_response`
Generate follow-up based on champion's response.
- **Input:** `referral_id`, `response` (yes/maybe/no), `context`
- **Output:** Response-specific assets (intro templates, follow-ups, or graceful close)

### `referral_ask_get_templates`
Retrieve ask templates filtered by ACV range, industry, and trigger type.

## Three Ask Versions

| Version | When to Use | Format |
|---------|------------|--------|
| Live | QBR, meeting, call — champion is engaged in real-time | Spoken script |
| Async | Email, Slack — champion not in a live conversation | Written message (<100 words) |
| Soft Seed | Not quite ready for a direct ask — plant the idea | Casual mention |

## Response Routing

| Response | Action |
|----------|--------|
| Yes | Intro email template + AE first response + champion thank-you |
| Maybe | Day 5 follow-up + Day 12 final nudge + pre-drafted intro (friction remover) |
| No | Graceful close + alternative ask (case study) |

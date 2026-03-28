# Referral Program Manager

Master referral ledger, super-referrer identification, reports, and model recalibration.

## When to Use

- To create and track referrals through the pipeline
- To identify and tier super-referrers
- To generate program health reports for leadership
- To recalibrate the scoring model based on actual outcomes

## MCP Tools (Phase 3-4)

### `referral_pm_create_referral`
Create a new referral record in the ledger.

### `referral_pm_update_referral`
Update a referral's status as it progresses (ask_sent → intro_sent → meeting_booked → closed_won).

### `referral_pm_score_super_referrers`
Recalculate super-referrer scores and tier assignments.

### `referral_pm_score_target`
Score an incoming referral target for pipeline prioritization.

### `referral_pm_generate_report`
Generate program health reports (monthly, quarterly, leadership summary, recalibration).

### `referral_pm_get_leaderboard`
Get the super-referrer leaderboard with rankings and stats.

### `referral_pm_get_company_scoreboard`
Get company-level referral aggregation and scoring.

### `referral_pm_recalibrate_model`
Analyze referral outcomes and recommend scoring model adjustments.

## Super-Referrer Tiers

| Tier | Score | Criteria |
|------|-------|---------|
| Platinum | 80+ | High volume, high quality, substantial revenue |
| Gold | 60-79 | Consistent referrals with good conversion |
| Silver | 40-59 | Active but developing |
| Bronze | <40 | Early or infrequent referrers |

# Readiness Scoring Model Reference

## 5-Dimension Breakdown

### Value Delivered (0-25 pts)
- CS Health Score: 0-8 pts (linear from 0-100)
- NPS Score: 0-7 pts (9+ = 7, 7-8 = 5, 5-6 = 2)
- Tenure: 0-5 pts (24mo+ = 5, 12-23 = 3, 6-11 = 1)
- Usage Trend: 0-5 pts (growing = 5, stable = 3)

### Relationship Strength (0-20 pts)
- Relationship: 0-8 pts (strong = 8, warm = 5, cold = 1)
- Exec Sponsor: 0-4 pts (yes = 4)
- Seniority: 0-4 pts (C-suite = 4, VP = 3, Dir = 2, Mgr = 1)
- Interaction Recency: 0-4 pts (14d = 4, 30d = 3, 60d = 2, 90d = 1)

### Recency of Win (0-20 pts)
- QBR Outcome: 0-12 pts (positive + recent = 12)
- Recent Positive Triggers: 0-8 pts (2pts each, max 4)

### Network Value (0-20 pts)
- Network Reach Score: 0-8 pts (from enrichment)
- Former Companies: 0-4 pts (1 per company)
- Industry Communities: 0-4 pts (2 per community)
- Seniority Amplifier: 0-4 pts

### Ask History (0-15 pts)
- Starts at 15, deductions:
  - Recent "no": -5
  - Recent "no response": -3
  - Past "closed_won": +2

## ACV Adjustments
- 30k-75k: Standard weights
- 75k-250k: Relationship Strength x1.2
- 250k+: Network Value x1.25
- $1M+: Requires human override

## Anti-Trigger Penalties
- Hard blocks (force Not Yet): support escalation, declining usage, departed champion, churn risk
- Point penalties: recent explicit no (-15), no response (-10), competitor eval (-10), missed renewal (-8)

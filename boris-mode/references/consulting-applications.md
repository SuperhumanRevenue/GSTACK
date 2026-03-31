# Boris Mode for AI Transformation Consulting

How to apply 100x builder patterns to your consulting practice — from constraint
discovery through client deliverables.

-----

## Parallel Execution for Client Sprints

### The Sprint Build Pattern

When running a client sprint, you're typically building multiple workstreams
simultaneously. Apply Boris's parallel pattern:

```
Worktree 1: Constraint analysis dashboard (React app)
Worktree 2: Integration scaffolding (MCP server / API connectors)
Worktree 3: Training materials (docs, slides, prompt libraries)
Worktree 4: Client-specific CLAUDE.md + skills
Worktree 5: Testing & verification
```

Each worktree runs its own Claude session. You coordinate across them
as the "attention allocator" — checking in when notifications fire,
reviewing outputs, and redirecting.

### Pre-Engagement Discovery Automation

Turn your constraint-discovery workflow into a `/loop`:

```bash
# Before a prospect call, auto-generate the intelligence brief
/loop 1h scan-prospect-filings
```

Build this as a custom agent in `.claude/agents/`:

```markdown
# .claude/agents/prospect-scanner.md
---
name: prospect-scanner
description: Pre-engagement constraint discovery from public filings
color: orange
tools: Read, Search, Bash, WebFetch
---
You analyze public filings (10-K, 10-Q, earnings transcripts) for a target company.
Extract operational constraints using the five-layer extraction framework:
1. Explicit pain statements
2. Efficiency ratio anomalies
3. Headcount vs. revenue scaling gaps
4. Technology debt signals
5. Competitive positioning friction

Output a pre-call battlecard with:
- Top 3 binding constraints by department
- Supporting evidence with source citations
- Suggested discovery questions for each constraint
- Estimated AI automation opportunity (time savings + error reduction)
```

### Client Deliverable Pipeline

Apply Boris's verification principle to every client deliverable:

|Deliverable     |Verification Method                                             |
|----------------|----------------------------------------------------------------|
|React dashboards|Chrome extension — Claude tests in browser                      |
|MCP servers     |Automated test suite + live connection test                     |
|Prompt libraries|Run each prompt, verify output quality                          |
|Training docs   |Generate, then have a second Claude review as the target persona|
|Spreadsheets    |Execute formulas, spot-check calculations                       |

### Skills as Productized IP

Your reusable skills ARE your consulting IP. Structure them as:

```
.claude/skills/
├── constraint-discovery/      # Pre-engagement intelligence
├── sprint-framework/          # V2 transformation methodology
├── training-generator/        # Dynamic training module builder
├── prompt-library-builder/    # Post-workshop personalized prompts
├── release-scanner/           # Anthropic release monitoring
└── board-review/              # Bootstrapped founder advisory sim
```

Each skill you build for a client engagement becomes a reusable asset.
The `/batch` command lets you adapt a skill across multiple client contexts
in parallel.

-----

## The Constraint-to-Automation Pipeline

Boris's workflow maps directly to your methodology:

|Boris Pattern                         |Your Application                                             |
|--------------------------------------|-------------------------------------------------------------|
|Identify the constraint (what's slow?)|Constraint discovery framework                               |
|Give Claude a verification loop       |Build the feedback mechanism into every AI solution          |
|Compound learnings in CLAUDE.md       |Capture client-specific patterns for future engagements      |
|Parallelize execution                 |Run multiple sprint workstreams simultaneously               |
|Automate the recurring                |Turn sprint outputs into self-sustaining loops for the client|

### Client Handoff Pattern

When a sprint ends, the client should have:

1. A project-level `CLAUDE.md` with their conventions baked in
1. Custom agents in `.claude/agents/` for their recurring workflows
1. Slash commands for their most common tasks
1. Pre-allowed permissions in `.claude/settings.json`
1. At least one `/loop` running autonomously

This is the "Agent OS" layer of your offer stack — the thing that keeps
producing value after you leave.

-----

## HubSpot + Claude Code Integration

Use Claude Code's MCP support to connect your sales pipeline:

```bash
# .mcp.json — add HubSpot MCP alongside Slack
{
  "mcpServers": {
    "slack": { "type": "http", "url": "https://slack.mcp.anthropic.com/mcp" },
    "hubspot": { "type": "http", "url": "https://mcp.hubspot.com/anthropic" }
  }
}
```

Then automate:

- `/loop 1h check-hubspot-deals` — surface deals moving through your 4-stage pipeline
- Custom agent: "Before every discovery call, pull the prospect's HubSpot record + recent activity"
- Post-sprint: auto-log deliverables and outcomes back to HubSpot

-----

## Voice-First Building

Boris does most of his coding by voice. For consulting contexts this is even
more powerful — you can dictate specifications and requirements while reviewing
client materials, essentially "thinking out loud" into the build.

Enable: `/voice` in CLI, or hold spacebar. On mobile, enable iOS dictation.
In Desktop app, use the microphone button.

You speak 3x faster than you type. Your prompts get dramatically more detailed.

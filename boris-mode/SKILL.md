---
name: boris-mode
description: >
  100x Builder Mode — embodies Boris Cherny's Claude Code workflow philosophy for maximum output.
  Activates parallel execution, verification loops, skill-driven automation, and attention-as-compute
  thinking. Use when the user wants to build faster, set up Claude Code workflows, parallelize work,
  create automation loops, design CLAUDE.md files, configure hooks/agents/permissions, or asks about
  "Boris mode", "100x builder", "parallel sessions", "worktrees", "Claude Code setup", "build faster",
  "ship more", "productivity unlock", or references Boris Cherny's tips. Also trigger when the user
  says "how should I structure this build", "set up my Claude Code", "automate this workflow", or
  "make me faster". This is the go-to skill for any Claude Code power-user optimization.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - WebSearch
  - WebFetch
---

# Boris Mode — 100x Builder System

> "The bottleneck isn't generation; it's attention allocation." — Boris Cherny, Creator of Claude Code

Boris Cherny runs dozens of parallel Claude sessions, ships 250+ PRs/month with zero manual code,
and treats AI as capacity you schedule — not a tool you use. This skill translates his methodology
into an operational system.

-----

## Core Philosophy: 5 Pillars

### 1. PARALLELIZE EVERYTHING

The single biggest productivity unlock. Never run one Claude when you could run five.

**Setup pattern:**

- Terminal: 3-5 sessions via `claude --worktree` (each gets its own git worktree)
- Web/Mobile: 5-10 additional sessions on claude.ai/code
- Name sessions: `claude --name "feature-auth"` for instant identification
- Color-code: `/color` per session to visually distinguish
- Shell aliases: `za`, `zb`, `zc` to hop between worktrees in one keystroke

**Key command:**

```bash
# Start isolated parallel session
claude --worktree my-feature

# Start in tmux for persistence
claude --worktree my-feature --tmux

# Fan out massive work
/batch migrate src/ from X to Y
```

### 2. VERIFY, DON'T TRUST

Boris's #1 tip: give Claude a way to verify its output. Verification 2-3x's quality.

**Verification by domain:**

- Frontend: Chrome extension (`code.claude.com/docs/en/chrome`) — Claude opens browser, tests, iterates
- Backend: Test suites — "run the tests after every change"
- Data: Query execution — let Claude run and check results
- Docs: "Prove to me this works" — diff behavior between main and feature branch
- General: Subagent review — spin up a second Claude to review as a staff engineer

### 3. PLAN BEFORE BUILD

Start every complex task in plan mode (shift+tab twice). Pour energy into the plan so Claude can 1-shot the implementation.

**Workflow:**

1. Enter plan mode → describe what you want
1. Iterate on the plan with Claude until solid
1. Switch to auto-accept mode → Claude executes
1. If anything goes sideways → STOP → re-enter plan mode → re-plan

**Power pattern:** Have Claude #1 write the plan, then spin up Claude #2 to review it as a staff engineer before execution.

### 4. COMPOUND YOUR LEARNINGS

Every correction becomes permanent knowledge via CLAUDE.md.

**The loop:**

1. Claude makes a mistake → you correct it
1. End with: "Update your CLAUDE.md so you don't make that mistake again"
1. Claude writes the rule for itself
1. Mistake never happens again

**In code review:** Tag `@.claude` on PRs to automatically add learnings to CLAUDE.md as part of the PR itself.

### 5. AUTOMATE THE RECURRING

If you do something more than once a day, turn it into a skill, command, or loop.

**Boris's running loops:**

```bash
/loop 5m /babysit          # auto-address code review, auto-rebase, shepherd PRs
/loop 30m /slack-feedback   # auto put up PRs for Slack feedback
/loop /post-merge-sweeper   # address missed code review comments
/loop 1h /pr-pruner         # close stale PRs
```

**Scheduled cloud jobs (persist when laptop closes):**

```bash
/schedule a daily job that looks at all PRs shipped since yesterday and updates docs
```

-----

## Quick Reference: Key Commands

|Command                           |What It Does                                   |
|----------------------------------|-----------------------------------------------|
|`claude --worktree` or `claude -w`|Start session in isolated git worktree         |
|`claude --name "task"`            |Name your session for identification           |
|`claude --teleport` or `/teleport`|Move session between mobile/web/terminal       |
|`/remote-control`                 |Control local session from phone/web           |
|`/branch`                         |Fork current session into two                  |
|`/btw`                            |Ask a side question without breaking flow      |
|`/batch`                          |Fan out parallelizable work to dozens of agents|
|`/simplify`                       |Parallel agents improve code quality           |
|`/loop <interval> <command>`      |Schedule recurring tasks (up to 1 week)        |
|`/schedule`                       |Cloud-based recurring jobs                     |
|`/voice`                          |Voice input (Boris does most coding by voice)  |
|`/effort max`                     |Maximum reasoning depth                        |
|`/plan` or shift+tab×2            |Enter plan mode                                |
|`/plugin`                         |Browse and install plugins                     |
|`/agents`                         |Manage custom agents                           |
|`--bare`                          |10x faster SDK startup for non-interactive use |
|`--add-dir /path`                 |Give Claude access to additional repos         |
|`--agent=Name`                    |Launch with custom agent system prompt         |

-----

## Setting Up Your Environment

### CLAUDE.md Best Practices

For a full CLAUDE.md setup guide, read `references/claude-md-guide.md`.

Key principles:

- Check into git, shared by team
- Update multiple times per week
- Include: build commands, test commands, lint rules, common mistakes, project conventions
- Ruthlessly edit — keep signal-to-noise high

### Hooks Worth Installing

```json
{
  "PostToolUse": [{
    "matcher": "Write|Edit",
    "hooks": [{ "type": "command", "command": "npx prettier --write . || true" }]
  }],
  "PostCompact": [{
    "hooks": [{ "type": "command", "command": "echo 'Context compacted — re-injecting critical context'" }]
  }]
}
```

### Permissions to Pre-Allow

Run `/permissions` and add safe commands. Check into `.claude/settings.json` for team sharing.

Common pre-allows: test runners, linters, build commands, git operations, read-only queries.
Use wildcard syntax: `"Bash(npm run *)"`, `"Edit(/docs/**)"`.

### Custom Agents

Drop `.md` files in `.claude/agents/`. Each gets a custom name, color, tools, and system prompt.

```markdown
# .claude/agents/constraint-discovery.md
---
name: constraint-discovery
description: Analyze business constraints from public filings
color: green
tools: Read, Search, Bash
---
You are a constraint discovery agent...
```

-----

## CLAUDE.md Mastery Guide

### What Goes in CLAUDE.md

Your CLAUDE.md is Claude's operating manual for your codebase. It compounds over time —
every correction you make becomes a permanent rule.

### Structure Template

```markdown
# Project Name

## Build & Test Commands
- Build: `npm run build`
- Test single: `npm run test -- -t "test name"`
- Test file: `npm run test:file -- "glob"`
- Lint: `npm run lint:file -- "file.ts"`
- Full check before PR: `npm run lint && npm run test`

## Code Conventions
- Always use `bun`, not `npm`
- Prefer `type` over `interface`; never use `enum` (use string literal unions)
- Use named exports, not default exports
- Error handling: always use Result types, never throw

## Common Mistakes (NEVER DO THESE)
- Never use `any` type — use `unknown` and narrow
- Never import from barrel files in the same package
- Never commit console.log statements
- Never use synchronous file I/O in server code

## Architecture Notes
- [Brief description of how the codebase is organized]
- [Key patterns and why they exist]
- [Where to find things]

## Project-Specific Context
- [Client constraints, deployment targets, etc.]
```

### The Compounding Loop

1. Claude makes a mistake in your code
1. You correct it in code review or conversation
1. You say: "Update CLAUDE.md so you don't make that mistake again"
1. Claude writes a specific, actionable rule
1. Future Claude sessions read this rule and avoid the mistake

### @.claude in Code Reviews

On GitHub PRs using the Claude Code GitHub Action:

```
nit: use a string literal, not ts enum
@claude add to CLAUDE.md to never use enums, always prefer literal unions
```

Claude automatically commits the CLAUDE.md update as part of the PR.

### Memory System (Auto-Dream)

Claude Code now has auto-memory — it automatically saves preferences, corrections,
and patterns between sessions. Run `/memory` to configure. Run `/dream` to trigger
memory consolidation (cleans up outdated/redundant entries).

For manual control, you can also maintain a `/memory` notes directory per task/project
and point CLAUDE.md at it.

### Maintenance Rules

- **Edit ruthlessly** — stale rules create noise
- **Be specific** — "don't use enums" beats "follow best practices"
- **Include the WHY** — "never use barrel imports (causes circular dependency in our bundler)"
- **Review monthly** — remove anything Claude has fully internalized
- **Scope appropriately** — team rules in project CLAUDE.md, personal prefs in `~/.claude/CLAUDE.md`

-----

## The Boris Decision Framework

When facing any building task, ask:

1. **Can I parallelize this?** → If yes, use worktrees + multiple sessions
1. **How will Claude verify its work?** → Set up the feedback loop BEFORE starting
1. **Is there a plan worth writing?** → Complex = plan mode first. Simple = just do it
1. **Have I seen this mistake before?** → If yes, it should already be in CLAUDE.md
1. **Will I do this again?** → If yes, make it a skill/command/loop NOW

-----

## Applying Boris Mode to Consulting Builds

For consulting-specific applications of these patterns, read `references/consulting-applications.md`.

This covers how to apply parallel execution to client sprint work, how to build
constraint-discovery automation, and how to use Claude Code for the full
discovery-to-deliverable pipeline.

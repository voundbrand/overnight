---
name: implementation-plan-builder
description: Build or update a complete repo-native implementation plan from product intent, research, PRDs, specs, or conversations. Use when the user asks to create an implementation plan, roadmap, task queue, launch-ready overnight slices, plan index, decision log, or self-contained plan package for autonomous agents.
---

# Implementation Plan Builder

Use this skill to create or upgrade a complete implementation-plan folder, not
just individual task rows. The output is Git-tracked Markdown plus optional
generated plan-site output. External trackers are not required.

## What This Skill Owns

This is the top-level planning workflow:

1. Choose or create the plan folder.
2. Create/update the core docs: `INDEX.md`, `MASTER_PLAN.md`, `TASK_QUEUE.md`,
   `DECISION_LOG.md`, PRD/architecture docs, and per-slice `OVERNIGHT_<ID>_*.md`
   briefs when rows need launch-ready detail.
3. Encode autonomous execution metadata: status, priority, owner, gates, blocked
   dependencies, owned files, validation, and human/live boundaries.
4. Add traceability from product intent to rows and from rows to verification.
5. Optionally build/update the human wiki with `implementation-plan-wiki`.

Use `prd-to-task-queue` for the detailed PRD-to-row breakdown once the plan
folder and planning shape are clear. Use `implementation-plan-wiki` only when the
user wants a browsable/generated plan site or the repo already has that gate.

## Required Reading

Read only the files needed for the target repo:

1. `AGENTS.md` / `CLAUDE.md` for repo-specific branch, PR, review, and queue rules.
2. `.claude/skills/overnight-agent-runbook/SKILL.md` for the row and autonomy
   contract.
3. Existing plan files under the target plan root, if any.
4. Source PRDs/specs/research/conversation notes supplied by the user.
5. `docs/quality-lenses.md` or the repo's equivalent when choosing test seams.

## Folder Shape

Default shape:

```text
implementation_plans/<plan-slug>/
├── INDEX.md
├── MASTER_PLAN.md
├── TASK_QUEUE.md
├── DECISION_LOG.md
├── PRD_<CAPABILITY>.md
└── OVERNIGHT_<ROW_ID>_<slug>.md
```

If the repo uses a different root, keep its convention. Common example:
`000_implementation_plans_all/<plan-slug>/`.

## Workflow

1. **Bind the destination.**
   - Pick the plan root and slug.
   - Reuse an existing plan folder when one clearly owns the product area.
   - If creating a new folder, keep names stable and lowercase where the repo
     convention allows.

2. **Create the narrative spine.**
   - `INDEX.md`: status, source docs, current priorities, quick links.
   - `MASTER_PLAN.md`: problem, goals, non-goals, phases, architecture summary,
     risks, release gates.
   - PRD/architecture docs: enough product and technical detail for rows to be
     independently understandable.
   - `DECISION_LOG.md`: accepted/proposed decisions with stable IDs when the plan
     needs binding decisions.

3. **Create the queue.**
   - Use the repo's existing table columns when present.
   - Otherwise use: `ID`, `Task`, `Status`, `Priority`, `Owner`, `Reference`,
     `Notes`.
   - Default new rows to `PENDING`, `unassigned`, and exactly one gate:
     `[GATE: offline]`, `[GATE: live]`, or `[GATE: human]`.
   - Put dependencies, `Writes:`, and `Verify:` in `Notes`.
   - Use `BLOCKED` only for a real named blocker, not for ordinary missing
     planning detail.

4. **Make rows agent-ready.**
   - A launch-ready offline row has a clear scope, owned files, validation, and
     governing decisions.
   - If the row is non-trivial and the queue notes are not self-sufficient, write
     an `OVERNIGHT_<ID>_<slug>.md` brief with scope, non-goals, acceptance
     criteria, context, writes, verify command, and blocked-stop condition.
   - Keep live/cloud/credential/spend/protected-branch/external-send work behind
     `[GATE: live]` or `[GATE: human]`.

5. **Add orchestration affordances when useful.**
   - If scheduled orchestration will watch the plan, add or document:
     `npm run plan:orchestrator:preflight -- --plans-root <root> --plan <slug>`.
   - The preflight state is scratch `.context` state. Canonical truth remains the
     queue, briefs, commits, branches, PRs, reviews, and validation artifacts.

6. **Validate.**
   - Always run `git diff --check`.
   - Run the repo's docs/plan guard if one exists.
   - If the plan site exists, run its check or the repo's documented equivalent.

## Quality Bar

A good implementation plan is useful to both humans and agents:

- A human can understand why the work exists and what is in/out.
- An agent can pick the next row without rereading the whole plan.
- Every offline row has a deterministic validation path.
- Every live/human row names the exact approval, credential, environment, or
  decision needed.
- No separate board, dispatcher, polling daemon, or required status file is
  introduced.

## Handoff Shape

Close with:

- Plan folder touched.
- Rows added/changed, grouped by gate.
- Launch-ready rows and their verify commands.
- Human/live blockers.
- Validation run.
- Orchestrator preflight command, if applicable.

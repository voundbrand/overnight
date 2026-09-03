---
name: agent-workflow-modernizer
description: Modernize an existing repo's agent workflow so AGENTS.md is the shared cross-harness contract, CLAUDE.md stays a small overlay, repeat procedures move into skills, normal work uses local verification, cloud sessions act as Git-clean workers, and final readiness keeps hosted review/CI gates. Use when asked to clean up AGENTS/CLAUDE files, port the Overnight workflow to another project, or prepare a repo for Codex plus Claude Code work.
---

# Agent Workflow Modernizer

Use this skill to retrofit a repository's agent instructions and vendored skills
to the Overnight workflow pattern:

- `AGENTS.md` is the shared contract for Codex, Claude Code, Cursor Agent,
  OpenCode, and other coding agents.
- `CLAUDE.md` is a small Claude-specific overlay that points back to `AGENTS.md`.
- Repeat procedures live in skills, not in the root instruction file.
- Hard enforcement lives in hooks, pre-push guards, or CI.
- Normal human-steered work uses bounded branches, focused local `Verify`, and
  draft PRs.
- Cloud sessions are disposable Linux workers that run from pushed Git and
  synthetic fixtures.
- Hosted CI/review/signals are certification gates for stable heads, not the
  default inner loop for every intermediate push.

## Before Editing

1. Inspect the target repo's current instruction files and skill directories:
   `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/skills/`, `.cursor/`,
   `.grok/`, `.opencode/`, `.conductor/`, and any local workflow docs.
2. Check Git state first. Preserve unrelated dirty files and do not overwrite a
   vendored skill that has local drift without reporting the drift.
3. Identify the repo's real base branch, PR surface, review tool, local verify
   commands, human gates, and any task queue/plan source of truth.
4. If the repo has product-specific safety rules, keep them in the repo's shared
   contract. Do not replace them with generic package details.

## Rewrite Shape

Keep root instruction files lean:

- Put always-on repo context, commands, architecture map, style conventions,
  human gates, and repeated agent mistakes in `AGENTS.md`.
- Put only Claude-specific behavior in `CLAUDE.md`, starting with a pointer back
  to `AGENTS.md`.
- Move detailed procedures into skills. If a procedure is copied into
  `.agents/skills/` and `.claude/skills/`, keep the copies byte-identical unless
  a harness truly needs different frontmatter.
- Move non-skippable rules into hooks, pre-push guards, CI, or branch
  protection. Instruction files are guidance, not enforcement.
- Delete stale branch names, deployment URLs, old worktree paths, old queue rows,
  local-only machine facts, and rules that are not specific and checkable.

## Operating Model To Install

Add or adapt these concepts in the target repo's `AGENTS.md` and workflow docs:

- **Normal mode**: local human-steered work uses bounded branches/worktrees,
  explicit write surfaces, focused local `Verify`, clean diffs, and draft PRs.
  It does not spend hosted review/signals on every intermediate push.
- **Cloud worker lanes**: cloud sessions run only slices that can start from
  pushed Git source plus synthetic fixtures. They push branch/PR closeouts and do
  not touch local dirty files, credentials, Docker Desktop, private-network
  services, staging, production, or merge gates.
- **Local controller**: the local machine/controller defines slice contracts,
  fetches cloud heads, runs local integration trains or local-only checks, and
  owns final certification and human gates.
- **Local integration train**: optional local-only branch/worktree for merging
  compatible verified heads and running a combined local suite before hosted CI.
  It is diagnostic only until pushed and certified.
- **Certification mode**: before landing or promoting a branch as a dependency,
  reconcile to the recorded parent, push the exact head, require hosted CI for
  that head/base, obtain exact-head review, run the repo's strict signal probe if
  it has one, and resolve/classify human feedback.
- **Unattended mode**: use one native goal/persistence loop if available. Do not
  wrap it in a second cron/polling/dispatcher loop.

## Files To Create Or Update

Prefer updating existing files over creating new ones. Typical outputs:

- `AGENTS.md`: shared contract and workflow.
- `CLAUDE.md`: short overlay pointing to `AGENTS.md`.
- `.agents/skills/overnight-agent-runbook/` and `.claude/skills/overnight-agent-runbook/`.
- `.agents/skills/pr-review-loop/` and `.claude/skills/pr-review-loop/`.
- Project workflow docs such as `docs/development.md`, `FLEET_EXECUTION.md`, or
  implementation-plan manifests.
- Optional `.conductor/settings.toml` changes only when the user asks for
  Conductor scripts/settings and the current repo pattern supports them.

Do not create a task queue, implementation plan, or PR stack unless the user
asked for one or the repo already uses that pattern.

## Reusable Prompt

Use `template/modernize-workflow-prompt.md` when handing this work to another
agent or another repository.

## Validation

Run the narrow checks the repo supports:

- Markdown or docs checks if present.
- `git diff --check`.
- Shell syntax checks for changed scripts.
- Byte-parity checks between mirrored `.agents` and `.claude` skill copies.
- Any project-specific plan-site or docs generator check if instruction files
  feed generated docs.

Close out with changed files, what moved to `AGENTS.md`, what stayed in
`CLAUDE.md`, which skills were mirrored, what validation ran, and any remaining
manual sync or commit step.

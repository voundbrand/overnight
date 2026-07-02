---
name: overnight-setup
description: Interactively install or upgrade the Overnight autonomous orchestration system in a repository. Use when the user asks to set up Overnight, install the skill library, port overnight orchestration, configure AGENTS.md, wire plan preflight, choose plan roots, or make another repo ready for autonomous implementation-plan work.
---

# Overnight Setup

Use this skill to set up the whole Overnight system in a target repo. It is the
interactive entrypoint: inspect the repo, ask only the missing questions, copy or
upgrade the library, and wire the repo-specific commands/instructions.

## Setup Questions

Ask only what you cannot infer safely:

1. **Target repo path** if not already clear.
2. **Plan root + plan slug**: e.g. `implementation_plans/my_plan` or
   `000_implementation_plans_all/crm_revamp`.
3. **Base branch**: default `origin/main` if the repo uses it.
4. **PR/review surface**: GitHub `gh`, local-only, or another provider.
5. **Harness choice for orchestrators**: Codex, Claude, OpenCode, or future
   native harness.
6. **Quality layer**: whether to install the portable quality skills
   (`engineering-quality-lens`, `tdd`, `diagnose`, `architecture-review`,
   `code-structure`). Default to yes for implementation-plan repos; skip them
   only if the target repo already has an equivalent local quality system or the
   user wants the smallest possible runtime.
7. **Branch/PR authorization**: whether agents may create branches/draft PRs now,
   or must remain on the current branch.

Do not ask a question if local files answer it. Prefer one short question at a
time when a choice is actually blocking.

## Workflow

1. **Inspect the target.**
   - `git status --short --branch`
   - root `AGENTS.md` / `CLAUDE.md`
   - `package.json`
   - plan folders and `TASK_QUEUE.md`
   - existing `.claude/skills`, `scripts/agent-signals.sh`, and
     `scripts/implementation-plan-orchestrator-preflight.mjs`

2. **Install or upgrade the library.**
   - If running from the packaged repo, prefer `dist/overnight/install.sh <target>`.
   - Install the quality layer by default. If the user opts out, pass
     `--without-quality-lenses` and make sure AGENTS/CLAUDE instructions do not
     require the skipped quality skills.
   - Use non-destructive install by default. Use `--force` only when the user
     explicitly asks to replace existing library files.
   - Preserve unrelated dirty work. Do not overwrite product files.

3. **Wire repo-specific commands.**
   - Add or update a package script:
     ```json
     "plan:orchestrator:preflight": "node scripts/implementation-plan-orchestrator-preflight.mjs --plans-root <root> --plan <slug>"
     ```
   - If the repo has no package scripts, document the direct `node` command
     instead of inventing a package manager.

4. **Patch instructions.**
   - Add a concise `AGENTS.md` / `CLAUDE.md` section pointing to:
     - `.claude/skills/implementation-plan-builder/SKILL.md`
     - `.claude/skills/overnight-agent-runbook/SKILL.md`
     - `.claude/skills/stacked-pr-orchestrator/SKILL.md`
     - `scripts/agent-signals.sh`
     - `npm run plan:orchestrator:preflight`
   - Fill the knobs table with the repo's real values.
   - If the quality layer was installed, set the quality lens source to
     `docs/quality-lenses.md + .claude/skills/`. If it was skipped, point to the
     target repo's existing quality docs or record `none`.
   - Preserve existing branch policy. If the repo says “do not create branches
     unless explicitly asked,” the Overnight section must repeat that constraint.

5. **Validate.**
   - `node --check scripts/implementation-plan-orchestrator-preflight.mjs`
   - `bash -n scripts/agent-signals.sh`
   - Run the configured preflight with `--no-write-state`.
   - Run `git diff --check` scoped to setup files.

6. **Close out.**
   - List installed/updated files.
   - Show the preflight verdict.
   - State whether any files were skipped to avoid overwriting.
   - State whether the repo was left uncommitted because of unrelated dirty work.

## Guardrails

- Never install a board, dispatcher, polling daemon, or required status file.
- Do not make a scheduled heartbeat wake an agent before the local preflight says
  `ACTION_REQUIRED`.
- Do not silently loosen branch, PR, credential, cloud, spend, or external-send
  rules.
- Keep setup changes separate from product implementation changes.

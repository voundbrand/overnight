# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-06-25

Initial public release. The autonomous, review-driven coding-agent system, packaged
to drop into any repo.

### Added

- **Overnight runbook** (`.claude/skills/overnight-agent-runbook/`) — the canonical
  operating model: open a draft PR early, loop on review until clean + green, never
  merge to `main`. Ships a prompt library under `template/`.
- **PR review loop** (`.claude/skills/pr-review-loop/`) — classify findings
  (actionable / invalid / duplicate / blocked / out-of-scope), fix only the valid
  ones, re-review each new head. GitHub-first, with Azure DevOps / GitLab as
  alternatives.
- **Stacked-PR orchestrator** (`.claude/skills/stacked-pr-orchestrator/`) — optional
  layer to run multiple PRs in parallel (git worktrees, Conductor workspaces, or paseo).
- **Signals probe** (`scripts/agent-signals.sh`) — one per-turn command that gathers
  CodeRabbit review + CI checks and prints the exit condition.
- **Planning skills** — `prd-to-task-queue` (turn a PRD/spec/conversation into
  repo-native plan docs + a `TASK_QUEUE.md`) and `implementation-plan-wiki` (build a
  static site from the plan markdown).
- **Quality lenses** — `engineering-quality-lens`, `tdd`, `diagnose`,
  `architecture-review`, `code-structure`.
- **Integration glue** — `agents/AGENTS.snippet.md` (+ filled `AGENTS.example.md`),
  `.coderabbit.example.yaml`, an example CI workflow, and a PR template.
- **Onboarding** — `install.sh` copies the system into a target repo (non-destructive
  by default), plus a full `docs/` set (how-it-works, quickstart, configuration,
  autonomy-engine, faq) and a neutral end-to-end example plan under `examples/`.
- **Demo** — `demo/` renders `docs/demo.gif` (the loop, via [VHS](https://github.com/charmbracelet/vhs)).

[Unreleased]: https://github.com/voundbrand/overnight/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/voundbrand/overnight/releases/tag/v0.1.0

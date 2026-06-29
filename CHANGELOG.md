# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **CodeRabbit CLI review output can now be captured as durable overnight
  evidence.** `scripts/agent-signals.sh` supports
  `SIGNALS_CLI_REVIEW_LOG=.context/coderabbit-cli-review.log`, writes the full
  stdout/stderr transcript before deleting temp files, and parses `findings=N`
  into `coderabbit=clean` or `coderabbit=findings:N`. The docs now warn against
  relying on transcript-only CLI streams during unattended runs.
- **`scripts/agent-signals.sh` no longer scores a failed CodeRabbit review as
  `clean`.** When the review fetch errored (network / rate-limit / auth), the error
  went to stderr and stdout came back empty, and an empty result was read as "no
  findings" → `coderabbit=clean` — so the loop could stop on a review that never
  ran. The GraphQL fetch now captures its exit code and stderr, and owner/repo
  resolution is checked; any failure yields `coderabbit=error` (the loop re-probes
  and never falsely stops). Thanks to Michael Hermel for the report.
- **`agent-signals.sh` CI-checks read hardened the same way.** A failed
  `gh pr checks` read (network/auth) previously collapsed to `ci=no-checks`; it now
  yields `ci=error` (re-probe, never treated as `pass`), while a genuine "no checks
  reported" still maps to `ci=no-checks`. gh's exit-8 "checks are failing/pending"
  is correctly read as `fail`/`pending`, not an error.
- **`agent-signals.sh` no longer hard-requires `mktemp`.** A portable `_tmpfile`
  helper prefers `mktemp` and falls back to a unique `$TMPDIR` / `/tmp` / `.` path,
  so the stderr-capture guards keep working in stripped containers; if no temp file
  can be created, the probe fails closed to `error` — never `clean`/`pass`.
- **Additional fail-closed hardening from adversarial stub testing.** The PR
  in-progress lookup now captures and validates `gh pr view`; GraphQL responses
  with explicit error markers or stderr-only exit-0 failures no longer score
  `clean`; CodeRabbit CLI stderr or empty exit-0 output is treated as untrusted;
  ambiguous CI stderr no longer matches "no checks" if it also contains
  transport/auth/API failures; and probe-read errors now exit non-zero for wrappers
  that check process status.

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

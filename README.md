<div align="center">

# Overnight

**An autonomous, review-driven workbench for AI coding agents.**

Point a coding agent at a task queue. It opens draft pull requests, loops on
automated code review until checks are green and the reviewer is clean, integrates
its own non-`main` branches — and **never merges to `main`**. It runs unattended,
overnight, with no kanban board, no dispatcher, and no polling daemon.

<br/>

![The review-driven loop: open a draft PR, probe review plus CI, fix the valid findings, push, re-review until clean and green, then leave it for a human to merge.](docs/demo.gif)

</div>

---

## Why this exists

Most "autonomous agent" setups bolt a coordination layer on top of the agent: a
kanban board, a dispatcher that hands out work, polling daemons, status files that
have to be kept in sync. That machinery is where these systems rot — it drifts from
reality, it needs babysitting, and it is the part that breaks at 3am.

Overnight deletes all of it. The insight:

> **The pull request and its review *are* the work queue.**

An agent opens a draft PR early, then loops on review feedback — fixing valid
findings, pushing a new head, getting re-reviewed — until the reviewer is clean and
CI is green. The PR's review state is the only state that matters. There is nothing
else to keep in sync, because the branch, the PR, the checks, and the task row are
the durable state. Sessions are disposable.

This is the operating model distilled from running real implementation work
unattended across many slices and many nights. It is **tool-agnostic** (Claude Code,
Codex, Cursor, OpenCode), **provider-agnostic** (GitHub `gh` by default; Azure
DevOps and GitLab also work), and **review-agnostic** (a fresh independent
reviewer works by default; CodeRabbit is an optional high-signal reviewer).

## How it works (in one diagram)

```
                  ┌────────────────────────────────────────────────┐
                  │  Pick the next launch-ready slice from the      │
                  │  TASK_QUEUE  (no board, no dispatcher)          │
                  └───────────────────────┬────────────────────────┘
                                          │
                          open a DRAFT PR early (gh)
                                          │
              ┌───────────────────────────▼───────────────────────────┐
              │                THE LOOP (per head SHA)                 │
              │                                                        │
              │   scripts/agent-signals.sh  ──►  SIGNALS               │
              │      ├─ Code review        (CodeRabbit or internal)     │
              │      └─ CI checks          (the required-check signal)  │
              │                                                        │
              │   classify each finding                                │
              │      actionable │ invalid │ duplicate │ blocked │ oos  │
              │                                                        │
              │   fix only valid actionable + failing checks           │
              │   push a new head  ──►  re-review + re-run CI          │
              └───────────────────────────┬───────────────────────────┘
                                          │
              review = clean  AND  ci = pass  AND  approvals present
                                          │
        ┌─────────────────────────────────┴─────────────────────────────────┐
        │  Leave the main-targeted PR ready for a HUMAN to merge,            │
        │  OR merge into an agent-owned non-main integration branch.        │
        │  Then claim the next slice — from a FRESH session.                │
        └────────────────────────────────────────────────────────────────────┘

                  ── main is HUMAN-GATED. The agent never merges it. ──
```

Two feedback signals (review comments + CI checks), gathered each turn by one probe,
`scripts/agent-signals.sh`, which prints a single `SIGNALS ci=… review=…` line
and the exit condition. Full detail in **[docs/how-it-works.md](docs/how-it-works.md)**.

## What's in the box

| Component | Path | What it does |
|---|---|---|
| **Overnight runbook** | `.claude/skills/overnight-agent-runbook/` | The canonical operating model + a prompt library (`template/`). The engine. |
| **PR review loop** | `.claude/skills/pr-review-loop/` | The review mechanics: classify findings, fix the valid ones, re-review the new head. |
| **Stacked-PR orchestrator** | `.claude/skills/stacked-pr-orchestrator/` | *Optional.* Run multiple PRs in parallel (git worktrees, Conductor workspaces, or paseo). |
| **Signals probe** | `scripts/agent-signals.sh` | One per-turn command that gathers review + CI and prints the exit condition. |
| **PRD → task queue** | `.claude/skills/prd-to-task-queue/` | Turn a PRD / spec / conversation into repo-native plan docs + `TASK_QUEUE.md` rows. |
| **Plan wiki** | `.claude/skills/implementation-plan-wiki/` | Build a static site from the plan markdown for humans to browse. |
| **Quality lenses** | `.claude/skills/{engineering-quality-lens,tdd,diagnose,architecture-review,code-structure}/` | Pick the smallest engineering discipline that changes the decision. |
| **Agent contract** | `agents/AGENTS.snippet.md` + `AGENTS.example.md` | The section you paste into your repo's `AGENTS.md`/`CLAUDE.md`. |
| **Runtime reliability notes** | `docs/runtime-reliability.md` | Watchdog/cache/background-shell guidance for long-running parallel agents. |
| **Reviewer + CI config** | `.coderabbit.example.yaml`, `.github/` | Templates for CodeRabbit, a PR template, and an example CI workflow. |
| **Example plan** | `examples/implementation_plans/example_plan/` | A neutral, end-to-end example of the plan format. |
| **Docs** | `docs/` | How it works, quickstart, configuration, the autonomy engine, FAQ. |

## Quickstart

```bash
# 1. Drop the system into your repo
git clone https://github.com/<owner>/overnight.git
cd overnight
./install.sh /path/to/your-repo

# 2. Wire a reviewer (pick one)
#    • Use a fresh independent reviewer command/session by default, and/or
#    • Install the CodeRabbit GitHub App and label PRs coderabbit-ready when ready, or
#    • Install the `coderabbit` CLI (`cr`) for deliberate paid/rate-limited reviews

# 3. Tell your agent the rules
#    Paste agents/AGENTS.snippet.md into your repo's AGENTS.md (or CLAUDE.md) and
#    fill the knobs table (base branch, PR surface, review tool, task source).
#    See agents/AGENTS.example.md for a filled-in version.

# 4. Create a task queue (or generate one with the prd-to-task-queue skill)
#    cp -r overnight/examples/implementation_plans/example_plan \
#          your-repo/implementation_plans/my_plan

# 5. Start a slice: branch, open a DRAFT PR, watch the signals
cd /path/to/your-repo
git switch -c feat/my-first-slice
gh pr create --draft --base main --fill
./scripts/agent-signals.sh           # prints SIGNALS ci=… review=…

# 6. Make it unattended (pick your harness's persistence loop)
#    • Claude Code ≥ 2.1.139:  /goal <six-field contract>
#    • Claude Code (older):    the /loop skill, or a Stop hook
#    • Codex:                  /goal <six-field contract>
#
#    For parallel/background agents, also apply docs/runtime-reliability.md:
#    raise any no-progress watchdog, run cold builds through background shell logs,
#    and share build caches across worktrees.
```

Full walkthrough: **[docs/quickstart.md](docs/quickstart.md)**.

## Requirements

- **A coding-agent harness** — Claude Code, Codex, Cursor, or OpenCode. Skills in
  `.claude/skills/` are auto-discovered by Claude Code (invoke as `/<name>`); other
  harnesses resolve them via the `.claude/skills/...` paths referenced from `AGENTS.md`.
- **Git** and a remote. **GitHub** (`gh` CLI) is the default; Azure DevOps (`az repos`)
  and GitLab also work; local-only is supported for the loop without a hosted PR.
- **A reviewer**: a fresh independent reviewer session/command by default.
  Optional — the [CodeRabbit](https://coderabbit.ai) GitHub App or `cr` CLI for
  deliberate review passes.
- **A persistence loop** for unattended runs: a native Goal feature (`/goal`) or a
  scheduled re-prompt (`/loop`, a Stop hook, or cron). See
  **[docs/autonomy-engine.md](docs/autonomy-engine.md)**.
- **Quiet UI sessions**: in Conductor or any transcript-heavy UI, overnight loops
  avoid routine narration and raw log dumps. Durable state lives in branches, PRs,
  commits, task rows, briefs, and validation artifacts; chat gets only compact
  evidence, blockers, and closeouts.
- **A runtime reliability profile** for parallel or background orchestration:
  configure long-running command timeouts/watchdogs, use background shell logs for
  cold builds, and share build caches across worktrees. See
  **[docs/runtime-reliability.md](docs/runtime-reliability.md)**.

## The safety model (read this)

The agent is given a wide working envelope and one hard wall:

Overnight's safety model is a **workflow and review boundary**, not an OS-level
filesystem sandbox. Git branches, draft PRs, branch protection, CI, review, and
human gates keep changes reviewable and reversible; they do not prevent a local
agent process from reading files outside the repository. Filesystem isolation, if
you need it, must come from the harness or runtime you choose: a container with
only the project mounted, a platform sandbox, or local tool permission controls.

**The agent MAY**, unattended: commit and push to its own task branch; open and
update **draft** PRs; merge or integrate branches **it owns** when the target is a
non-`main`, non-protected integration or stack branch with green gates.

**The agent MUST stop and wait for a human** to: merge, complete, squash, fast-forward,
or directly push to `main` / any protected base; create a non-draft PR targeting
`main`; bypass branch policies or required checks; delete branches; rewrite history;
change or rotate credentials; mutate approval-sensitive cloud resources; touch real
client data; spend money; or send external communications.

Mainline landing is **always** human-gated. That wall is the whole point.

## Configuration

Pin these once per repo (the knobs table in your `AGENTS.md`):

| Knob | Default | Alternatives |
|---|---|---|
| Base branch | `origin/main` | any non-`main` base — set it once |
| Remote / PR surface | GitHub (`gh`), draft PRs | Azure DevOps (`az repos`), GitLab, local-only |
| Review tool | CodeRabbit App + `cr` CLI | a fresh independent reviewer session |
| Quality lens source | `docs/quality-lenses.md` | your own discipline guide |
| Task source of truth | `implementation_plans/<plan>/TASK_QUEUE.md` | any markdown queue |

Details + per-harness wiring: **[docs/configuration.md](docs/configuration.md)**.
Runtime settings such as watchdog thresholds, shell timeouts, and shared build-cache
paths are local harness configuration; see
**[docs/runtime-reliability.md](docs/runtime-reliability.md)** before running
stacked/background slices.

## Repository layout

```
overnight/
├── README.md                     ← you are here
├── LICENSE                       ← MIT
├── install.sh                    ← copies the system into a target repo
├── agents/
│   ├── AGENTS.snippet.md         ← paste into your repo's AGENTS.md / CLAUDE.md
│   └── AGENTS.example.md         ← a filled-in example
├── .claude/skills/               ← the portable skills (the engine + quality lenses)
├── scripts/agent-signals.sh      ← the per-turn signals probe
├── docs/                         ← how-it-works, quickstart, configuration, autonomy-engine, faq
├── examples/implementation_plans/example_plan/   ← a neutral example plan
├── .coderabbit.example.yaml      ← reviewer config template
└── .github/                      ← example CI workflow + PR template
```

## Credits

- The **autofix** and **code-review** companion skills come from
  [`coderabbitai/skills`](https://github.com/coderabbitai/skills) and are *not*
  redistributed here; `skills-lock.json` pins the versions and the quickstart shows
  how to add them.
- Built on top of [CodeRabbit](https://coderabbit.ai) for recursive review and the
  [`gh`](https://cli.github.com/) CLI for the PR surface.

## License

[MIT](LICENSE) — © 2026 voundbrand. Use it, fork it, ship with it.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The system reviews
its own PRs; you can use it on itself.

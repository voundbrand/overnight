# Configuration

Overnight is provider-, reviewer-, and harness-agnostic. You make it concrete by
pinning a small set of **knobs** once per repo, then wiring your agent harness to
run a persistence loop. This page documents every knob, the `agent-signals.sh`
environment variables, and how to wire each supported harness.

Nothing here depends on the project name "Overnight" — skills are referenced by
their `.claude/skills/<name>/` paths, so renaming the repo changes nothing.

---

## Where configuration lives

There is no config file to maintain and no daemon reading settings. Configuration
lives in three durable places:

1. **The knobs table in your `AGENTS.md`** (paste it from `agents/AGENTS.snippet.md`,
   see a filled-in version in `agents/AGENTS.example.md`). This is what the agent
   reads to learn your base branch, PR surface, review tool, and task source.
2. **`.coderabbit.yaml`** (from `.coderabbit.example.yaml`) — the reviewer config,
   if you use the CodeRabbit GitHub App.
3. **Environment variables** passed to `scripts/agent-signals.sh` — runtime
   overrides for how the per-turn probe gathers review signals.
4. **Harness-local runtime settings** — watchdogs, shell timeouts, and build-cache
   paths used by your agent runner. These are intentionally local; see
   [Runtime Reliability](runtime-reliability.md).

The PR, its checks, and the task row are the durable *state*. The first three
places above are durable repo configuration. Harness-local runtime settings make
long-running sessions reliable on one machine or runner.

---

## The knobs

Pin each of these once. The defaults are chosen so that a standard GitHub repo on
`main` needs almost no customization.

| Knob | Default | Alternatives | Set it in |
|---|---|---|---|
| [Base branch](#base-branch) | `origin/main` | any non-`main` base | `AGENTS.md` knobs table; `.coderabbit.yaml`; `agent-signals.sh` arg |
| [Remote / PR surface](#remote--pr-surface) | GitHub (`gh`), draft PRs | Azure DevOps (`az repos`), GitLab, local-only | `AGENTS.md` knobs table |
| [Review tool](#review-tool) | CodeRabbit App + `cr` CLI | a fresh independent reviewer session | `AGENTS.md` knobs table; `.coderabbit.yaml`; `SIGNALS_REVIEW_SOURCE` |
| [Quality lens source](#quality-lens-source) | `docs/quality-lenses.md` | your own discipline guide | `AGENTS.md` knobs table |
| [Task source of truth](#task-source-of-truth) | `implementation_plans/<your-plan>/TASK_QUEUE.md` | any markdown queue | `AGENTS.md` knobs table |
| [Escalation policy](#escalation-policy) | record blocker + exact input, move to next independent slice | — | `AGENTS.md` + the runbook |

### Base branch

The comparison/merge target for the loop — the branch your draft PR is opened
against and the base `agent-signals.sh` diffs against.

- **Default:** `origin/main`. The agent **never** merges or pushes to it; mainline
  landing is human-gated.
- **Any non-`main` base works the same way.** If your repo's integration branch is
  something else, set it once and point everything at it. There is nothing special
  about the name `main` other than that it is the documented default and is almost
  always a protected branch.

Set it in three places so they agree:

```bash
# 1. The knobs table in AGENTS.md
# | Base branch | origin/main |

# 2. .coderabbit.yaml — so the App reviews PRs opened against it
#    reviews.auto_review.base_branches: [ main ]

# 3. agent-signals.sh takes the base as its first argument (defaults to origin/main)
./scripts/agent-signals.sh origin/main
```

When you open the draft PR, pass the same base (the script strips the `origin/`
prefix for `gh`):

```bash
gh pr create --draft --base main --fill
```

### Remote / PR surface

Where the pull request lives. **GitHub (`gh`) is the default and the primary
documented surface** — the signals probe, the CodeRabbit GitHub App, and the
example CI workflow all assume `gh`. Tool-agnosticism is a feature: the same loop
runs on other surfaces, they are just secondary.

| Surface | CLI | Status | Notes |
|---|---|---|---|
| **GitHub** | `gh` | **Default** | Draft PR + GitHub Actions checks + CodeRabbit App. `agent-signals.sh` is written for this. |
| Azure DevOps | `az repos` | Alternative | Draft PRs supported; swap the `gh` calls in the probe for `az repos pr` equivalents and read your pipeline's check status. |
| GitLab | `glab` | Alternative | Draft ("Draft:" title prefix) merge requests + GitLab CI. |
| Local-only | — | Supported | Run the review loop without a hosted PR; use `SIGNALS_SKIP_REVIEW=1` or the `cli` review source and your own CI command. |

Whatever you pick, the rule is identical: **draft PRs only**, and the agent never
completes a PR into `main`/a protected base. Record your choice in the knobs table:

```text
| Remote / PR surface | GitHub gh (default), draft PRs only |
```

### Review tool

The reviewer whose comments drive the loop. The review mechanics are agnostic
(see `.claude/skills/pr-review-loop/SKILL.md`); only the reviewer changes.

- **Default — tiered review.** Run CI, the row's Verify command, and a fresh
  independent reviewer while a branch is still moving quickly. This keeps
  paid/rate-limited reviewers focused on stable heads.
- **CodeRabbit GitHub App.** Configure `.coderabbit.yaml` as opt-in with a label
  such as `coderabbit-ready`. Add the label or a keyword such as
  `coderabbit:review` when the PR is ready for that review pass.
- **CodeRabbit CLI (`cr`).** Runs the same review locally
  (`cr --agent --base <base>`) and can spend allowance; reserve it for deliberate
  pre-PR or no-PR review.
- **Fresh independent reviewer session.** Spawn a separate agent prompted only to
  review the exact head SHA and return findings. The implementation session owns
  the fixes. The mechanics are identical — classify each finding, fix the valid
  actionable ones, re-review the new head.

The probe chooses *how* to read the review automatically; you can override it with
[`SIGNALS_REVIEW_SOURCE`](#signals_review_source). Record your reviewer in the
knobs table:

```text
| Review tool | CI + fresh independent reviewer by default; CodeRabbit App by `coderabbit-ready` label |
```

### Quality lens source

Where the agent looks to choose the smallest engineering discipline that changes
the decision — TDD, diagnosis, architecture review, or service-layer structure.
Don't bulk-load rule sets; pick the one lens that matters.

- **Default:** `docs/quality-lenses.md` (shipped in this package) plus the lens
  skills in `.claude/skills/`:
  - `engineering-quality-lens` — the chooser.
  - `tdd` — new behavior through a public seam.
  - `diagnose` — bugs, regressions, flakiness, performance.
  - `architecture-review` — shared contracts and risky refactors.
  - `code-structure` — actions ↔ service-layer separation.
- **Alternative:** point this at your own engineering discipline guide. The lens
  block in the Goal contract (`template/goal-prompt.md`) stays the same shape.

```text
| Quality lens source | docs/quality-lenses.md + .claude/skills/ |
```

### Task source of truth

Where work comes from. **There is no kanban board, dispatcher, polling daemon, or
required status file** — the PR's review state is the work queue, and the rows are
plain markdown.

- **Default:** `implementation_plans/<your-plan>/TASK_QUEUE.md`. Each row carries
  status, owner, priority, and a `Writes:` ownership set; branchability and
  serial/parallel guidance live in the row Notes plus any per-slice
  `OVERNIGHT_<ID>_<slug>.md` brief.
- **Alternative:** any markdown queue your repo already uses. Generate one from a
  PRD, spec, or conversation with `.claude/skills/prd-to-task-queue/SKILL.md`, and
  build a human-browsable site from the plan with
  `.claude/skills/implementation-plan-wiki/SKILL.md`.

```text
| Task source of truth | implementation_plans/<your-plan>/TASK_QUEUE.md |
```

If no row is launch-ready, the agent does **readiness-prep** — it authors the
missing per-slice brief (scope, acceptance criteria, offline validation, governing
decisions, owned files, base) rather than stopping. See the runbook's
"Readiness-Prep Mode".

### Escalation policy

What the agent does when it hits a blocker. Human input is **not** automatically
blocking.

- **Default policy:** record the blocker (what was attempted, evidence gathered,
  the exact blocker, and the exact input/approval needed) in the slice closeout,
  leave the branch clean, then move to the next independent ready or readiness-prep
  slice. A product decision usually becomes a *decision packet* plus a documented
  reversible assumption, not a full stop.
- **Stop only** when no row can be implemented, made ready, or advanced with a
  documented reversible assumption — or a real **human gate** is hit. The
  human-gated actions are fixed and non-negotiable:

  > merge/complete a PR into `main` or any protected base; create a non-draft PR
  > targeting `main`; bypass branch policies or required checks; modify protected
  > branches; delete branches; rewrite history; change or rotate credentials;
  > mutate approval-sensitive cloud resources; use real client data; spend money;
  > send external communications.

This policy is enforced by prose, not config — it lives in `AGENTS.md` (from
`agents/AGENTS.snippet.md`) and the runbook. There is no flag that loosens it.

---

## `agent-signals.sh` environment variables

`scripts/agent-signals.sh [base-branch]` is the one per-turn probe. It gathers
**both** feedback signals — code review and the GitHub Actions checks —
and prints a single verdict line plus the exit condition:

```text
SIGNALS  ci=<pass|fail|pending|no-checks|no-pr|none>  coderabbit=<...>  internal=<...>  review=<clean|findings|pending|missing|...>
EXIT WHEN: review=clean (CodeRabbit or internal reviewer) AND ci=pass -> stop, report ready.
```

The base branch is the first positional argument and defaults to `origin/main`:

```bash
./scripts/agent-signals.sh                 # base = origin/main
./scripts/agent-signals.sh origin/release  # any non-main base
```

It does **not** auto-classify findings — the agent classifies each one
(actionable | invalid | duplicate | blocked | out-of-scope) and fixes only the
valid actionable ones. Two environment variables control how it reads the review
signal.

### `SIGNALS_REVIEW_SOURCE`

Selects where the CodeRabbit review signal comes from. Default: `auto`.

| Value | Behavior |
|---|---|
| `auto` *(default)* | **PR open + ready marker present:** read the CodeRabbit App's unresolved review threads via `gh`. **PR open without marker:** skip CodeRabbit and rely on internal review + CI. **No PR:** skip CodeRabbit unless `SIGNALS_PRE_PR_CLI=1`. |
| `app` | **Always** read the App's PR review threads via `gh`. Credit-free and line-by-line on Pro; on the Free plan this is summary-only (0 threads). Requires an open PR — reports `no-pr` otherwise. |
| `cli` | **Always** run `coderabbit review --agent --base <base>` locally. Spends a CLI credit/turn. Use this on the Free plan or with no hosted PR. Reports `unavailable` if the `cr` CLI isn't installed. |

```bash
# Read App threads on the PR (credit-free on Pro)
SIGNALS_REVIEW_SOURCE=app ./scripts/agent-signals.sh

# Force a local CLI review (Free plan, or before the PR exists)
SIGNALS_REVIEW_SOURCE=cli ./scripts/agent-signals.sh origin/main
```

### `SIGNALS_SKIP_REVIEW`

Set to `1` to skip the review signal entirely and probe **CI checks only**. Useful
when you're iterating on a failing build and don't want to spend a review pass, or
in a local-only flow with no reviewer.

```bash
# CI checks only — no review this turn
SIGNALS_SKIP_REVIEW=1 ./scripts/agent-signals.sh
```

The verdict line then reports `coderabbit=skipped`; configure
`SIGNALS_INTERNAL_REVIEW_COMMAND` if you still want the aggregate `review=clean`
gate to be satisfied.

### CodeRabbit readiness and internal review

| Variable | Default | Behavior |
|---|---|---|
| `SIGNALS_CODERABBIT_LABEL` | `coderabbit-ready` | In `auto` mode, request CodeRabbit only when the PR has this label. Set empty to disable label gating. |
| `SIGNALS_CODERABBIT_KEYWORD` | `coderabbit:review` | In `auto` mode, request CodeRabbit when the PR title/body contains this string. |
| `SIGNALS_PRE_PR_CLI` | `0` | Set to `1` to run the CodeRabbit CLI before a PR exists. |
| `SIGNALS_INTERNAL_REVIEW_COMMAND` | empty | Command used as the no-CodeRabbit reviewer. Exit `0` means `internal=clean`; non-zero means findings. |
| `SIGNALS_IGNORE_CHECKS_REGEX` | empty | Extra GitHub check names to ignore when computing `ci`. The probe automatically ignores the `CodeRabbit` check when CodeRabbit was not requested. |

```bash
SIGNALS_INTERNAL_REVIEW_COMMAND='scripts/internal-review.sh' ./scripts/agent-signals.sh
SIGNALS_CODERABBIT_LABEL=coderabbit-ready ./scripts/agent-signals.sh origin/main
```

Agents may request CodeRabbit themselves, but should follow a spending policy:
request it when local/row validation passes and either the PR is ready for final
integration, the slice touches high-risk surfaces such as shared contracts,
security, auth, runtime, persistence, or concurrency, or an internal reviewer
raised concerns that need an independent pass. Do not request CodeRabbit for
early WIP pushes, docs-only readiness prep, format-only fixes, or branches still
failing local validation.

---

## Harness Runtime Variables

These are not read by `agent-signals.sh`; they are consumed by your agent harness,
shell, compiler, or CI runner. Configure them wherever your runtime loads local
environment variables.

Use [Runtime Reliability](runtime-reliability.md) before parallel/background
orchestration, especially when implementation agents run in git worktrees and the
first build is cold. The common pattern is:

```bash
export CARGO_TARGET_DIR=/path/to/repo/.shared-cargo-target
export BASH_MAX_TIMEOUT_MS=3600000
export CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS=3600000
```

The exact watchdog variable names are harness-specific. For Claude Code /
Conductor-style runs, `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` controls the
background subagent no-progress watchdog. Other harnesses may expose a different
setting or none at all. If no setting exists, avoid cold builds inside nested
background implementation agents and run those builds from the supervising
session's background shell instead.

---

## Per-harness wiring

What makes a thread keep working unattended is a **persistence loop**: an
after-each-turn check that re-continues the thread until the PR's exit condition
holds. This is tool-agnostic — use whatever your harness provides. Either way the
condition is the same **six-field contract** (Outcome, Verification surface,
Constraints, Boundaries, Iteration policy, Blocked stop) from
`template/goal-prompt.md`.

> **No voluntary budget.** Do not set a token or turn budget for overnight work.
> Let your provider/account usage cap be the runtime limit.

### Claude Code

Two paths, depending on version:

- **`/goal` (Claude Code ≥ v2.1.139)** — the native Goal feature. Requires
  workspace trust and hooks enabled. `/goal <condition>` sets a completion
  condition; after each turn a small fast model decides yes/no and the thread keeps
  working until yes. One goal per session; `/goal` checks status, `/goal clear`
  stops. Pair it with **auto mode** so tool calls run unattended. Works headless:

  ```bash
  claude -p "/goal <six-field contract>"
  ```

  **Important — the evaluator only judges the transcript; it does not run commands
  or read files.** Phrase the condition as something the agent *demonstrates
  in-conversation* — it must run the check and surface compact evidence each turn.
  For example: "PR `<url>` has all required checks green, no unresolved review
  comments, and required approvals — shown by running `scripts/agent-signals.sh
  <base>` or `gh pr view --json statusCheckRollup,reviewDecision,reviews` and
  summarizing the reviewer/check verdict in this conversation." Condition limit:
  4,000 chars.

- **`/loop` skill or a Stop hook (older Claude Code)** — if `/goal` isn't
  available, re-send the same six-field contract on an interval until the exit
  condition holds. The `/loop` skill, a Stop hook that re-prompts, or a cron job
  all work. The recursion on the *review* side is already automatic — CodeRabbit
  re-reviews each push, so every turn has fresh comments to act on.

Skills in `.claude/skills/` are auto-discovered by Claude Code and invoked as
`/<name>`.

### Codex

- **`/goal`** — Codex's native Goal feature. Seed the full six-field `/goal`;
  Codex continues from idle and the evaluator can check against concrete evidence
  (files, tests, logs, artifacts). Respect **evidence-based completion** (never
  "looks done") and **plan-only turns don't continue** (make real progress each
  turn). Commands: `/goal`, `/goal pause|resume|clear`. Do not set a voluntary
  token/turn budget unless explicitly asked.

### Cursor

No native Goal feature. Use a **scheduled re-prompt** as the persistence loop: a
recurring task or a hook that re-sends the same six-field contract until the exit
condition holds. Cursor resolves the skills through the `.claude/skills/...` paths
referenced from `AGENTS.md`. Keep each turn making real progress — fix the latest
findings, push a new head, re-probe with `agent-signals.sh`.

### OpenCode

No native Goal feature. Same approach as Cursor — drive the loop with a scheduled
re-prompt (cron, a Stop-equivalent hook, or a wrapper script) that re-sends the
contract every N minutes. OpenCode reads the rules and skill paths from
`AGENTS.md`.

---

## Putting it together: a worked default

A standard GitHub repo on `main` with CodeRabbit Pro and Claude Code ≥ v2.1.139:

```bash
# AGENTS.md knobs (filled once)
#   Base branch          : origin/main
#   Remote / PR surface  : GitHub gh, draft PRs only
#   Review tool          : fresh independent reviewer; CodeRabbit by ready label
#   Quality lens source  : docs/quality-lenses.md + .claude/skills/
#   Task source of truth : implementation_plans/<your-plan>/TASK_QUEUE.md
#   Escalation           : record blocker + exact input, move to next independent slice

# Start a slice
git switch -c feat/<your-slice>
gh pr create --draft --base main --fill

# Probe both signals each turn (auto source, origin/main base)
./scripts/agent-signals.sh

# Make it unattended
claude -p "/goal <six-field contract from template/goal-prompt.md>"
```

Swap GitHub for Azure DevOps or GitLab, CodeRabbit for a fresh reviewer session, or
`/goal` for a `/loop` re-prompt — the loop and the exit condition are unchanged.

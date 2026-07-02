# How It Works

Overnight runs implementation work unattended — overnight, or any time without a
human in the loop — by making the **pull request and its review** the engine.
There is no kanban board, no dispatcher, no polling daemon, and no required
status files. The agent picks one reviewable slice, opens a draft PR early, and
loops on review feedback until the PR is clean and green. This document explains
the architecture and the philosophy behind it.

The canonical runbook is `.claude/skills/overnight-agent-runbook/SKILL.md`; the
review mechanics live in `.claude/skills/pr-review-loop/SKILL.md`. This doc is
the why-and-how that ties them together.

## The Core Idea: The PR Is the Work Queue

Earlier autonomous-coding setups bolted a coordination layer onto the agent: a
board of cards, a dispatcher loop that handed work out, a polling daemon, and
status files the agent had to keep current. All of that is **retired**. It was
machinery to track state that the version-control system already tracks better.

Overnight inverts it. The durable state of a run is the **branch, the draft PR,
the task row, the commits, and the review/check state** — not a transcript and
not a side-channel database. The PR's review state *is* the work queue:

- An unresolved review finding is a work item.
- A failing required check is a work item.
- A clean review plus passing checks plus required approvals is the exit
  condition.

The agent selects what to work on directly from a `TASK_QUEUE.md` in an
implementation plan (see `.claude/skills/prd-to-task-queue/SKILL.md` for how
those rows get authored). Nothing dispatches work to it. Once a slice is in
flight, the PR thread becomes the message bus and the shared state, and the agent
drives it to done.

This makes the system **harness-agnostic** (Claude Code, Codex, Cursor,
OpenCode all work) and **GitHub-first** on the packaged PR surface. The loop only
depends on a PR that can be reviewed and a way to read review/check state; the
shipped probe implements that for GitHub `gh`, and other providers need an
equivalent adapter.

## The Two Feedback Signals

Every iteration is driven by exactly two signals:

1. **The code review** — line-by-line findings from CodeRabbit (the recommended
   reviewer), or from a fresh independent reviewer session as a fallback. This is
   the *review-comment* signal.
2. **The CI checks** — GitHub Actions check results on the PR head in the packaged
   probe. This is the *required-checks* signal.

A new commit (a new head SHA) re-runs CI. CodeRabbit re-reviews only when the PR
is marked ready for CodeRabbit or when you explicitly request it. Otherwise the
review signal should come from a fresh independent reviewer command/session. The
loop converges as the agent resolves findings and fixes failures.

## The Probe: `scripts/agent-signals.sh`

The packaged GitHub script gathers both signals in one place so the agent never
has to remember which `gh` commands to run or how to read them. It is the single
per-turn probe an autonomous thread runs. For Azure DevOps, GitLab, or local-only
flows, keep this contract and replace the implementation with provider-specific
review/check commands.

```bash
scripts/agent-signals.sh [base]      # default base: origin/main
```

It prints a human-readable section for each signal and ends with a single
machine-readable verdict line the loop reads:

```
SIGNALS  ci=<state>  coderabbit=<state>  internal=<state>  review=<state>
SLICE READY WHEN: review=clean (CodeRabbit or internal reviewer) AND ci=pass -> current head is ready.
CAMPAIGN CONTINUATION: the goal/task queue decides whether to claim the next row, readiness-prep, or stop.
```

- `ci` is one of `pass`, `fail`, `pending`, `no-checks`, `no-pr`. It is computed
  from `gh pr checks <pr> --json bucket` (counting `fail` and `pending`
  buckets).
- `coderabbit` is one of `clean`, `findings:<n>`, `in-progress`, `skipped`,
  `not-requested`, `no-pr`, `unavailable`. When there are findings, the probe
  lists each unresolved thread as `path:line  <first line of comment>`.
- `internal` is the optional no-CodeRabbit reviewer command result.
- `review` is the aggregate gate. It is `clean` when CodeRabbit is clean or the
  configured internal reviewer is clean.

The probe does **not** classify findings or fix anything — that is the agent's
job (see below). It only reports state.

### Review-source knobs

How the review signal is gathered is configurable via environment variables:

| Variable | Values | Effect |
|---|---|---|
| `SIGNALS_REVIEW_SOURCE` | `auto` (default) | If a PR is open and has the ready marker, read the CodeRabbit **App**'s review threads via `gh`; otherwise rely on internal review + CI. |
| `SIGNALS_REVIEW_SOURCE` | `app` | Always read the App's PR review threads via `gh` (credit-free; line-by-line on Pro, summary-only on Free). |
| `SIGNALS_REVIEW_SOURCE` | `cli` | Always run `coderabbit review --agent` locally (spends a CLI credit/turn). |
| `SIGNALS_SKIP_REVIEW` | `1` | Skip the review signal entirely (CI only). |
| `SIGNALS_INTERNAL_REVIEW_COMMAND` | command | Run this command as the fresh-reviewer fallback; exit 0 means clean. |
| `SIGNALS_CODERABBIT_LABEL` | `coderabbit-ready` | In `auto` mode, request CodeRabbit only when this PR label is present. |
| `SIGNALS_CODERABBIT_KEYWORD` | `coderabbit:review` | In `auto` mode, request CodeRabbit when this PR title/body keyword is present. |
| `SIGNALS_CLI_REVIEW_LOG` | path | When CLI review runs, save the full CodeRabbit stdout/stderr transcript before relying on it as durable evidence. |

The default (`auto`) is deliberately frugal: active draft PRs do not request
CodeRabbit until they are marked ready. Before a PR exists, it skips CodeRabbit
unless `SIGNALS_PRE_PR_CLI=1` is set.

CLI review output is a stream, not durable PR state. In unattended sessions,
prefer hosted CodeRabbit comments for stable findings, or run CLI review through
the probe with `SIGNALS_CLI_REVIEW_LOG=.context/coderabbit-cli-review.log`.
Do not keep rerunning uncaptured `cr --agent` after an interrupted pass loses
finding bodies.

## The PR Comment Loop, Step by Step

However many agents or PRs a thread carries, each PR is driven the same way. This
is the engine.

1. **Open a reviewable PR early.** Establish the branch (don't rename it to match
   a suggested name), make a coherent first head, then open a **draft** PR so CI
   runs and the reviewer starts looking.
   ```bash
   git status --short --branch
   git fetch origin
   git diff --stat <base>...
   git rev-parse --short HEAD
   gh pr create --draft --base main --fill
   ```
   Implement with the smallest quality lens that changes the decision (see
   "Quality Lenses" below). Don't bulk-load rule sets.
2. **Probe the review state.** Run `scripts/agent-signals.sh <base>` to pull
   every unresolved signal for the current head: CodeRabbit findings when
   requested, internal-review output when configured, **and** CI check results.
   Also read any human PR comments / review threads / required reviewer votes.
3. **Classify each finding.** Every finding is labeled exactly one of:
   `actionable` (fix it), `invalid` (explain, no change), `duplicate` (fix once),
   `blocked` (stop with the exact input needed), or `out-of-scope` (record a
   follow-up).
4. **Fix only valid actionable findings.** Make the focused change, validate the
   changed area, commit. No drive-by refactors. If a head's feedback is entirely
   invalid/duplicate/out-of-scope, make no noise commit and record why.
5. **Push the new head.** A new SHA invalidates the prior review and re-runs CI.
   CodeRabbit re-runs only when the PR is marked for CodeRabbit review.
6. **Repeat 2–5 until the exit condition holds:** no unresolved actionable
   findings, required checks pass, and the PR has the approvals its policy
   requires. Keep it bounded — two passes usually clear a head; continue only for
   major/critical findings or newly added comments.
7. **Code-structure gate.** If the work moved shared operational mechanics
   between actions and the service layer, run `code-structure` before reporting;
   otherwise record `code-structure: not applicable (<reason>)`.
8. **Close or advance the slice.** If the PR targets `main` (or any protected
   base), leave it draft/ready for a human — **never merge it.** If the target is
   an explicitly agent-owned non-main integration or stack branch, the agent may
   merge/integrate it once gates are green and conflicts are resolved. Then
   continue to the next launch-ready independent slice.

Stop the loop (don't guess) when the exit condition is met, when a finding is a
blocker needing a human-gated decision (record it with the exact input needed),
when no independent slice can be advanced, or when you'd have to touch a surface
another in-progress branch owns.

### The Loop, Drawn

```
                 ┌─────────────────────────────────────────────┐
                 │  Select one reviewable slice from            │
                 │  implementation_plans/<plan>/TASK_QUEUE.md   │
                 └───────────────────────┬─────────────────────┘
                                         │
                                         v
                 ┌─────────────────────────────────────────────┐
                 │  Establish branch, make first head,          │
                 │  open a DRAFT PR  (gh pr create by default)  │
                 └───────────────────────┬─────────────────────┘
                                         │
                                         v
        ┌───────────────────────────────────────────────────────────────┐
        │                                                               │
        │   ┌─────────────────────────────────────────────────────┐    │
        │   │  PROBE:  scripts/agent-signals.sh <base>            │    │
        │   │                                                     │    │
        │   │   Signal 1: CodeRabbit review  ── findings          │    │
        │   │   Signal 2: GitHub Actions CI  ── pass/fail/pending │    │
        │   │                                                     │    │
        │   │   => SIGNALS  ci=…  coderabbit=…                    │    │
        │   └───────────────────────────┬─────────────────────────┘    │
        │                               │                              │
        │              clean + pass?    │   no                         │
        │            ┌──────────────────┴──────────────────┐           │
        │            │ yes                                  │           │
        │            │                                      v           │
        │            │              ┌──────────────────────────────┐   │
        │            │              │ Classify each finding:       │   │
        │            │              │ actionable | invalid |       │   │
        │            │              │ duplicate | blocked |        │   │
        │            │              │ out-of-scope                 │   │
        │            │              └──────────────┬───────────────┘   │
        │            │                             │                   │
        │            │              ┌──────────────v───────────────┐   │
        │            │              │ Fix valid actionable ones,   │   │
        │            │              │ validate, commit focused fix │   │
        │            │              └──────────────┬───────────────┘   │
        │            │                             │                   │
        │            │              ┌──────────────v───────────────┐   │
        │            │              │ Push new head (new SHA)      │   │
        │            │              │ -> re-review + re-run CI ────┼───┘ (loop back to PROBE)
        │            │              └──────────────────────────────┘
        │            v
        │   ┌──────────────────────────────────────────────────────┐
        │   │ Exit condition met. code-structure gate if needed.    │
        │   │                                                       │
        │   │  target == main/protected  ->  leave for HUMAN merge  │
        │   │  target == agent-owned non-main -> agent may integrate│
        │   └───────────────────────────┬───────────────────────────┘
        └───────────────────────────────┼───────────────────────────────┘
                                        v
                  Next launch-ready independent slice
                  (or readiness-prep if none is ready)
```

The recursion on the review side is automatic: every push produces fresh signal,
so the agent always has something concrete to read and act on each turn.

## Human Gates and the Merge Policy

This is the hard line. In unattended mode an agent **may**:

- commit to its own task branch,
- push that branch,
- create/update a **draft** PR for visibility,
- merge/integrate branches it owns **only** when the target is an explicitly
  non-main integration/stack branch and the review/check gates are green.

An agent **must stop and wait for a human** to:

- merge or complete a PR into `main` (or any protected base branch),
- create a non-draft PR targeting `main`,
- bypass branch policies, modify protected branches, delete branches, or rewrite
  history,
- change or rotate credentials,
- mutate approval-sensitive cloud resources,
- use real client/production data, spend money, or send external communications.

The principle: the agent owns everything reversible and isolated to its own work;
anything that affects shared/protected state, costs money, or reaches the outside
world is human-gated. Merging to `main` is the canonical example and is **never**
done by the agent.

This is not the same as filesystem containment. Git branches and worktrees isolate
repository state and make changes reviewable, but they are not an OS/container
sandbox. A local agent still has the filesystem access granted by its harness and
host user. Use a container, platform sandbox, or harness-level permission controls
when the requirement is "only the project directory is mounted/readable."

## Session Hygiene and Rollover

A single ever-growing chat transcript is **not** the durable state of an
overnight run. The branch, draft PR, task row, commits, validation output, and
review/check state are. Agent sessions are disposable execution containers.

After each slice is green/clean and pushed:

1. Push the head.
2. Record a compact closeout (see "Closeout Report" in the runbook skill).
3. Start the **next** slice from live repo/PR state, not from accumulated chat
   context.

In UI-backed runtimes that store and render the full transcript locally
(Conductor is one example), **start a fresh session before claiming the next
row** by default. Don't keep one tab accumulating every tool call across many
slices — that produces large local session stores, slow renderers, and resume
loops that replay thousands of old tool messages.

A fresh session re-orients from durable state, in this order:

1. the current branch and remote head,
2. the draft PR URL and `scripts/agent-signals.sh <base>` output,
3. the task queue row statuses and any committed `OVERNIGHT_<ID>_<slug>.md`
   brief,
4. the last slice's closeout / commit message.

This is transcript hygiene, **not** a voluntary token or turn budget. If a
runtime cannot spawn a new session automatically, the agent still keeps output
compact, writes bulky diagnostics to files instead of chat, and pauses after a
green slice with a precise restart prompt for the next fresh session.

### Quiet overnight mode

For Conductor and other UI-backed runtimes, overnight sessions should be quiet by
default. Do not stream routine agent discussion, step-by-step narration, full
diffs, long logs, or repeated raw probe output into chat. The durable log is the
branch, commits, draft PR, task queue row, committed brief, and validation
artifacts.

The agent should surface only compact evidence needed by the goal evaluator:
current head/PR when it changes, the `SIGNALS ...` verdict line or a short
validation summary, blockers, and the final closeout. If a provider needs proof
inside the transcript, emit the smallest stable summary that proves the state and
put bulky details in files or PR comments.

## The Autonomy Engine: A Persistence Loop

What makes a thread keep working unattended is a **persistence loop**: an
after-each-turn check that re-continues the thread until the PR's exit condition
holds, instead of stopping after one turn. This is tool-agnostic — use whatever
the runtime provides:

- **A native Goal feature**, if the harness has one. Codex `/goal` and Claude
  Code `/goal` (the latter needs Claude Code ≥ v2.1.139) both run an
  after-each-turn evaluator and continue automatically. Prefer this when
  available.
- **A scheduled re-prompt** otherwise — a cron job, the `/loop` skill, or a Stop
  hook that re-sends the same contract every N minutes until the exit condition
  holds.

For overnight work, do **not** set a voluntary token or turn budget; let the
provider/account usage cap be the runtime limit. Plan-only turns don't count as
progress — each turn must make real progress, and completion must be
evidence-based ("the probe shows clean + pass"), never "looks done."

Either mechanism evaluates the same **six-field contract**. Write every Goal in
this shape so the agent never has to guess what done means:

| Field | Meaning for an implementation thread |
|---|---|
| **Outcome** | The current piece is approved + green; then the thread advances through the next launch-ready pieces, or creates the missing readiness brief for the next candidate and proceeds when ready. |
| **Verification surface** | Review clean (CodeRabbit/reviewer), required checks pass, required approvals present — demonstrated by a compact `agent-signals.sh` verdict in-conversation. |
| **Constraints** | What must not regress: contracts, security posture, tests. |
| **Boundaries** | Owned files, base branch, allowed tools/providers; never merge or push to `main`/protected base. |
| **Iteration policy** | Each turn: address the latest unresolved findings / failing checks, push, re-probe; after green/clean, integrate only to an allowed non-main branch (or leave a main-targeted PR ready), then claim the next launch-ready row or author the missing readiness brief. |
| **Blocked stop** | A human-gated action, no row can be implemented/made ready/advanced with a reversible assumption, or missing input that blocks all safe progress — report the exact need and stop. |

> Note for Claude Code `/goal`: the evaluator only judges what is **in the
> transcript** — it does not run commands or read files. Phrase the condition as
> something the agent demonstrates in-conversation: it must run
> `agent-signals.sh` (or `gh pr view --json statusCheckRollup,reviewDecision,reviews`)
> and surface a compact verdict each turn. The condition limit is 4,000 chars; one
> goal per session; pair with auto mode so tool calls run unattended.

## Readiness-Prep Mode

The agent does not stop just because the next row isn't ready to implement. A
missing `OVERNIGHT_*` brief, missing owned-files list, or missing verification
surface is **prep work the overnight agent should do**, not a terminal blocker.

When no row is launch-ready:

1. Pick the highest-priority candidate that is not `DONE`/`DEFERRED`, not blocked
   by an unresolved product decision, not owned by another in-progress branch,
   and not dependent on an unlanded row.
2. Gather the same context as implementation work: the design doc, cited
   decisions/stories, and nearby contracts/fixtures.
3. Author `implementation_plans/<plan>/OVERNIGHT_<ID>_<slug>.md` with: scope,
   acceptance criteria, offline validation, governing decisions, owned files,
   verification command, base branch, out-of-scope boundaries, risks, and
   blocked-stop conditions.
4. If the row needs durable queue backfill, update only that row's Notes with the
   brief path and any expected entries.
5. Commit and push the readiness-prep change; open/update a draft PR if useful
   and run the review loop on it.
6. If the brief resolves readiness, proceed into implementation in the same
   autonomy run. If authoring the brief exposes a missing decision, first try a
   reversible assumption, a decision packet, or a smaller independent slice
   before marking a blocker.

**Human input is not automatically blocking.** A product decision usually becomes
a decision packet plus a move to independent work; it blocks only when every
available candidate depends on it. The agent stops for "no ready work" **only**
after both direct implementation and readiness-prep paths are exhausted — i.e.,
when no row can be implemented, made ready, or advanced with a documented
reversible assumption, or a real human gate is hit.

## How Quality Lenses Plug In

The loop says *iterate until clean and green*; the **quality lenses** decide
*how* a given change is made and reviewed. The rule is: pick the **smallest**
engineering discipline that changes the decision, and don't bulk-load rule sets.

- **`engineering-quality-lens`** — the chooser. Start here when the work type is
  ambiguous; it selects the right lens below.
- **`tdd`** — behavior or a new feature slice, built through a public seam:
  one behavior at a time, public-interface tests, green validation.
- **`diagnose`** — bugs, regressions, flaky tests, or performance problems: a
  repro loop, ranked hypotheses, targeted instrumentation, regression test.
- **`architecture-review`** — shared contracts, domain modeling, or risky
  refactors of existing code: module depth, adapter boundaries, idempotency, the
  smallest behavior-preserving change with a safety net.
- **`code-structure`** — when work moves shared operational mechanics between
  actions and the service layer: actions own the "why/when", the service layer
  owns the "how", with explicit params and structured returns.

The lens is a review-and-implementation bias applied to the existing Goal and
validation surface, not a second source of truth. See
[`quality-lenses.md`](./quality-lenses.md) for the full lens-selection table and
[`code-review-guidelines.md`](./code-review-guidelines.md) for what the reviewer
(and the agent) flag on every diff. The `code-structure` gate in step 7 of the
loop is where the most common lens becomes a required check before reporting.

## Planning and Parallelism (the surrounding pieces)

- **Planning is repo-native.** `.claude/skills/prd-to-task-queue/SKILL.md`
  converts PRDs, specs, and product conversations into
  `implementation_plans/<plan>/` artifacts and `TASK_QUEUE.md` rows — **not**
  external trackers. The plan markdown is the source of truth.
- **Parallel PRs are optional.** Serial and stacked work needs no orchestrator at
  all — one branch, one loop. To run genuinely independent PRs *in parallel*
  (each needs its own working copy), use
  `.claude/skills/stacked-pr-orchestrator/SKILL.md`, which spins up an isolated
  working copy + session per PR (git worktrees + headless sessions, Conductor
  workspaces, paseo, or manual sessions) and sequences non-main integrations by
  dependency.

## Why This Design

- **Less machinery to maintain.** The PR/review/CI surface already tracks the
  state a board would. Removing the board, dispatcher, daemon, and status files
  removes the parts most likely to drift out of sync with reality.
- **One source of truth for "done."** The exit condition is observable from the
  PR itself, by a human or an agent, with one probe. There is no hidden state.
- **Composable and replaceable.** Harness, PR surface, and reviewer are each
  swappable. The only hard dependencies are "a PR that can be reviewed" and "a
  way to read the review" — both standard.
- **Safe by construction.** The merge/human-gate policy means the worst an
  unattended agent does is leave a clean, reviewable draft PR for a human. It
  never touches `main`, never spends money, never reaches the outside world.

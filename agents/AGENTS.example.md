<!-- A FILLED-IN example of agents/AGENTS.snippet.md for one concrete repo. Copy
     it, change the values to match your repo, and paste the result into your own
     AGENTS.md or CLAUDE.md. This file pins a hypothetical GitHub repo
     `<owner>/<repo>` on CodeRabbit, base `origin/main`, draft PRs via `gh`. Treat
     every value below as a placeholder to adjust, not a setting to keep. -->

## Autonomous / overnight work

Unattended implementation work follows `.claude/skills/overnight-agent-runbook/SKILL.md`:
pick one reviewable slice, own the branch through an agnostic code review, push to
your own task branch and open a draft PR for visibility. Continue through the next
launch-ready independent slice after each green/clean slice. If no row is
launch-ready, author the missing per-slice brief / Writes / Verify readiness
surface for the next best candidate, then implement it if the prep makes it
launch-ready. Stop only when no row can be implemented or made ready without
human-gated input that blocks all safe progress, or a human gate is hit. Do not
set a voluntary agent token/turn budget for overnight work; let provider/account
usage settings be the runtime limit. Human input is not automatically blocking:
prepare the decision packet, record reversible assumptions/options, and move to
independent work when possible. Correctness comes from the review loop, not a
coordination board.

"Continue overnight" means continue from durable branch/PR/task state, not from
one ever-growing chat transcript. After each green/clean slice, write a compact
closeout, push the branch, and start the next slice from a fresh agent session
when using Conductor or another UI-backed runtime. The next session re-orients
from the current branch/head, draft PR, task queue, committed per-slice brief,
and review/check probe output. This is transcript hygiene, not a token/turn
budget.

Use quiet overnight mode for unattended sessions. Do not stream routine agent
discussion, long logs, full diffs, repeated probe output, or step-by-step
narration into chat. The durable log is the branch, commits, draft PR, task rows,
briefs, and validation artifacts. Surface only compact evidence needed by the
goal evaluator, blockers, and the final closeout.

Parallel/background orchestration also needs a runtime reliability profile. Before
spawning long-running implementation agents, apply `docs/runtime-reliability.md`:
raise or disable any background-agent no-progress watchdog, run cold builds/tests
via a background shell/task path whose logs can be polled, and share build caches
across worktrees. For Rust worktrees, set a local
`CARGO_TARGET_DIR=/path/to/repo/.shared-cargo-target` and pre-warm it. If a
socket/API error loses the transcript, resume from durable branch/PR/task state
and re-run `scripts/agent-signals.sh origin/main`.

There is no kanban board, dispatcher loop, polling daemon, or required status
file. Do not build one. Select work directly from the task queue / work-forward
key, claim a row by setting `IN-PROGRESS` + `Owner` before coding, and report
closeout in the final response.

### The two signals, one probe

Drive every iteration off `scripts/agent-signals.sh origin/main`. It gathers both
feedback signals — **code review** (CodeRabbit when requested, or internal
review) and the **GitHub Actions checks** (required-check signal) — and prints
one verdict line:

```bash
scripts/agent-signals.sh origin/main
# ... per-signal detail ...
# SIGNALS  ci=pass  coderabbit=not-requested  internal=clean  review=clean
# SLICE READY WHEN: review=clean (CodeRabbit or internal reviewer) AND ci=pass -> current head is ready.
# CAMPAIGN CONTINUATION: the goal/task queue decides whether to claim the next row, readiness-prep, or stop.
```

Each turn: run the probe, **classify** every finding (`actionable | invalid |
duplicate | blocked | out-of-scope`), fix only the valid actionable ones plus any
failing check, push a new head — which re-runs CI and any requested review — then
re-probe. Repeat until `review=clean AND ci=pass` and the required approvals
exist. Knobs: `SIGNALS_REVIEW_SOURCE=auto|app|cli`,
`SIGNALS_INTERNAL_REVIEW_COMMAND`, `SIGNALS_CLI_REVIEW_LOG`,
`SIGNALS_CODERABBIT_LABEL`, and `SIGNALS_SKIP_REVIEW=1`. If `cli` is used in an
unattended run, set `SIGNALS_CLI_REVIEW_LOG=.context/coderabbit-cli-review.log`
so finding bodies survive interruptions.

## Project configuration

This repo is **`<owner>/<repo>`** on GitHub. The values below are pinned once
here so an unattended agent never has to guess them.

| Knob | Value |
|---|---|
| Base branch | `origin/main` (any non-main base also works — set it once) |
| Remote / PR surface | GitHub `gh`, **draft PRs only** (packaged signals probe); Azure DevOps / GitLab / local-only require a custom signals probe |
| Review tool | Fresh independent reviewer by default; CodeRabbit App by `coderabbit-ready` label; `cr` CLI only when deliberate |
| Quality lens source | `docs/quality-lenses.md` |
| Task source of truth | `implementation_plans/<plan>/TASK_QUEUE.md` |

Open work as a draft PR against the base and let the loop run:

```bash
git switch -c feat/<slice-id>-<slug>
gh pr create --draft --base main --fill
scripts/agent-signals.sh origin/main
```

### Quality lens

Pick the smallest engineering discipline that changes the decision (see
`docs/quality-lenses.md`); do not bulk-load every rule set. Use
`engineering-quality-lens` to choose, then `tdd` for new behavior via a public
seam, `diagnose` for bugs / regressions / flaky / perf, `architecture-review` for
shared contracts or risky refactors, and `code-structure` for the actions ↔
service-layer boundary. State the lens in the Goal prompt:

```md
Engineering quality lens:
- Work type: feature
- Primary skill: tdd
- Rule lens: APoSD
- Test seam: domain service
- Quality gate: green unit + integration suite, no public-contract change
```

## Boundaries

Agents may merge/integrate only agent-owned non-`main` branches after green gates
(CodeRabbit clean **and** CI pass **and** required approvals).

**Human-gated — stop and wait:** merge / complete / squash / fast-forward a PR to
`main` or any protected base; a non-draft PR targeting `main`; bypassing branch
policies or required checks; deleting branches; rewriting history; changing or
rotating credentials; mutating approval-sensitive cloud resources; touching real
client data; spending money; external sends. Mainline landing is **always**
human-gated — the agent never merges `main`.

## Going unattended

Make the loop persist with your harness's Goal feature or a scheduled re-prompt,
seeded with the six-field contract (Outcome, Verification surface, Constraints,
Boundaries, Iteration policy, Blocked stop):

```text
/goal <owner>/<repo> has the next launch-ready slice from
implementation_plans/<plan>/TASK_QUEUE.md merged into its agent-owned
integration branch, with the main-targeted draft PR left ready for a human

verified by scripts/agent-signals.sh origin/main printing
"SIGNALS ci=pass ... review=clean" with required approvals present

while preserving the public API contract and the green test suite.

Base: origin/main. Remote/PR: GitHub gh, draft PRs only.
Review: fresh independent reviewer by default; CodeRabbit App threads only when the PR is marked `coderabbit-ready`.
Iterate: re-probe, classify findings, fix valid actionable ones, push, re-probe.
Boundaries: merge/integrate only agent-owned non-main branches after green gates;
keep main landing, history rewrite, credentials, and external sends human-gated.
If blocked, record the decision packet + reversible assumptions and move to the
next independent ready or readiness-prep slice. No voluntary token/turn budget.
```

- **Claude Code ≥ 2.1.139** or **Codex**: `/goal <contract>` (native persistence).
- **Older Claude Code**: the `/loop` skill, a Stop hook, or cron re-sends the same
  contract until the exit condition holds.

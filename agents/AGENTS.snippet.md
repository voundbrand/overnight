<!-- Paste this section into your repo's AGENTS.md or CLAUDE.md and fill the knobs
     table. It points agents at the overnight runbook and states that there is no
     board/dispatcher model, so nobody rebuilds one. A filled-in version is in
     AGENTS.example.md. -->

## Autonomous / overnight work

Unattended implementation work follows `.claude/skills/overnight-agent-runbook/SKILL.md`:
pick one reviewable slice, own the branch through an agnostic code review, push to
your own task branch, and open a **draft** PR for visibility. **The pull request and
its review drive the agent** — the PR's review state is the work queue; there is no
separate review thread. Continue through the next launch-ready independent slice
after each green/clean slice. If no row is launch-ready, author the missing per-slice
brief / Writes / Verify readiness surface for the next best candidate, then implement
it if the prep makes it launch-ready. Stop only when no row can be implemented or made
ready without human-gated input that blocks all safe progress, or a human gate is hit.
Do not set a voluntary agent token/turn budget for overnight work; let
provider/account usage settings be the runtime limit. Human input is not automatically
blocking: prepare the decision packet, record reversible assumptions/options, and move
to independent work when possible. Correctness comes from the review loop, not a
coordination board.

"Continue overnight" means continue from durable branch/PR/task state, not from one
ever-growing chat transcript. After each green/clean slice, write a compact closeout,
push the branch, and start the next slice from a fresh agent session when using a
UI-backed runtime (e.g. Conductor). The next session re-orients from the current
branch/head, draft PR, task queue, committed per-slice brief, and the
`scripts/agent-signals.sh` probe output. This is transcript hygiene, not a token/turn
budget.

Use quiet overnight mode: do not stream routine agent discussion, long logs, full
diffs, repeated probe output, or step-by-step narration into chat. Keep durable
state in commits, the draft PR, task rows, briefs, and validation artifacts.
Surface only compact evidence needed by the goal evaluator, blockers, and the
final closeout.

Parallel/background orchestration also needs a runtime reliability profile. Before
spawning long-running implementation agents, check `docs/runtime-reliability.md`:
raise or disable any background-agent no-progress watchdog, run cold builds/tests via
a background shell/task path whose logs can be polled, and share build caches across
worktrees (for Rust, set a local `CARGO_TARGET_DIR=/path/to/repo/.shared-cargo-target`
and pre-warm it). If a socket/API error loses the transcript, resume from durable
branch/PR/task state and re-run `scripts/agent-signals.sh`.

When using a scheduled orchestrator heartbeat, run the local preflight before
waking an agent:

```bash
npm run plan:orchestrator:preflight -- --plan <plan-slug>
```

If your queues are not under `implementation_plans/`, also pass
`--plans-root <plans-root>`. The preflight writes
`.context/implementation-plan-orchestrator-state.json` and prints one verdict:
`NO_ACTION_REQUIRED`, `ACTION_REQUIRED`, or `BLOCKED`. Do not spend a Codex,
Claude, OpenCode, or other harness message on `NO_ACTION_REQUIRED`; only invoke
the orchestrator for `ACTION_REQUIRED`, and make it read the state JSON first.

Each turn, gather both feedback signals with one probe — `scripts/agent-signals.sh
[base]` (default base `origin/main`) — which reads code review and CI checks and
prints a `SIGNALS ci=… coderabbit=… internal=… review=…` line plus the exit
condition.
Classify each finding (actionable | invalid | duplicate | blocked | out-of-scope);
fix only the valid actionable ones plus any failing check; push a new head; repeat
until `review=clean` and `ci=pass` and required approvals are present.

Request CodeRabbit deliberately, not on every push: add the configured
`coderabbit-ready` label or keyword only after local/row validation passes and
the head is ready for final integration, touches high-risk shared/security/runtime
code, or needs an independent pass after internal-review concerns. Do not request
it for early WIP, docs-only readiness prep, format-only fixes, or branches still
failing local validation.

Do not treat transcript-only CodeRabbit CLI output as durable overnight review
evidence. If the CLI is used, run it through `scripts/agent-signals.sh` with
`SIGNALS_REVIEW_SOURCE=cli` and
`SIGNALS_CLI_REVIEW_LOG=.context/coderabbit-cli-review.log`, or use an internal
reviewer command that saves full output and has a trustworthy exit status. If a
CLI pass is interrupted after printing only `findings=N`, request hosted
CodeRabbit or rerun once with durable capture instead of spending repeated
uncaptured reviews.

There is no kanban board, dispatcher loop, polling daemon, or required status file.
Do not build one. Select work directly from the task queue, claim a row by setting
`IN-PROGRESS` + `Owner` before coding, and report the closeout in the final response.

Project configuration (fill these in):

| Knob | Value |
|---|---|
| Base branch | `origin/main` |
| Remote / PR surface | `GitHub gh` (draft PRs only; packaged signals probe) — or Azure DevOps / GitLab / local-only with a custom signals probe |
| Review tool | `fresh independent reviewer by default; CodeRabbit App by coderabbit-ready label; cr CLI only when deliberate` |
| Quality lens source | `docs/quality-lenses.md` |
| Task source of truth | `implementation_plans/<plan>/TASK_QUEUE.md` |
| Orchestrator preflight | `npm run plan:orchestrator:preflight -- --plan <plan-slug>` |

Agents may merge/integrate only agent-owned **non-`main`** branches after green
gates. Human-gated (stop and wait): merge/complete a PR to `main` or any protected
base, create a non-draft PR targeting `main`, bypass policies, modify protected
branches, delete branches, rewrite history, change credentials, mutate
approval-sensitive cloud resources, touch real client data, spend money, or send
external communications.

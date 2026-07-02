<!-- Paste this section into the target repo's AGENTS.md or CLAUDE.md and fill the
     table. It points agents at the overnight runbook and states the retirement
     of any board/dispatcher model so nobody rebuilds it. -->

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

There is no kanban board, dispatcher loop, polling daemon, or required status
file. Do not build one. Select work directly from the task queue / work-forward
key, claim a row by setting `IN-PROGRESS` + `Owner` before coding, and report
closeout in the final response.

Project configuration:

| Knob | Value |
|---|---|
| Base branch | `<origin/main>` (any non-main base also works) |
| Remote / PR surface | `<GitHub gh (default) / Azure DevOps az repos / GitLab / local-only>` (draft PRs only) |
| Review tool | `<CodeRabbit cr / fresh reviewer session / both>` |
| Quality lens source | `<docs/quality-lenses.md + .claude/skills/ or equivalent>` |
| Task source of truth | `<implementation_plans/<your-plan>/TASK_QUEUE.md>` |

Agents may merge/integrate only agent-owned non-main branches after green gates.
Human-gated (stop and wait): merge/complete PR to `main` or protected base,
non-draft PR targeting `main`, bypass policies, protected branches, delete
branches, rewrite history, change credentials, mutate approval-sensitive cloud
resources, real client data, spend money, external sends.

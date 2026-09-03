<!-- Paste this section into the target repo's AGENTS.md and fill the table. If
     the repo also has CLAUDE.md, keep that file as a small Claude-specific
     overlay pointing back to AGENTS.md. This snippet points agents at the
     overnight runbook and states the retirement of any board/dispatcher model
     so nobody rebuilds it. -->

## Normal Conductor / local-agent work

For human-steered work, default to a bounded local loop: branch or worktree
isolation, explicit write surfaces, focused local `Verify`, clean diffs, and a
draft PR once the head is coherent. Do not run strict signal probes, request
CodeRabbit, post durable evidence markers, or ACK/classify every PR comment on
each intermediate push unless the manifest explicitly selects unattended or
high-assurance mode for that head.

Before presenting a PR as ready to land, switch to certification: reconcile to
the recorded parent, push the exact head, require hosted CI for that head/base,
obtain exact-head review, run the repo's strict signal probe if it has one, and
resolve or classify human feedback. Local integration trains are diagnostic only;
they may find conflicts and run combined local suites, but they do not make a
branch landable.

## Cloud worker lanes

Use cloud sessions as disposable Linux workers for slices that can run from
pushed Git source plus synthetic fixtures. They are useful for parallel progress
and for work that should continue while the local machine sleeps. They do not
inherit local dirty files, browser state, Docker Desktop, private network access,
or credentials.

The local controller defines the exact parent, branch, `Outcome`, `Writes`,
`Verify`, `Depends`, and `Must not` boundaries; the cloud worker implements that
bounded slice, runs local Linux verification, pushes a branch or draft PR, and
leaves a compact closeout. The local controller fetches worker heads, performs
local integration trains or local-only checks, and owns final certification and
human landing gates.

## AGENTS.md / CLAUDE.md hygiene

Treat `AGENTS.md` as the shared contract across Codex, Claude Code, Cursor Agent,
OpenCode, and other coding agents. If the repo also has `CLAUDE.md`, keep it
small: it should point to `AGENTS.md` and contain only Claude-specific
exceptions. Shared workflow, safety, review, and queue rules belong in
`AGENTS.md` or mirrored skills under every harness directory the repo uses.

Keep copied instruction files lean. They are always-on onboarding context, not
append-only runbooks. Put only day-one repo context, commands, conventions that
matter, human gates, and mistakes agents repeatedly make.

Use skills for procedures, verification recipes, review rubrics, scripts, and
long reference material. Use hooks, pre-push guards, or CI for hard rules that
must be enforced. Use local ignored files for personal or branch-specific notes.
Imports may organize a long instruction file, but they still load into context,
so they do not reduce the amount the agent reads.

When this snippet is copied into a new project, delete project-specific examples,
branch names, deployment URLs, stale queue paths, and any rule you cannot justify.
Rules should be specific, checkable, and name the replacement behavior.

## Autonomous / overnight work

Unattended implementation work follows `.agents/skills/overnight-agent-runbook/SKILL.md`
or the mirrored `.claude/skills/overnight-agent-runbook/SKILL.md`:
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
| Quality lens source | `<docs/quality-lenses.md + .agents/skills/ and mirrors, or equivalent>` |
| Task source of truth | `<implementation_plans/<your-plan>/TASK_QUEUE.md>` |

Agents may merge/integrate only agent-owned non-main branches after green gates.
Human-gated (stop and wait): merge/complete PR to `main` or protected base,
non-draft PR targeting `main`, bypass policies, protected branches, delete
branches, rewrite history, change credentials, mutate approval-sensitive cloud
resources, real client data, spend money, external sends.

---
name: stacked-pr-orchestrator
description: Optional layer for running MULTIPLE PRs at once. The per-PR engine (decompose, draft PR, loop on CodeRabbit comments to approved+green, never merge to main, allowed non-main integration) lives in overnight-agent-runbook and needs no orchestrator for serial/stacked work. Use this only to run independent PRs in parallel — it starts one native agent thread/session per PR in the human-selected harness, each with its own isolated working copy, and sequences non-main integrations by dependency.
---

# Stacked PR Orchestrator (optional — for parallel PRs)

The agentic coding loop is **per-PR and self-contained**: a thread opens a draft
PR and loops on its review state until approved + green, with **CodeRabbit as the
recursive reviewer** (it re-reviews on every push) and the agent's persistence
loop (native Goal feature or a scheduled re-prompt) keeping it going. That is all
in `.claude/skills/overnight-agent-runbook/SKILL.md`. **Serial or stacked work
needs nothing more** — one session runs the engine through the stack, filing the
next PR after each allowed non-main integration or after leaving a main-targeted
PR ready for human merge.

Reach for this skill **only when you want several independent PRs in flight at the
same time.** The single reason that needs orchestration: one git checkout can hold
only one branch, so N parallel PRs need N isolated working copies. This skill is
the thin layer that creates those and sequences merges. It is **not** a daemon,
not tied to any host app, and it does **not** relay review findings (CodeRabbit
does the reviewing on each push).

## The orchestrator is live and human-prompted

It is **a live agent you create by prompting** — not a fixed script or a
deterministic state machine. You stand one up by prompting an agent to run the
flow and reshape it mid-run by prompting again. **The shape stays flexible.**
Treat everything below as a default to adapt. Fixed invariants only: the PR + its
CodeRabbit comments drive the work, state is read from live PRs (not a board),
and `main`/protected-base merges stay human-gated.

> Default shape (adapt it): decompose → for each ready piece { isolated working
> copy → a session runs the per-PR engine (drafts the PR, loops on CodeRabbit
> comments to approved+green) → reintegration into the recorded non-main parent
> branch or main-targeted
> draft PR left ready for a human → next piece }, with parallel pieces running
> concurrently and a periodic check advancing the stack.

## Mechanism: native harness agent spawning

A "thread" is an **isolated working copy + a native harness agent session**
running the per-PR engine. Prefer the harness's own agent/thread spawning
surface, so lifecycle, logs, cancellation, closeout, and review state stay inside
the same runtime model:

The human operator must choose the active harness before orchestration starts
(for example Codex, Claude, OpenCode, or a future supported harness). The
orchestrator then prompts only that harness's native agent/session surface for
the slice. Do not mix harnesses inside one orchestration run unless the human
explicitly changes the selected harness for a new slice or stack; otherwise the
orchestration can fight itself through conflicting session state, tool policies,
logs, and closeout semantics.

| Harness | Working copy/session boundary | Agent spawning surface | Periodic check |
|---|---|---|---|
| **Codex** | one isolated thread/session per PR | Codex native agent threads | Codex Goal / native continuation |
| **Claude** | one isolated workflow-agent session per PR | Claude workflow agents / native harness spawning | `/loop`, Stop hook, or native scheduled continuation |
| **OpenCode** | one isolated session per PR | OpenCode native sessions / primary agents and subagents | OpenCode native session continuation or scheduler |
| **Future harnesses** | one isolated session container per PR | that harness's native agent-spawn primitive | that harness's native continuation primitive |

Each session is seeded with `template/prompts/implement-piece.md` and runs the
per-PR loop itself (reading CodeRabbit comments as input). The orchestrator does
not micromanage a session's review loop and should not mix in an external agent
spawner when the selected harness already has native agent spawning. It also must
not translate prompts between harnesses mid-run. It only
allocates/records the isolated working copy boundary, sequences dependencies,
gates merges, and advances.

Treat native agent-thread sessions as per-slice execution containers. After a
slice reaches green/clean and its branch state is pushed, start the next ready
slice in a fresh native session context instead of reusing the same transcript
indefinitely. The durable state is the branch, draft PR, task queue, committed
brief, and review/check output; the chat history is not the state store.

## Phase 1 — Decompose into a PR stack

Use `template/prompts/decompose.md`. Produce:

1. **A PR stack**: ordered pieces, each one reviewable PR with a single verifiable
   final state. Mark each **stacked** (depends on a prior PR landing) or
   **parallel** (independent). Default to stacked when files overlap; parallelize
   only truly independent pieces.
2. **Dependencies & landing order**: what each piece branches from. A stacked
   piece branches off the previous piece's branch (or off base after it merges); a
   parallel piece branches off base. Record this parent branch/ref for every
   piece; it is the branch the piece must integrate back into when green.
3. **An HTML plan per piece** via `implementation-plan-wiki` (or a `TASK_QUEUE.md`
   row/plan doc). This is the seed each session reads.

Optionally keep a scratch note (e.g. `.context/pr-stack.json`:
`[{ id, title, planPath, base, dependsOn, status }]`) so a periodic check can
re-orient. It is convenience memory, not a board — the source of truth is the live
PRs (`gh pr list` / `az repos pr list`).

## Phase 2 — Run the ready pieces

For every piece whose dependencies are merged (parallel pieces run at once):

1. **Isolated working copy/session boundary** on the correct base (latest base for
   first/parallel; the previous branch for a stacked piece) — via the selected
   harness's native session model.
2. **Start a fresh session** there seeded with `implement-piece.md` for this piece. It
   runs the per-PR engine: drafts the PR, loops on CodeRabbit comments to
   approved + green, using its native Goal feature or a scheduled re-prompt. A
   larger piece may run **multiple native harness agents in the one working
   copy** (e.g. a frontend/backend split) converging on the piece's PR.
3. **Let it run.** CodeRabbit reviews each push automatically; the session
   consumes those comments. You do not spawn a reviewer or relay findings. (Only
   add a separate reviewer via `review-pr.md` if you want a second opinion beyond
   CodeRabbit.)
4. **Merge gate**: when the PR is approved + green, merge/integrate the worker
   branch back into its recorded parent branch only if that parent is an
   agent-owned non-main branch. If the parent/target is `main`/protected base,
   leave it draft/ready and stop for a human for that landing.
5. **Advance**: after an allowed parent-branch integration, or after recording
   that a main-targeted PR is ready for human landing, pull the updated parent
   and start the next ready dependent piece from that fresh parent state. Clean up
   the finished working copy when it no longer needs review.

## Phase 3 — Advancing the stack (optional periodic check)

The only cross-PR coordination is "PR merged → start the next ready piece." That
trigger can be:

- **Human**: you merge and tell the orchestrator to continue.
- **Agent-files-next**: a session, on its merge, kicks off the next piece.
- **Periodic check**: the harness's native continuation mechanism (`Goal`,
  `/loop`, Stop hook, scheduled wakeup, or equivalent native scheduled agent) that
  every few minutes reconstructs state from live PRs (not memory), detects merges,
  starts the next ready piece, and surfaces blockers. Stop it when all pieces are
  merged or a blocker needs a human. The periodic check should seed new native
  harness sessions from live PR/task state rather than reopening old large
  transcripts.

Pick the lightest native continuation path that fits. None is required for a
serial stack, but long-running serial stacks should still roll over to a fresh
native session at slice boundaries.

### Long-running validation

Use the selected harness's native agent-thread spawning surface. If a harness has
a separate generic background-agent mode with a known idle watchdog, do not use
that generic mode for long implementation pieces unless the environment is
configured for long-running tool calls. Prefer a normal native session whose own
loop owns the implementation and validation.

For expensive validation, use the harness's reliable long-running task primitive
or a background shell task with retrievable output, then resume from durable
state if the host session dies: `git status`, task row, branch/PR head, and the
repo's review/check probe.

## Human gates

Sessions may: create working copies, implement, push their own task branch, open
and update **draft** PRs, and merge/integrate agent-owned non-main branches after
review/check gates pass. A human must gate: merging/completing anything into
`main`/`origin/main` or another protected base, non-draft PRs targeting `main`,
bypassing policies, protected branches, deleting branches, history rewrite,
credential changes, cloud mutation, real client data, spend, and external sends.

Default is **main stays human**. Even if a user asks for automatic continuation,
never bypass failing checks or branch policy and never merge to `main`.

## When a piece is blocked

If a session surfaces a real blocker (missing decision, credential, unavailable
service, an upstream piece that must land first), mark it blocked with the exact
input needed, leave its branch clean, and **advance to the next independent ready
piece**. Never guess past a gate. If no independent piece is ready, report the
blocker and stop.

## Porting

1. Ensure the target repo has a review surface (CodeRabbit app/CLI), the per-PR
   skill `overnight-agent-runbook` (+ `pr-review-loop`, `implementation-plan-wiki`,
   quality skills), and *some* way to make isolated working copies + sessions (any
   row in the mechanism table).
2. Set the base branch and PR surface (`gh` vs `az repos`) in the seed prompts.

Do not restore any board/dispatcher/polling-daemon machinery — the PR stack plus
live review state is the only coordination layer.

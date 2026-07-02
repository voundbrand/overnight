---
name: overnight-agent-runbook
description: Run implementation work unattended/overnight with a review-driven PR loop. The agent picks one reviewable slice, owns its branch through an agnostic code review (CodeRabbit CLI or a fresh independent reviewer), may integrate agent-owned non-main branches after green gates, never merges to main, and reports a structured closeout. Replaces the retired kanban/dispatcher/polling model. Use when prompting an agent to work autonomously against a task queue or implementation plan.
---

# Overnight Agent Runbook

This is the operating model for running implementation work **unattended**
(overnight, or any time without a human in the loop), built on top of code
review instead of a coordination board.

**The driver is the pull request and its review.** The earlier model used a
kanban board plus a dispatcher loop and polling daemons (`branch-kanban/`,
`auto-dispatch-loop.mjs`, generated board data, required `.context/agent-status.md`
status files). That is **retired**. Do not restore it, and do not treat
`implementation_plans/CODEX_GOALS.md` as the standard — it is a kanban-era
artifact. The current model is:

> An agent opens a draft PR early, then loops on review feedback: it fetches the
> unresolved code-review findings and PR comments, addresses the valid actionable
> ones, pushes a new head, requests a fresh review, and repeats until no
> actionable comments remain and validation is green. The PR's review state is
> the work queue. Merging to `main` stays human-gated; agent-owned non-main
> branch integration is allowed after green gates.

This skill is the portable, canonical runbook. It builds on `AGENTS.md`
(workspace/git rules) and `.claude/skills/pr-review-loop/SKILL.md` (review mechanics).
When porting to another repo, copy `template/` (see "Porting").

## Configure For Your Project

The model is provider-agnostic. Pin these once per repo:

| Knob | Aktoria value | Notes |
|---|---|---|
| Base branch | `origin/beirut` | The comparison/merge target. Never assume `main`. |
| Remote / PR surface | Azure DevOps (`az repos`) | Or GitHub (`gh`), GitLab, or local-only. Draft PRs only. |
| Review tool | CodeRabbit CLI (`cr --agent --base <base>`) | Any reviewer works: a CLI reviewer, a fresh agent session, or both. |
| Quality lens source | `docs/quality-lenses.md` + `.claude/skills/` | How to pick TDD / diagnose / architecture / code-structure. |
| Task source of truth | `implementation_plans/<plan>/TASK_QUEUE.md` | Branchability lives in the row Notes + the per-slice brief (`WORK_FORWARD_KEY_*.md` only if the plan actually has one). |
| Escalation policy | record blocker + exact input, move to next independent slice | See "When Blocked Overnight". |

## Size The Work First

Before coding, decide the shape — it depends on the size of the feature and the
blast radius of the change, not a line count. Use the saved
`template/prompts/decompose.md` prompt. Outcomes:

- **One PR** when a single reviewer can hold it in their head and it has one
  verifiable final state.
- **A stack of PRs** when there is a natural sequence (contract → behavior → UI)
  or later pieces depend on earlier ones landing.
- **Parallel PRs** when pieces are genuinely independent (no shared files).

A **thread is the unit of execution, and it is flexible**: it can run a single
agent, or **multiple agents in tandem** (e.g. an implementer plus a paired
reviewer, or a frontend/backend split), and it can carry **one PR or a stacked
sub-sequence**. Implementation-plan work defaults to a continuing overnight run:
after a slice reaches green/clean, pick the next launch-ready independent slice.
If none is launch-ready, switch to readiness-prep mode: author the missing
per-slice brief / Writes / Verify surface for the next best candidate, then
implement it if that prep makes it launch-ready. Human input is not automatically
blocking: the agent should prepare the decision packet, record reversible
assumptions/options, and move to the next independent row unless the missing
decision makes all safe implementation or readiness-prep impossible. Stop for
"no ready work" only when no candidate can be implemented, made ready, or
advanced with a documented reversible assumption. Pick the smallest shape that
still gives each PR one clean review. Split further if any piece would touch more
than ~3 high-risk shared files or has more than one final state.

## Session Hygiene And Rollover

Do not make a single chat transcript the durable state of an overnight run. The
durable state is the branch, draft PR, task row, commits, validation output, and
review/check state. Agent sessions are disposable execution containers.

After each slice is green/clean and pushed, close that slice with a compact
closeout and start the next slice from live repo/PR state. In UI-backed runtimes
such as Conductor, **start a fresh agent session before claiming the next row by
default**; do not keep one Conductor tab accumulating every tool call across many
slices. The new session should re-orient from:

1. the current branch and remote head,
2. the draft PR URL and `scripts/agent-signals.sh <base>` (or the repo's
   equivalent),
3. the task queue row statuses and any committed `OVERNIGHT_<ID>_*.md` brief,
4. the last slice closeout / commit message.

This is not a voluntary token or turn budget. It is transcript hygiene to avoid
large local session stores, slow renderers, and resume loops that replay thousands
of old tool messages. If a runtime cannot automatically spawn a new session, the
agent must still keep output compact, avoid dumping long logs/diffs into chat,
write bulky diagnostics to files, and pause after a green slice with a precise
restart prompt for the next fresh session.

### Quiet overnight mode

In Conductor and other UI-backed runtimes, overnight sessions should run quiet by
default. Do not stream routine agent discussion, step-by-step narration, full
diffs, long logs, or repeated raw probe output into chat. The durable log is the
branch, commits, draft PR, task queue row, committed brief, and validation
artifacts; chat is only the control surface.

During normal progress, emit only compact evidence needed to keep the goal loop
honest: the current head/PR when it changes, the `SIGNALS ...` verdict line or a
short validation summary, blockers, and the slice closeout. If a provider's goal
evaluator requires transcript-visible proof, surface the smallest stable summary
that proves the state instead of pasting raw command output. Put bulky diagnostic
details in files or PR comments and reference them from the closeout.

## The Engine: A PR Comment Loop

However many agents or PRs a thread carries, each PR is driven the same way: loop
on its review state until approved + green. **CodeRabbit is the recursive
reviewer** — it re-reviews automatically on every push (PR app/webhook), or the
agent runs `cr` itself each turn (CLI). Either way the PR comment thread is the
message bus and the shared state; you do **not** spawn a separate review thread.
Serial/stacked work needs no orchestrator at all. To run several PRs *in parallel*
(each needs its own working copy), see the optional
`.claude/skills/stacked-pr-orchestrator/SKILL.md`.

1. **Open a reviewable PR early.** Establish the branch (don't rename it to match
   a suggested name), make a coherent first head, then open a **draft** PR.
   ```bash
   git status --short --branch
   git fetch origin
   git diff --stat <base>...
   git rev-parse --short HEAD
   ```
   Implement with the smallest quality lens that changes the decision
   (`engineering-quality-lens`; `tdd` for behavior through a public seam,
   `diagnose` for bugs, `architecture-review` for shared contracts/risky
   refactors). Don't bulk-load rule sets.
2. **Fetch the review state.** Pull every unresolved signal for the current head:
   code-review findings (CodeRabbit CLI or a fresh independent reviewer) **and**
   human PR comments / review threads / required checks / reviewer votes.
3. **Classify each comment** (see "The Review Loop Is Agnostic"): actionable,
   invalid, duplicate, blocked, out-of-scope.
4. **Address valid actionable comments**, validate the changed area, commit
   focused fixes. No drive-by refactors. If feedback is entirely
   invalid/duplicate/out-of-scope, make no noise commit and record why.
5. **Push the new head** to your own task branch. A new SHA invalidates the prior
   review — it must be re-reviewed.
6. **Repeat 2–5 until the exit condition:** no unresolved actionable comments,
   required checks pass, and the PR has the approvals its policy requires. Keep it
   bounded — usually two passes clear a head; continue only for major/critical
   findings or newly added comments.
7. **Code-structure gate.** If the work moved shared operational mechanics
   between actions and services, run `code-structure` before reporting; otherwise
   record `code-structure: not applicable (<reason>)`.
8. **Close or advance the slice.** If the PR targets `main`/the protected base,
   leave it draft/ready for a human. If the target is an explicitly
   agent-owned non-main integration or stack branch, merge/integrate the worker
   branch back into that original parent branch after review/check gates are
   green and conflicts are resolved. Then continue to the next launch-ready
   independent slice in autonomy-mode. If no slice is launch-ready, perform
   readiness-prep on the next best candidate instead of stopping.

Stop the loop (don't guess) when the exit condition is met, when a comment is a
blocker needing a human-gated decision/action (record it with the exact input
needed), when no independent slice can be implemented, made ready, or advanced
with a documented reversible assumption, or when you'd have to touch a surface
another in-progress branch owns.

## Autonomy Engine: A Persistence Loop (tool-agnostic)

What makes a thread keep working unattended is a **persistence loop**: an
after-each-turn check that re-continues the thread until the PR's exit condition
holds, instead of stopping after one turn. This is tool-agnostic — use whatever
your agent runtime provides:

- **A native Goal feature**, if your tool has one. The two documented below are
  Codex `/goal` and Claude Code `/goal`; both run an after-each-turn evaluator and
  continue automatically. Prefer this when available.
- **A scheduled re-prompt** otherwise — a cron job, a `/loop`, or a Stop hook that
  re-sends the same contract every N minutes until the exit condition holds.

Either way the condition is the same contract (below). The review side may be
automatic (CodeRabbit or another app re-reviews marked heads) or explicit (a fresh
independent reviewer command/session runs on each pushed head). Each turn still
needs fresh review evidence to act on.

The persistence loop must respect session rollover. For a single slice, it may
re-continue the same session until that slice is green/clean or blocked. When the
slice is complete, the next iteration should be a fresh session seeded from the
branch/PR/task state above, especially in Conductor or any runtime that stores and
renders the full transcript locally. Keep every loop iteration quiet unless it is
reporting compact evidence, a blocker, or a closeout.

Write every Goal as the same **contract** (the structure behind the prompt
library and the six-field standard below):

| Field | For an implementation thread |
|---|---|
| Outcome | The current piece is approved + green, and the thread then advances through the next launch-ready pieces; if none is launch-ready, it creates the missing readiness brief/backfill for the next candidate and proceeds when ready. |
| Verification surface | Review clean (CodeRabbit/reviewer), required checks pass, required approvals present. |
| Constraints | What must not regress (contracts, security posture, tests). |
| Boundaries | Owned files, base branch, allowed tools/providers; never merge or push to `main`/protected base. |
| Iteration policy | Each turn, address the latest unresolved review comments / failing checks, push, request re-review; after green/clean, integrate the worker branch back into its recorded parent only when that parent is an allowed agent-owned non-main branch, or leave protected/main-targeted PRs ready for a human, then claim the next launch-ready row or create the missing readiness brief/backfill. |
| Blocked stop | A human-gated action, no row can be implemented/made ready/advanced with a reversible assumption, or missing input that blocks all safe progress — report exact need and stop. |

### Codex (`codex/*`)

`https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex`.
Seed the full six-field `/goal`; Codex continues from idle and the evaluator can
check against concrete evidence (files, tests, logs, artifacts). Do not set a
voluntary token/turn budget unless the user explicitly asks for one; let the
provider/account usage cap be the runtime limit. Respect: **evidence-based
completion** (never "looks done") and **plan-only turns don't continue** (make
real progress each turn). Commands: `/goal`, `/goal pause|resume|clear`.

### Claude Code (`claude/*`)

`https://code.claude.com/docs/en/goal.md` (needs Claude Code ≥ v2.1.139, workspace
trust, hooks enabled). `/goal <condition>` sets a completion condition; after each
turn a small fast model (Haiku) decides yes/no and the thread keeps working until
yes. One goal per session; `/goal` to check, `/goal clear` to stop.

Key difference — **the evaluator only judges what is in the transcript; it does
not run commands or read files.** So phrase the condition as something the agent
*demonstrates in-conversation*: it must run the check and surface compact evidence
each turn, such as one `SIGNALS ...` verdict line plus any blocker summary. Good:
"PR `<url>` has all required checks green, no unresolved review comments, and
required approvals — shown by running `scripts/agent-signals.sh <base>` or
`gh pr view --json statusCheckRollup,reviewDecision,reviews` and summarizing the
review/check verdict in this conversation." Name the constraints that must not
change and pair with **auto mode** so tool calls run unattended. Do not include
`stop after N turns` unless
the user explicitly asks for a bounded run. Condition limit: 4,000 chars. Works headless:
`claude -p "/goal …"`.

## Selecting The Next Slice (no dispatcher)

There is no board or dispatcher choosing work for you. Select directly:

1. Read `TASK_QUEUE.md` (status/owner/priority); branchability and serial/parallel
   guidance live in the row Notes + any per-slice brief (a `WORK_FORWARD_KEY_*.md`
   only if the plan actually has one — most do not).
2. Skip rows that are `DONE`, `DEFERRED`, `BLOCKED`, or `IN-PROGRESS` owned by
   another workspace/branch. Reconcile ownership before touching an `IN-PROGRESS`
   row — never duplicate it.
3. Prefer the highest-priority row that pulls toward a named product outcome and
   can land as one clean review.
4. Size the bundle by a single verifiable final state, not a row count:
   - **1 row** when it touches central API/authz/persistence/infra/migrations,
     shared types, layout/navigation, or needs provider approval.
   - **2–5 rows** when they form one feature slice with one validation surface.
   - **6–10 rows** only when mostly docs/tests/runbooks or tightly coupled under
     one integration branch.
5. If more than ~3 high-risk shared files would be touched, or ownership is
   unclear, **stop and split** (write a slice plan) instead of starting.

### Readiness-Prep Mode

If no row is launch-ready, do **not** treat "missing `OVERNIGHT_*` brief",
missing `Writes`, or missing `Verify` as a terminal blocker by itself. That is
prep work the overnight agent should do.

1. Pick the highest-priority candidate that is not `DONE`, `DEFERRED`, blocked by
   an unresolved product decision, blocked by another in-progress owner, or
   dependent on an unlanded row.
2. Gather the same context as implementation work: design doc, cited decisions
   and stories, and nearby contracts/fixtures.
3. Author `implementation_plans/<plan>/OVERNIGHT_<ID>_<slug>.md` with scope,
   acceptance criteria, governing decisions, owned files/Writes, Verify command,
   base branch, out-of-scope boundaries, risks, and blocked-stop conditions.
4. If the row needs durable queue backfill, update only that row's Notes with the
   brief path and any `Writes:` / `Verify:` entries the plan expects.
5. Commit and push the readiness-prep change, open/update a draft PR if useful,
   and run the review loop.
6. If the brief resolves readiness, proceed into implementation in the same
   autonomy run. If brief authoring exposes a missing decision, first decide
   whether a reversible assumption, decision packet, or smaller independent slice
   lets work continue safely. Mark/report a blocker only when the missing
   decision/credential/dependency prevents all safe implementation and
   readiness-prep for available candidates.

Only stop for "no ready work" after both direct implementation and readiness-prep
paths have been exhausted.

## Claiming And Status

Keep coordination lightweight; the branch + draft PR are the real signal.

- For multi-agent overnight runs, claim a row by setting its `Status` to
  `IN-PROGRESS` and `Owner` to your workspace/branch **before** writing code, so
  siblings skip it. This is the one routine queue write that prevents collisions.
- Otherwise follow the host repo's rule: update `TASK_QUEUE.md`/plan docs only
  when the task itself requires durable status/ownership/planning changes;
  report routine progress in the final response.
- Do not create handoff prompts or separate workspace status files for routine
  reporting. No `.context/agent-status.md` requirement.

## Parent Branch Integration

Every worker branch has a **recorded parent branch**: the branch/ref the worker
branched from and the branch/ref the slice must return to when it is green. This
is what keeps stacked local wiki/progress views honest: the parent branch should
receive the completed contract/docs/code/status updates before the next dependent
worker starts from it.

Before creating a worker branch:

1. Fetch remotes and identify the parent branch/ref. For a root slice this is the
   project base; for a stacked slice it is the previous agent-owned stack branch
   (for example `pp-10-inspector` before `codex/db-03-*`, then `codex/db-03-*`
   before `codex/db-04-*`).
2. Record that parent in the slice brief, PR description, closeout, or row Notes
   when the plan has a durable place for it.
3. Branch the worker from that parent and target the draft PR at that same parent
   when the host supports non-main PR targets.

After the worker branch is review-clean and validation-green:

1. Re-fetch and update the parent branch/ref.
2. Integrate the worker branch back into the recorded parent only if that parent
   is an explicitly agent-owned non-main branch. Use the provider's normal PR
   merge flow or a local non-rewriting merge/fast-forward that preserves branch
   policy. Resolve conflicts on the worker/parent branch, rerun validation, and
   push the updated parent.
3. If the recorded parent is `main`, `origin/main`, or any protected base, do not
   integrate it yourself. Leave the draft PR ready with green evidence and stop
   for human landing.
4. Start the next dependent worker from the freshly updated parent branch, not
   from the stale pre-integration parent or from `main`.

## The Review Loop Is Agnostic

Defer to `pr-review-loop` for the mechanics. The provider does not matter:

- **CodeRabbit CLI** when available: `cr --agent --base <base>` (or `cr --plain`).
- **A fresh independent reviewer**: a separate agent session prompted only to
  review the exact head SHA, returning findings; the implementation session owns
  fixes. Use this for non-trivial branches, with or without CodeRabbit.
- **Durable evidence required overnight**: hosted PR review comments are durable
  by default; CLI output is not. If a CLI reviewer is part of the loop, save the
  full output to a file or PR comment before relying on it. For repos using
  `scripts/agent-signals.sh`, prefer `SIGNALS_REVIEW_SOURCE=cli` with
  `SIGNALS_CLI_REVIEW_LOG=.context/coderabbit-cli-review.log`, or configure an
  internal reviewer command whose exit status is a real clean/findings verdict.
- Classify every finding: `actionable` (fix + validate), `invalid` (explain, no
  change), `duplicate` (fix once), `blocked` (stop with exact input),
  `out-of-scope` (record follow-up). Fix only valid actionable findings; no
  drive-by refactors.
- Each fix is a new head → re-review that head. Bounded: two passes usually
  enough; continue only for major/critical actionable findings.

## Merge And Human Gates (hard line)

In unattended mode an agent **may**: commit to its own task branch, push that
branch, create/update a **draft** PR for visibility, and merge/integrate branches
it owns back into the recorded parent branch when that parent is an explicitly
non-main integration/stack branch and the review/check gates are green.

An agent **must stop and wait for a human** to: merge/complete a PR into
`main`/`origin/main` or any protected base branch, create a non-draft PR targeting
`main`, bypass branch policies, modify protected branches, delete branches,
rewrite history, change/rotate credentials, mutate
approval-sensitive cloud resources, use real client data, spend money, or send
external communications.

## When Blocked Overnight

A "blocker" is a precise reason no safe progress remains, even after trying a
smaller slice, readiness-prep, a documented reversible assumption, or the next
independent row. Missing human input is not automatically blocking. A product
decision usually becomes a decision packet plus a move to independent work; it is
blocking only when every available candidate depends on that decision. Missing
credentials, unavailable services, an upstream branch that must land first, or
any human-gated action above are blockers only for the work that actually depends
on them.

On a blocker, do **not** guess or work around the gate. Instead:

1. Record the blocker in the slice's closeout: what you attempted, the evidence
   gathered, the exact blocker, and the exact input/approval needed to resume.
2. Leave the branch in a clean, reviewable state (commit or stash intentionally;
   `git diff --check`).
3. If another **independent** ready or readiness-prep slice exists (no shared
   files, no dependency on the blocked one), move to it. Otherwise end the run
   with the blocker report. Never start work that depends on the blocked slice.

## Closeout Report

Every slice's final report includes:

- Slice shape: one branch, independent branches, or stacked sequence (+ landing
  order).
- Branch, base, latest local head SHA; latest remote head if pushed (else
  "local-only"); draft PR URL/ID if created.
- Meaningful files changed.
- Validation commands run and results.
- Review: tool/command run and result (or blocker if unavailable), independent
  reviewer + reviewed head SHA if used, and the finding-classification summary.
- Whether a fresh review (and any policy/check evaluation) ran for the latest head.
- Quality lens used, and `code-structure` result or `not applicable (<reason>)`.
- Unresolved risks, invalid findings, out-of-scope follow-ups, blockers.
- Recommended next step / next ready slice, and any human-gated next action.

## Prompt Library

The prompt to use is a saved asset, not improvised — pick the one that fits the
situation. The library lives in `template/prompts/` (plus the generic fill-in):

| Prompt | Use when |
|---|---|
| `template/prompts/decompose.md` | First. Decide one PR vs stack vs parallel, agents-per-thread, and which seed prompt each piece gets. |
| `template/prompts/implement-piece.md` | Seed an implementation thread for one piece; it files a draft PR and loops on review. |
| `template/prompts/review-pr.md` | Optional. Only when you want a second reviewer beyond CodeRabbit (CodeRabbit auto-reviews each push, so a separate review thread is usually unnecessary). |
| `template/goal-prompt.md` | Generic fill-in `/goal` contract when a piece doesn't match a specific prompt. |

Add project-specific prompts to `template/prompts/` as new situations recur, and
list them here. A good prompt encodes the contract so the agent never guesses:
end state, verification, scope, base, allowed tools, quality lens, review
expectation, human gates, and the blocked stop condition.

## Porting To Another Project

1. Copy the skill folder into the target repo's `.claude/skills/`.
2. Copy `template/AGENTS_SNIPPET.md` into the repo's `AGENTS.md`/`CLAUDE.md` and
   fill the configure-knobs table for that repo (base branch, PR surface, review
   tool, quality-lens source, task source of truth).
3. Use `template/goal-prompt.md` to write overnight prompts.
4. Pair with a review-loop skill (`pr-review-loop`) and quality skills
   (`engineering-quality-lens`, `tdd`, `diagnose`, `architecture-review`,
   `code-structure`). If the target repo lacks them, port those too.

Do not carry over deployment URLs, credentials, or any retired board/dispatcher
machinery.

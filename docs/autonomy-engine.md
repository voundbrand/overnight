# The Autonomy Engine

What makes a coding agent keep working unattended — overnight, across many slices —
is not a daemon, a dispatcher, or a coordination board. It is a **persistence loop**:
an after-each-turn check that re-continues the thread until the pull request's exit
condition holds, instead of stopping after one turn.

The recursion on the *review* side is already automatic: CodeRabbit re-reviews each
push and CI re-runs each head, so every turn has fresh signals to act on (see
**[docs/how-it-works.md](how-it-works.md)** and `scripts/agent-signals.sh`). The
persistence loop is the other half — the thing that keeps the agent *coming back* to
read those signals and fix the next finding until there is nothing left to fix.

This document explains the loop, the six-field contract that drives it, the two ways
to run it (a native Goal feature vs. a scheduled re-prompt), one important nuance for
Claude Code, and a ready-to-fill prompt.

---

## The persistence loop

> **Keep re-continuing the same thread until the PR's exit condition holds.**

The exit condition is always the same shape: **review clean AND required checks pass
AND required approvals present.** One probe gathers both feedback signals each turn:

```bash
scripts/agent-signals.sh [base]    # default base: origin/main
# → SIGNALS ci=… coderabbit=…  + the exit condition
```

Each turn the agent runs the probe, classifies any new findings (actionable /
invalid / duplicate / blocked / out-of-scope), fixes only the valid actionable ones,
pushes a new head — which re-triggers review and CI — and is re-continued. When the
condition finally holds, it leaves the `main`-targeted PR ready for a human to merge
(or integrates an agent-owned non-`main` branch), then advances to the next slice.

It is **tool-agnostic**. Use whatever your harness provides:

- **A native Goal feature**, if your tool has one (Codex `/goal`, Claude Code
  `/goal`). Both run an after-each-turn evaluator and continue automatically. Prefer
  this when available.
- **A scheduled re-prompt** otherwise — a `/loop` skill, a Stop hook, or cron — that
  re-sends the same contract every N minutes until the exit condition holds.

Either way the condition is the same six-field contract.

### Session hygiene / rollover

The durable state of an overnight run is the **branch, the PR, the task row, and the
commits** — never one ever-growing chat transcript. The persistence loop must respect
this:

- For a single slice, it may re-continue the *same* session until that slice is
  green/clean or blocked.
- When the slice is complete, push, record a compact closeout, and start the next
  iteration from a **fresh session** seeded from the branch/head, draft PR, task
  queue, committed per-slice brief, and the probe output. This matters especially in
  UI-backed runtimes (e.g. Conductor) that store and render the full transcript
  locally.

This is transcript hygiene, not a token budget — see the rule below.

---

## The six-field contract

Write every Goal as the same contract. The fields below are the standard; the table's
right column shows what each looks like for a concrete **implementation thread**.

| Field | For an implementation thread |
|---|---|
| **Outcome** | The current piece is approved + green, and the thread then advances through the next launch-ready pieces; if none is launch-ready, it creates the missing readiness brief/backfill for the next candidate and proceeds when ready. |
| **Verification surface** | Review clean (CodeRabbit / reviewer), required checks pass, required approvals present — demonstrated by running the probe and surfacing its output. |
| **Constraints** | What must not regress: public contracts, security posture, existing tests, performance. |
| **Boundaries** | Owned files, base branch, allowed tools/providers; **never merge or push to `main`/protected base**. |
| **Iteration policy** | Each turn, address the latest unresolved review comments / failing checks, push, request re-review; after green/clean, integrate only to an allowed non-`main` branch or leave the `main`-targeted PR ready, then claim the next launch-ready row or create the missing readiness brief/backfill. |
| **Blocked stop** | A human-gated action, no row can be implemented / made ready / advanced with a reversible assumption, or missing input that blocks all safe progress — report the exact need and stop. |

Two notes on the contract:

- **Outcome is a *state*, not a step list.** "All required checks green and no
  unresolved review comments on PR `<url>`" — not "fix the lint error, then add a
  test, then …". A step list ends; a state condition keeps the loop honest.
- **Blocked is not the same as stuck.** Human input is not automatically blocking:
  the agent prepares a decision packet, records reversible assumptions, and moves to
  the next independent ready (or readiness-prep) slice. It only *stops* when no row
  can be implemented, made ready, or advanced — or a real human gate is hit.

---

## Option A — native Goal feature

### Codex (`/goal`)

Seed the full six-field `/goal`. Codex continues from idle, and its evaluator checks
against concrete evidence — files, tests, logs, artifacts. Two rules it enforces that
work in your favor:

- **Evidence-based completion** — it will not call the goal done on "looks done."
- **Plan-only turns don't continue** — make real progress each turn.

```text
/goal <six-field contract>
# manage:  /goal pause | /goal resume | /goal clear
```

### Claude Code (`/goal`)

Requires **Claude Code ≥ 2.1.139**, workspace trust, and hooks enabled. `/goal
<condition>` sets a completion condition; after each turn a small fast model decides
yes/no, and the thread keeps working until yes. One goal per session — `/goal` to
check the current condition, `/goal clear` to stop. The condition limit is 4,000
characters. Pair it with **auto mode** so tool calls run unattended. It works
headless too:

```bash
claude -p "/goal <six-field contract>"
```

#### The Claude Code nuance (read this)

> **The Claude Code `/goal` evaluator only judges what is in the transcript. It does
> not run commands or read files.**

So the completion condition must be something the agent **demonstrates
in-conversation**: each turn it has to *run the probe and surface the output*, so the
evaluator can see the green signals. Phrase the condition around observable evidence,
not internal belief.

```text
# Good — demonstrable in the transcript:
/goal PR <url> has all required checks green, no unresolved review comments, and the
required approvals — shown each turn by running
`scripts/agent-signals.sh origin/main` (or `gh pr view --json
statusCheckRollup,reviewDecision,reviews`) and pasting the reviewer + check output
into this conversation. Never merge or push to main.

# Bad — the evaluator can't see this; it can't run anything:
/goal make the PR pass review and CI
```

Codex's evaluator *can* inspect files and artifacts, so it is less sensitive to this;
the demonstrate-in-transcript discipline is still good practice everywhere because it
also produces a readable audit trail.

---

## Option B — scheduled re-prompt

If your harness has no native Goal, get the same behavior by re-sending the contract
on a schedule until the exit condition holds:

- **A `/loop` skill** — re-run a prompt / slash command on an interval (or let the
  model self-pace).
- **A Stop hook** — when the agent stops, the hook re-injects the same contract,
  unless the exit condition is already met.
- **cron** — schedule a headless re-prompt every N minutes:

```bash
# Re-send the contract every 10 minutes until the PR is green + clean.
*/10 * * * * cd /path/to/your-repo && \
  claude -p "/goal <six-field contract>" >> overnight.log 2>&1
```

Whichever you pick, the *content* re-sent is identical to Option A: the same six-field
contract. The only difference is who pulls the trigger to re-continue.

---

## No voluntary token / turn budget

> **Do not set a voluntary token or turn budget for overnight work.**

An overnight run keeps working until one of these is true:

1. the stated **Outcome** condition is met,
2. no safe implementation or readiness-prep work remains,
3. a **human-gated** blocker is hit, or
4. the **provider/account usage cap** interrupts the run.

Let provider/account usage settings be the runtime limit — not a self-imposed "stop
after N turns" or "stop after N tokens." A premature budget is the most common reason
an unattended run quits with the queue half-done. Only add a bounded `stop after N`
clause if a human explicitly asks for a bounded run.

The session-rollover discipline above is **not** a budget. Starting a fresh session
after each green slice is transcript hygiene; it does not cap how much total work the
loop does across the night.

---

## Ready-to-fill goal prompt

Copy this, fill every `<...>`, delete the guidance, and paste it as the agent's task.
A blank left in any field is where an unattended agent will guess — so leave none.
This is the same template shipped at
`.claude/skills/overnight-agent-runbook/template/goal-prompt.md`.

```text
/goal <OUTCOME — the observable end state that must be true when done: e.g. "PR
<url> has all required checks green, no unresolved review comments, and the
required approvals" — not a list of steps>

verified by <VERIFICATION SURFACE — exact commands/evidence a reviewer can check
without trusting narrative: e.g. `scripts/agent-signals.sh origin/main`, named
tests, generated reports, task-row updates — surfaced in this conversation each
turn>

while preserving <CONSTRAINTS — what must not regress: public contracts, security
posture, existing tests, performance>.

Scope / Boundaries: include <TASK ROWS / FILES / WORKSTREAMS IN SCOPE>; exclude
<OUT OF SCOPE>. Base: <origin/main, or any non-main base — set once>. Remote/PR:
<GitHub gh (default) / Azure DevOps az repos / GitLab / local-only> — draft PRs
only. Use <ALLOWED TOOLS / PROVIDERS / DATA>. Never merge or push to
main/protected base.

Iteration policy: <each turn, run the probe, classify findings (actionable |
invalid | duplicate | blocked | out-of-scope), fix only valid actionable ones +
failing checks, push a new head to re-trigger review + CI; after green/clean,
integrate only an agent-owned non-main branch or leave the main-targeted PR ready,
then claim the next launch-ready row — or author the missing readiness brief for
the next candidate>.

Do not set a voluntary token/turn budget. Keep working until the Outcome is met, no
safe implementation or readiness-prep work remains, a human-gated blocker is hit, or
the provider/account usage cap interrupts the run.

Session hygiene: durable state is the branch/PR/task-row/commits, not this
transcript. After each green/clean slice, push, record a compact closeout, and (in
UI-backed runtimes like Conductor) start the next slice in a fresh session seeded
from the branch/head, draft PR, task queue, committed brief, and probe output.

Blocked stop: if blocked, report <ATTEMPTED PATHS>, <EVIDENCE GATHERED>, <THE
BLOCKER>, and <THE EXACT INPUT/APPROVAL NEEDED>, leave the branch clean, then move
to the next independent ready or readiness-prep slice. Stop only when no safe
progress remains, or a human gate is hit.
```

### Checklist before launching unattended

- [ ] Outcome is an observable state, not a task list.
- [ ] Verification commands are named and runnable, and surfaced in-transcript each turn.
- [ ] In-scope and out-of-scope rows/files are explicit.
- [ ] Base branch and PR surface are stated.
- [ ] Human-gated actions are named (never merge/push to `main`).
- [ ] Blocked stop names the exact input needed.
- [ ] No voluntary token/turn budget (unless a human asked for a bounded run).

---

See also: **[docs/how-it-works.md](how-it-works.md)** (the review loop and the
signals probe), **[docs/quality-lenses.md](quality-lenses.md)** (choosing the
engineering discipline per slice), and
`.claude/skills/overnight-agent-runbook/SKILL.md` (the canonical operating model).

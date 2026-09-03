# Overnight Goal Prompt (fill-in template)

Use this only for unattended or explicitly high-assurance execution. For ordinary
human-steered Conductor/local-agent work, use the same boundaries and `Verify`
commands, but do not wrap the session in `/goal` or require strict hosted
certification on every intermediate head.

Copy this, fill every `<...>`, delete the guidance comments, and paste it as the
agent's task. A blank left in any field is where an unattended agent will guess —
so leave none.

```text
/goal <DESIRED END STATE: the observable system/doc/platform state that must be
true when done — not a list of steps>

verified by <SPECIFIC EVIDENCE: exact tests, commands, generated reports,
screenshots, runbooks, or task-row updates a reviewer can check without trusting
narrative>

while preserving <CONSTRAINTS: what must not regress — invariants, security
posture, public contracts, performance>.

Scope: include <TASK ROWS / FILES / WORKSTREAMS IN SCOPE>; exclude <OUT OF
SCOPE>.

Base: <BASE BRANCH, e.g. origin/main>. Remote/PR: <PROVIDER, draft PRs only>.
Landing strategy: <one-pr | stacked-pr | per-slice-pr | single-integration-pr>.
Acceleration mode: <local-integration-train | none>. Local train:
<LOCAL BRANCH/WORKTREE, MERGE ORDER, COMBINED VERIFY, SPECULATIVE DEPENDENTS,
AND REAL PARENT REBIND RULE OR `not-applicable`>.

Use <ALLOWED TOOLS / PROVIDERS / DATA / BOUNDARIES>.

Unless the user explicitly requested a token or turn cap, do not set a voluntary
budget for this overnight run. Honor any explicit user-requested cap. Otherwise
keep working until the stated done condition is met, no safe implementation or
readiness-prep work remains, a human-gated blocker is hit, or the
provider/account usage cap interrupts the run.

Session hygiene: do not treat the chat transcript as durable state. After each
green/clean slice, push the branch, record a compact closeout, and in Conductor
or other UI-backed runtimes start the next slice in a fresh session seeded from
the branch/head, draft PR, task queue, committed brief, and review/check probe
output. If the runtime cannot spawn a new session automatically, pause with an
exact restart prompt instead of letting one transcript grow without bound.

Quiet overnight mode: do not stream routine agent discussion, step-by-step
narration, long logs, full diffs, or repeated raw probe output into chat. Use
commits, PR state, task rows/briefs, and validation artifacts as the durable log.
Surface only compact evidence needed by the goal evaluator, blockers, and the
final closeout.

Runtime reliability: before spawning parallel/background implementation sessions,
apply docs/runtime-reliability.md if present. Raise/disable any background-agent
no-progress watchdog for long agents, run cold builds/tests via a background
shell/task path whose logs can be polled, and share build caches across worktrees
(for Rust, set a local CARGO_TARGET_DIR and pre-warm it).

Engineering quality lens:
- Work type: <feature | bug | refactor | data-plane | runtime | UI | planning>
- Primary skill: <tdd | diagnose | architecture-review | code-structure | none>
- Rule lens: <DDD | APoSD | DDIA | Release It | Refactoring | WELC | Code Complete>
- Test seam: <API route | domain service | repository contract | UI journey | runbook evidence>
- Quality gate: <the specific validation/review evidence required>

Review: run <REVIEW TOOL, e.g. CodeRabbit `cr --agent --base <base>`> on each
changed head; add a fresh independent reviewer for non-trivial work. Agents may
merge/integrate only agent-owned non-main branches after green gates. Keep merge
to `main`/protected base, non-draft PRs targeting `main`, protected branches,
history rewrite, credentials, cloud mutation, real client data, spend, and
external sends HUMAN-GATED. If the manifest selects `local-integration-train`,
the controller may locally merge focused-Verify-green heads into the train and
run the named combined suite before pushing; this is diagnostic only and creates
no landing evidence. A dependent may start from the train only when explicitly
marked speculative, and must rebase or merge onto its recorded real parent before
certification.

Between iterations, <HOW TO CHOOSE THE NEXT ACTION: e.g. "inspect the next failing
test / next unmet acceptance criterion and make the narrowest change">.

If blocked, report <ATTEMPTED PATHS>, <EVIDENCE GATHERED>, <THE BLOCKER>, and
<THE EXACT INPUT/APPROVAL NEEDED>, leave the branch clean, then move to the next
independent ready or readiness-prep slice. Stop only when no safe progress remains.
```

## Checklist before launching unattended

- [ ] Done-means is observable, not a task list.
- [ ] Evidence/verification commands are named and runnable.
- [ ] Quiet overnight mode is explicit: no routine narration, long logs, full
      diffs, or repeated raw probe dumps in chat.
- [ ] In-scope and out-of-scope rows/files are explicit.
- [ ] Base branch and PR surface are stated.
- [ ] Landing strategy and acceleration mode are stated.
- [ ] Any local train has a merge order, combined Verify, speculative dependents,
      and rebind rules.
- [ ] Quality lens block is filled (skip only for tiny/docs-only work).
- [ ] Human-gated actions are stated.
- [ ] Runtime reliability is configured for long/background validation if needed.
- [ ] Blocked stop condition names the exact input needed.
- [ ] If `IN-PROGRESS` rows are in scope, ownership is reconciled first.

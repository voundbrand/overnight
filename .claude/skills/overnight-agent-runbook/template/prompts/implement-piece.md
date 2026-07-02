# Prompt: Implement one piece (files a draft PR, loops on review)

Seed an implementation thread with this once the shape is decided. The thread may
run one or more agents; it owns one piece (one PR or one stacked sub-sequence).

Seed this as the thread's native `/goal` (see the runbook's "Autonomy Engine").
On **Codex**, use the full contract below; completion is evidence-checked. On
**Claude Code**, set `/goal` with a condition the agent demonstrates in the
transcript — it must run `gh pr view --json statusCheckRollup,reviewDecision,reviews`
(or an explicitly configured provider-specific signals probe) and surface a compact
reviewer/check verdict each turn, since the evaluator only reads the conversation
— and run with auto mode. Do not add a `stop after N turns` clause or token budget unless the
user explicitly requests a cap; let provider/account usage settings be the
runtime limit. The heartbeat is the fallback only if a provider has no native goal. For Conductor or
another UI-backed runtime, do not run many completed slices through one long-lived
chat tab: after a slice is green/clean, push and close it out, then start the next
slice in a fresh session seeded from branch/PR/task state.

Before long validation or parallel/background launches, apply
`docs/runtime-reliability.md` if present. In particular, do not hide a cold build
inside one nested background agent call if the harness has a no-progress watchdog;
run it through a background shell/task path whose logs can be polled, and share
build caches across worktrees where possible.

```text
/goal Implementation-plan autonomy continues until all independent pieces in
scope are approved and green, or a human-gated blocker/no-work-can-be-made-ready
condition is reached. Human input is not automatically blocking: prepare decision
packets, record reversible assumptions/options, and move to independent work
unless the missing decision blocks all safe progress. For each piece, the
PR/review state is verified by a clean
review (CodeRabbit/reviewer), passing required checks, and required approvals,
while preserving <constraints: contracts, security posture, existing tests>.

Follow .claude/skills/overnight-agent-runbook/SKILL.md.
Piece: <title>. Plan: <HTML plan path / TASK_QUEUE rows>.
Base: <base branch, e.g. origin/main>. Branches off: <base or prior piece's branch>.
Boundaries: owned files <…>; out of scope <…>; allowed tools <…>.
Quality lens: <work type | primary skill | rule lens | test seam | quality gate>.

Plan, then iterate (after the first head, each turn addresses the latest review
state):
- Establish the branch (don't rename it to match a suggested name).
- Implement with the smallest quality lens that changes the decision.
- Open a DRAFT PR as soon as you have a coherent first head.
- Then loop on the PR's review state: fetch unresolved code-review findings and PR
  comments for the current head, classify each (actionable | invalid | duplicate
  | blocked | out-of-scope), fix only valid actionable ones, validate, commit
  focused fixes, push the new head, and request a fresh review of that SHA.
- Repeat until no unresolved actionable comments, required checks pass, and the PR
  has its required approvals.
- Run the code-structure gate if shared mechanics moved between actions/services.
- Then either leave any `main`/protected-base PR draft and ready for human merge,
  or merge/integrate only to an explicitly agent-owned non-main integration/stack
  branch after green gates.
- If more launch-ready independent rows remain in scope, claim the next one and
  continue the same loop from durable repo/PR state. In Conductor/UI-backed
  runtimes, roll over to a fresh session before claiming the next row unless the
  user explicitly asks to keep the same tab open.
- If no row is launch-ready, enter readiness-prep mode: author the missing
  `OVERNIGHT_<ID>_*.md` brief / Writes / Verify backfill for the next best
  candidate, commit/push it through the same review loop, and proceed into
  implementation if the prep makes the row launch-ready.
- Keep transcript output compact. Do not paste long logs, full diffs, or repeated
  probe output into chat; write bulky diagnostics to files and summarize the
  evidence in the closeout.
- Run in quiet overnight mode: no routine progress narration or agent discussion
  in chat. Use commits, PR state, task rows/briefs, and validation artifacts as
  the durable log. Surface only compact evidence needed by the goal evaluator,
  blockers, and the final closeout.

Human-gated (stop and wait): merge/complete PR to `main` or protected base,
non-draft PR targeting `main`, policy bypass, protected branches, branch deletion,
history rewrite, credentials, cloud mutation, real client data, spend, external
sends.

If blocked, report attempted paths, evidence, the blocker, and the exact input
needed; leave the branch clean; stop. Report closeout per the runbook.
```

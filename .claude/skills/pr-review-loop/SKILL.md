---
name: pr-review-loop
description: Agent-owned CodeRabbit review loop for implementation branches. Use when reviewing or fixing a branch before closeout, with or without a hosted pull request.
---

# PR Review Loop

Use this skill when an implementation branch needs review before closeout. Despite
the name, the default workflow is local-first and does not require a hosted code
review provider. The implementation agent owns the loop for its own branch.

Do not delegate review state to polling daemons or a separate review state
machine.

## Default Stance

- CodeRabbit CLI is the preferred review surface when available.
- A hosted pull/merge request is optional. The default hosted surface is GitHub
  via the `gh` CLI. Use it when the user wants visible PR discussion, CI checks,
  branch protection status, or a human merge gate. Azure DevOps (`az repos`) and
  GitLab also work if that is where the remote lives.
- An external issue tracker is optional for planning or follow-up issues. Do not
  use it as the review queue, comment source of truth, or clean/dirty verdict.
- Workspace status files are optional local coordination aids. Do not require
  them for routine reporting and do not store a review state machine in them.
- In unattended mode, agents may push commits to their own task branch and
  create or update draft PRs for visibility. Human approval is required to
  merge/complete PRs, bypass policies, modify protected branches, delete
  branches, rewrite history, or change credentials.
- Stop only when there are no valid actionable findings left, or when a precise
  blocker prevents progress.

## 1. Split First

Before implementation or review, ask whether the requested work should be:

- one focused branch;
- several independent branches that can run in parallel;
- a stacked sequence where branch two should start only after branch one lands.

If the work is too large for one clean review, write a short slice plan in the
final report or relevant plan doc. Do not create a central queue or automation
controller. Each slice should have its own branch, head SHA, validation, and
review loop.

## 2. Establish The Review Target

Start from the branch workspace. The default base is `origin/main`; any
non-main base works if the task says so:

```bash
git status --short --branch
git fetch origin
git diff --stat origin/main...
git rev-parse --short HEAD
```

If a hosted PR/MR/review request already exists, record its URL from the
provider or from the user. If no hosted review request exists and this is
unattended task work, creating a draft PR is allowed for visibility after the
branch has a coherent first head. Do not create non-draft PRs unless the user
explicitly asks.

Inspect or create visible PRs with the GitHub CLI when it is installed and
authenticated:

```bash
gh pr view
gh pr create --draft --base main --fill
gh pr checks
gh pr view --comments
```

If `gh` is unavailable or not authenticated, use the provider web UI if
available and report that CLI PR inspection was unavailable. Azure DevOps
(`az repos pr list|show|create`) and GitLab (`glab mr`) are equivalent
alternatives when the remote lives there. Existing configured credentials may be
used; do not create, rotate, or reconfigure credentials unless the user asks.

## 3. Run Or Read CodeRabbit

If CodeRabbit CLI is installed and authenticated, run it against the current
branch diff. Use `main` as the base unless the task says otherwise:

```bash
cr --agent --base main
```

Useful variants:

```bash
cr --plain --base main
cr --agent --type uncommitted --base main
cr review findings
cr doctor
```

If `cr` is unavailable, try `coderabbit` as the equivalent binary name. If
CodeRabbit is not installed or authenticated, record the blocker and use the
narrowest local validation available until the user provides review access.

If a hosted PR exists, also read unresolved comments, top-level review comments,
CI/check status, branch protection status, and reviewer votes. Use the provider
web UI or CLI available in the workspace; do not add a provider integration just
for this workflow.

## 4. Use A Fresh Reviewer When Useful

For non-trivial implementation work, use a fresh independent review pass after
the implementation head is ready. This can be:

- CodeRabbit CLI on the exact head SHA;
- a separate reviewer thread/session prompted only to review the branch;
- both, when the branch is risky.

The reviewer should inspect the diff and validation evidence, then return
findings only. The implementation session owns fixes. When the implementation
session commits a fix, that creates a new head and should trigger a fresh review
of that new head.

For tiny docs-only or metadata-only changes, CodeRabbit plus local validation is
enough unless the user asks for another reviewer.

## 5. Classify Each Finding

Make a short local checklist before fixing:

| Class | Meaning | Required action |
|---|---|---|
| actionable | Valid, in scope, and fixable in this branch | Fix it and validate. |
| invalid | Based on wrong facts or contradicted by code/tests | Do not change code; explain briefly in final report. |
| duplicate | Same root issue as another finding | Fix once; note duplicates. |
| blocked | Needs credentials, product decision, unavailable service, or unsafe action | Stop with blocker and exact next input. |
| out-of-scope | Real issue but not caused by this branch or too broad for this task | Do not fix; record follow-up recommendation. |

Fix only valid actionable findings. Avoid drive-by refactors and broad cleanup.

## 6. Fix, Validate, Commit

For each fix pass:

```bash
git diff --check
```

Run the narrowest relevant tests/checks for the changed area. Commit only the
intended changes:

```bash
git status --short
git add <focused files>
git commit -m "<scope>: address review feedback"
git rev-parse --short HEAD
```

If feedback is entirely invalid/duplicate/out-of-scope, do not make a noise
commit. Record why no code change was made.

## 7. Request Fresh Independent Review

After each changed head, request or run a fresh independent review:

- Local-first default: rerun `cr --agent --base main` or `cr --plain --base
  main` on the new head.
- In unattended mode, push the new head to the agent's own task branch and let
  CI/branch protection evaluate the draft PR. Recheck PR comments, policies, and
  reviewer votes before closeout.
- If the workflow explicitly forbids pushing, stop locally and report the head
  that needs review.
- Keep the loop bounded. Two CodeRabbit passes are usually enough: one to find
  issues, one to verify the fixes. Continue only for major/critical actionable
  findings.

Then reread CodeRabbit output and any external comments/checks. Repeat
classification and fix passes until no valid actionable findings remain.

## 8. Closeout Report

Final reports must include:

- Slice shape: one branch, independent branches, or stacked sequence.
- Review target: branch, base, latest local head, and optional hosted PR
  URL/ID.
- Latest remote head if pushed; if not, say the clean head is local-only.
- Draft PR URL/ID when created or updated.
- CodeRabbit command(s) run and result, or blocker if unavailable.
- Independent reviewer used, if any, and the reviewed head SHA.
- Other validation commands and results.
- Feedback classification summary.
- Unresolved risks, invalid findings, out-of-scope follow-ups, or blockers.
- Whether a fresh CodeRabbit pass and, if applicable, CI/branch protection
  evaluation ran for the latest head.

When the branch is clean and local validation is recorded, report whether it is
ready for review, ready to merge, or blocked according to the task's normal
closeout path.

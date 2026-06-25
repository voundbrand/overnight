# Quickstart — adopt Overnight in a GitHub repo

Get an unattended, review-driven PR loop running in your repo from zero. The driver
is the **pull request and its review**: an agent opens a draft PR early, then loops
— gather review signals, fix only valid findings, push a new head, re-probe — until
the reviewer is clean **and** CI passes **and** required approvals exist. No kanban
board, no dispatcher, no polling daemon. Merge to `main` stays human-gated.

Targets GitHub (`gh`) by default. Azure DevOps (`az repos`) and GitLab also work —
see step 5. Works with any harness (Claude Code, Codex, Cursor, OpenCode).

## Prerequisites

```bash
gh auth status        # GitHub CLI, authenticated
git --version
```

---

## 1. Install into your repo

Run the installer against the repo you want to automate. It copies `.claude/skills`,
`scripts/agent-signals.sh`, `docs/`, `.coderabbit.example.yaml`, and the `.github`
examples into the target.

```bash
./install.sh /path/to/your-repo
cd /path/to/your-repo
```

Verify the probe and skills landed:

```bash
ls .claude/skills/                      # overnight-agent-runbook, pr-review-loop, tdd, ...
test -x scripts/agent-signals.sh && echo "probe ready"
```

Move the CI and reviewer examples into place (rename to drop `.example`), then edit
to fit your stack:

```bash
cp .github/workflows/ci.example.yml .github/workflows/ci.yml
cp .coderabbit.example.yaml .coderabbit.yaml
# also available: .github/pull_request_template.md
```

---

## 2. Wire a reviewer

The loop needs a review signal. Pick **one** (CodeRabbit App is the recommended
default):

**Option A — CodeRabbit GitHub App (recommended).** Install it on the repo from
the [CodeRabbit dashboard](https://app.coderabbit.ai). On the Pro plan it posts
**credit-free, line-by-line** review threads that the probe reads directly via `gh`
— no local credits spent.

**Option B — CodeRabbit `cr` CLI.** Use when there is no PR yet, or you prefer
local review.

```bash
curl -fsSL https://cli.coderabbit.ai/install.sh | sh
coderabbit auth login
coderabbit review --agent --base main    # smoke test
```

**Option C — fresh-reviewer fallback (no CodeRabbit).** Skip the review signal in
the probe and have a separate, independent agent session review each head:

```bash
export SIGNALS_SKIP_REVIEW=1             # probe reports CI only
```

The probe auto-selects the source. Override with
`SIGNALS_REVIEW_SOURCE=auto|app|cli` (default `auto`: read the App's PR threads
once a PR exists, else run the CLI).

---

## 3. Point your agent at the runbook

Paste the snippet from `.claude/skills/overnight-agent-runbook/template/AGENTS_SNIPPET.md`
into the target repo's `AGENTS.md` (or `CLAUDE.md`) and **fill the knobs**. This
tells every agent session how to run the loop and what it must never do.

```bash
cat .claude/skills/overnight-agent-runbook/template/AGENTS_SNIPPET.md >> AGENTS.md
$EDITOR AGENTS.md                        # fill the table
```

A filled example:

```markdown
## Autonomous / overnight work

Unattended implementation work follows `.claude/skills/overnight-agent-runbook/SKILL.md`.

| Knob | Value |
|---|---|
| Base branch | `origin/main` (any non-main base also works) |
| Remote / PR surface | GitHub `gh` (draft PRs only) |
| Review tool | CodeRabbit App (Pro, credit-free) + `cr` CLI before first PR |
| Quality lens source | `docs/quality-lenses.md` |
| Task source of truth | `implementation_plans/checkout-v2/TASK_QUEUE.md` |
```

The snippet also states the human gates verbatim — merge/push to `main` or any
protected base, non-draft PRs targeting `main`, history rewrite, credential changes,
spending money, external sends, real customer data. The agent never crosses these.

---

## 4. Create a task queue

Work is selected directly from `TASK_QUEUE.md` — the PR's review state **is** the
work queue. Add a plan folder with a queue:

```bash
mkdir -p implementation_plans/checkout-v2
$EDITOR implementation_plans/checkout-v2/TASK_QUEUE.md
```

Copy the shape from `examples/implementation_plans/example_plan/` (queue rows plus a
per-slice brief). Each row is one reviewable slice with an ID, status, owner, and a
launch-ready brief covering scope, acceptance criteria, offline validation, and base
branch.

Have a PRD, spec, or design conversation instead of a queue? Convert it in-repo:

```text
Use the prd-to-task-queue skill to turn docs/checkout-prd.md into
implementation_plans/checkout-v2/ with a TASK_QUEUE.md.
```

This produces repo-native plan artifacts and queue rows — not external tracker
tickets. (`implementation-plan-wiki` can later build a static site from the plan for
humans.)

---

## 5. Start an implementation slice

Branch, then open a **draft PR early** so CI runs and the reviewer starts:

```bash
git checkout -b task/checkout-v2-validate-cart
# ... make the smallest reviewable change for one queue row ...
git add -A && git commit -m "checkout-v2: validate cart totals"
git push -u origin HEAD

gh pr create --draft --base main --fill
```

> **Other PR surfaces.** Azure DevOps:
> `az repos pr create --draft --source-branch $(git branch --show-current) --target-branch main`.
> GitLab: `glab mr create --draft --fill`. Set the base once via the
> snippet's *Base branch* knob; any non-`main` base also works.

---

## 6. Run the loop signals

One probe gathers **both** feedback signals — the CodeRabbit review and the GitHub
Actions checks — and prints the exit condition:

```bash
scripts/agent-signals.sh            # base defaults to origin/main
```

Read the verdict line:

```text
SIGNALS  ci=pass  coderabbit=clean
EXIT WHEN: coderabbit=clean (no actionable findings) AND ci=pass -> stop, report ready.
```

The agent's loop is: run the probe → for each finding, classify it
(**actionable / invalid / duplicate / blocked / out-of-scope**) → fix only valid
actionable ones → push a new head (which re-triggers review + CI) → re-probe.
Repeat until `coderabbit=clean AND ci=pass` and required approvals exist. Then it
records a compact closeout and stops. **It never merges to `main`.**

Useful knobs:

```bash
SIGNALS_SKIP_REVIEW=1 scripts/agent-signals.sh         # CI only
SIGNALS_REVIEW_SOURCE=cli scripts/agent-signals.sh     # force local CLI review
scripts/agent-signals.sh origin/release                # different base
```

---

## 7. Make it unattended

Hand the agent a persistence loop so it re-probes and continues without you. Use a
native Goal feature if your harness has one; otherwise schedule a re-prompt.

**Claude Code** (`/goal` needs >= 2.1.139; otherwise use the `/loop` skill):

```text
/goal Drive every launch-ready row in implementation_plans/checkout-v2/TASK_QUEUE.md
to a clean, green draft PR.
verified by scripts/agent-signals.sh reporting coderabbit=clean AND ci=pass per slice.
Base: origin/main. Remote/PR: GitHub gh, draft PRs only.
Do not set a token/turn budget. Merge to main stays human-gated. Stop only when no
row can be implemented or made launch-ready, or a human gate is hit.
```

**Codex:** the same six-field contract via `/goal`.

**No native Goal?** Use the `/loop` skill, a Stop hook, or cron to re-send the same
contract on an interval until the exit condition holds.

Fill the full six-field contract (Outcome, Verification surface, Constraints,
Boundaries, Iteration policy, Blocked stop) from the template at
`.claude/skills/overnight-agent-runbook/template/goal-prompt.md`. If no row is
launch-ready, the agent authors the missing brief instead of stopping; it stops only
when nothing can be implemented, made ready, or advanced with a documented reversible
assumption — or a real human gate is hit.

---

## What good looks like

- A draft PR per slice, reviewer clean, CI green, required approvals present.
- A compact closeout per slice; durable state lives in the branch/PR/queue, not the
  transcript.
- Between slices in a UI-backed runtime (e.g. Conductor — one example), start fresh:
  the next session re-orients from branch/PR/queue/brief/probe output.

## Next

- Quality lenses (pick the smallest discipline that changes the decision):
  [`docs/quality-lenses.md`](quality-lenses.md)
- Running several PRs at once is optional: see the `stacked-pr-orchestrator` skill.
  Serial/stacked work needs no orchestrator.

# FAQ

Short, direct answers. For the full model see
**[docs/how-it-works.md](how-it-works.md)**, **[docs/configuration.md](configuration.md)**,
and **[docs/autonomy-engine.md](autonomy-engine.md)**.

## Does it ever merge to `main`?

**No.** Mainline landing is always human-gated — that wall is the whole point.

Unattended, the agent **may**: commit and push to its own task branch; open and
update **draft** PRs; and merge or integrate branches **it owns** when the target
is a non-`main`, non-protected integration or stack branch with green gates.

It **must stop for a human** to: merge, complete, squash, fast-forward, or push
to `main` / any protected base; create a non-draft PR targeting `main`; bypass
branch policies or required checks; delete branches; rewrite history; change
credentials; spend money; send external communications; or touch real client data.

## Do I need CodeRabbit?

**No — but a reviewer is recommended.** Pick one:

- The [CodeRabbit](https://coderabbit.ai) **GitHub App** — credit-free
  line-by-line review on its Pro plan.
- The CodeRabbit **CLI** (`cr`) — local review before you push a PR.
- **A fresh independent reviewer session** — the no-CodeRabbit fallback. A clean
  agent session reviews the diff against `docs/code-review-guidelines.md`.

The loop only needs *some* review signal. Where it comes from is configurable
(`SIGNALS_REVIEW_SOURCE=auto|app|cli`, or `SIGNALS_SKIP_REVIEW=1` to lean on CI
alone).

## Which agent harnesses work?

It's **harness-agnostic**: **Claude Code**, **Codex**, **Cursor**, and
**OpenCode**. Skills in `.claude/skills/` are auto-discovered by Claude Code
(invoke as `/<name>`); other harnesses resolve them via the
`.claude/skills/...` paths referenced from `AGENTS.md`.

## Can it run multiple PRs in parallel?

**Yes, optionally.** The per-PR engine (decompose, draft PR, loop to clean +
green, never merge `main`) lives in
`.claude/skills/overnight-agent-runbook/` and needs **no orchestrator** for
serial or stacked work.

To run **independent** PRs at once, use
`.claude/skills/stacked-pr-orchestrator/` — it gives each PR an isolated working
copy and session and sequences non-`main` integrations by dependency. It's
tool-agnostic: git worktrees + headless sessions, Conductor workspaces, paseo, or
manual sessions.

## Does it need GitHub?

**No.** It's provider-agnostic. **GitHub (`gh`) is the documented default** with
draft PRs. **Azure DevOps (`az repos`)** and **GitLab** also work, and
**local-only** is supported for running the loop without a hosted PR. Set the PR
surface once in your `AGENTS.md` knobs table.

## How does it avoid runaway cost?

There's **no kanban, dispatcher, or polling daemon** burning tokens between turns.
Each turn runs one cheap probe (`scripts/agent-signals.sh`) that prints the
signals and the exit condition; the agent acts only on what the probe reports and
**stops the instant the exit condition holds** (reviewer clean **and** checks pass
**and** required approvals present).

Durable state is the branch / PR / commits — not one ever-growing transcript — so
each green slice can start from a **fresh session**, which keeps context small.
There is **no voluntary token or turn budget** for overnight work: let your
provider/account usage be the limit.

## Is there a kanban board or dispatcher?

**No — deliberately.** No board, no dispatcher, no polling daemon, no required
status files. Work is selected directly from a `TASK_QUEUE.md`, and the PR's
review state **is** the work queue. That coordination machinery is exactly the
part that drifts from reality and breaks at 3am, so it's gone. Don't restore it.

## What about secrets and safety?

Secrets are never committed and never read into the loop — `.env` and any keys
stay out of the package and out of agent context. The agent runs inside the
safety envelope above: it can iterate freely on its own branch but **cannot**
change or rotate credentials, mutate approval-sensitive cloud resources, spend
money, or send external communications without a human. Anything money-, data-,
or identity-sensitive is a hard human gate.

That safety envelope is about workflow, review, and merge authority. Git branches
and worktrees are not an OS-level sandbox: they isolate repository state, but they
do not stop a local agent process from reading files elsewhere on the machine.
If you need filesystem isolation, run the harness in a container or sandbox that
mounts only the project, or configure the harness's local permission controls.

## What is "readiness-prep"?

When **no task row is launch-ready**, the agent doesn't stop — it authors the
missing per-slice brief instead. That's an `OVERNIGHT_<ID>_<slug>.md` capturing
**scope, acceptance criteria, offline validation, governing decisions, owned
files, and base branch** — turning an under-specified row into one the loop can
execute.

It stops only when **no** row can be implemented, made ready, or advanced with a
documented reversible assumption — or a real human gate is hit. Human input
isn't automatically blocking: the agent prepares a decision packet, records a
reversible assumption, and moves to independent work.

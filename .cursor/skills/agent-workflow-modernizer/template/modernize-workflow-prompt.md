# Prompt: Modernize a repo's agent workflow

Use this in an existing project when you want the Overnight workflow without
copying package-demo branches, queue rows, or deployment details.

```text
Modernize this repository's agent workflow.

Goal:
- `AGENTS.md` is the shared cross-harness contract for Codex, Claude Code,
  Cursor Agent, OpenCode, and other coding agents.
- `CLAUDE.md`, if present, is a short Claude-specific overlay pointing back to
  `AGENTS.md`.
- Repeat procedures live in mirrored skills, not root instruction files.
- Normal human-steered work uses local Verify and draft PRs.
- Cloud sessions are Git-clean Linux workers.
- Hosted CI/review/signals are final certification gates for stable heads, not
  the default loop for every intermediate push.

Before editing:
1. Inspect Git state and preserve unrelated dirty files.
2. Read current `AGENTS.md`, `CLAUDE.md`, `.agents/skills`, `.claude/skills`,
   workflow docs, task queues/plans, and Conductor settings if present.
3. Identify the repo's base branch, PR provider, review tool, local Verify
   commands, human gates, and whether cloud sessions can run from pushed Git.

Make the smallest coherent changes:
- Clean `AGENTS.md` into the shared contract: commands, architecture map,
  normal mode, cloud worker lanes, local controller, local integration train if
  useful, certification mode, unattended mode, and human gates.
- Clean `CLAUDE.md` so it only points to `AGENTS.md` and keeps Claude-specific
  exceptions.
- Update or add reusable skills for overnight/autonomous work and PR review.
  Mirror `.agents` and `.claude` copies byte-for-byte unless the harness truly
  requires different frontmatter.
- Move long procedures out of root instruction files and into skills or workflow
  docs. Move hard enforcement to hooks, pre-push guards, CI, or branch
  protection. Do not invent product-specific process the repo does not use.
- Delete stale branch names, deployment URLs, old queue paths, local worktree
  paths, copied product facts, and any rule that is not specific and checkable.

Cloud-worker model:
- Local controller defines exact parent, branch, Outcome, Writes, Verify,
  Depends, Must not, and human gates.
- Cloud workers start from pushed Git, use synthetic fixtures, run Linux Verify,
  push branch/PR closeouts, and stop.
- Cloud workers do not use local dirty files, credentials, Docker Desktop,
  browser state, private network access, staging, production, or merge gates.
- Local controller fetches worker heads, runs local integration or local-only
  checks, and owns final certification and landing decisions.

Validate:
- `git diff --check`
- docs/Markdown checks available in the repo
- shell syntax checks for changed scripts
- byte parity for mirrored skill copies
- project-specific docs/site generation if instruction files feed generated docs

Report:
- Files changed
- What belongs in `AGENTS.md`
- What remains in `CLAUDE.md`
- Which skills were mirrored
- Validation run and results
- Any manual sync/commit/PR step still needed
```

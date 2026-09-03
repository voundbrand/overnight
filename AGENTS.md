# Overnight Agent Contract

## Orientation

Before changing code, docs, scripts, or packaged skills, read:

1. `README.md`
2. `docs/how-it-works.md`
3. `docs/configuration.md`
4. `docs/autonomy-engine.md`
5. `.agents/skills/agent-workflow-modernizer/SKILL.md`
6. the specific skill or doc you are editing

Fetch/prune before opening or updating a PR. Treat live GitHub PR state as newer
than local notes.

## Development Workflow

Use normal local-agent mode for ordinary human-steered work: one bounded branch,
focused edits, local verification, clean diffs, and a draft PR when the branch is
coherent. Do not spend the heavy overnight certification loop on every
intermediate push.

Use unattended/overnight mode only when the user asks for it or when a branch is
being certified as ready for downstream dependency or human landing. In that
mode, follow `.agents/skills/overnight-agent-runbook/SKILL.md`: exact head,
hosted CI where relevant, exact-head review, and a compact closeout.

Cloud sessions are disposable Linux worker lanes. They may work from pushed Git
source plus synthetic fixtures, then push a branch or draft PR. They do not
inherit local dirty files, browser state, private-network services, credentials,
or human-gated provider actions. The local controller owns final certification,
local-only checks, and landing decisions.

Local integration trains are diagnostic only. They can expose conflicts and run a
combined local suite before hosted CI is spent, but they do not make a branch
landable. Before landing, reconcile the branch to its real parent and run the
repo's certification path.

## Instruction Files And Skills

`AGENTS.md` is the shared contract for Codex, Claude Code, Cursor Agent,
OpenCode, and other coding agents. `CLAUDE.md` is only a Claude-specific overlay
that points back here.

Reusable procedures belong in skills, not root instruction files. Keep mirrored
skills byte-identical across `.agents/skills/`, `.claude/skills/`,
`.cursor/skills/`, `.grok/skills/`, and `.opencode/skills/` unless a harness
genuinely requires different frontmatter. Hard rules belong in scripts, hooks,
CI, or branch protection.

## Verification

For docs/skill changes, run the narrowest relevant checks:

```bash
git diff --check
bash -n install.sh scripts/agent-signals.sh
for h in .agents .claude .cursor .grok .opencode; do
  diff -qr .claude/skills "$h/skills" >/dev/null || exit 1
done
```

When a changed skill has a validator available, run it. For script behavior
changes, add or run the matching shell/Node checks before opening the PR.

## Safety

Draft PRs only. Never merge a PR, push to `main`/`origin/main`, bypass branch
protection, rewrite history, delete branches, change credentials, mutate external
provider resources, spend money, touch real client data, or send external
communications unless the user explicitly performs or approves that action.

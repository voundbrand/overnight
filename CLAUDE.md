# Claude Code Notes

Follow `AGENTS.md` first. This file is only the Claude-specific overlay for this
repo.

Claude Code discovers skills from `.claude/skills/`. The same skill content is
mirrored for other harnesses under `.agents/skills/`, `.cursor/skills/`,
`.grok/skills/`, and `.opencode/skills/`; keep those copies in sync when editing
packaged skills.

For unattended runs, prefer native `/goal` when available. The Claude goal
evaluator judges transcript-visible evidence, so surface compact verification
summaries instead of pasting long logs.

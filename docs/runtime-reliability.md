# Runtime Reliability

Overnight assumes sessions are disposable, but it still needs the underlying
agent harness to survive long implementation and validation runs. Parallel
orchestration is most fragile when a parent agent spawns background implementation
agents and those agents run a cold build as one long shell command.

## Background Agents And No-Progress Watchdogs

Many harnesses have an async-agent or no-progress watchdog. The watchdog usually
tracks agent-visible progress, not child-process stdout inside one long tool call.
That means a cold compile can be producing compiler output for minutes while the
nested background agent appears idle to the harness. If the idle window exceeds
the watchdog, the agent can be terminated with partial, uncommitted work and no
clean final report.

Treat this as a runtime reliability issue, not an implementation failure.

## Reliable Pattern

Use this pattern before running stacked or parallel Overnight work:

1. **Prefer durable sessions over nested background agents for implementation.**
   Let each implementation slice own a branch/worktree/session, then recover from
   branch, PR, task row, and probe output if the transcript disappears.
2. **Run long builds/tests through the harness's background shell/task facility,**
   not as the only activity inside a nested background implementation agent. Poll
   or read the command log between turns so the parent session remains active and
   can recover.
3. **Warm shared build caches before spawning parallel slices.** For Rust
   worktrees, point every worktree at one local target directory:

   ```bash
   export CARGO_TARGET_DIR=/path/to/repo/.shared-cargo-target
   cargo build -p <first-heavy-package>
   ```

   If your team uses `sccache`, enable it in the same local runtime config. Keep
   machine-local cache paths out of committed examples unless they are placeholders.
4. **Chunk or heartbeat validation that cannot be backgrounded.** Split very long
   validation into smaller commands, or wrap it with a heartbeat that emits
   agent-visible progress below the harness watchdog threshold.
5. **Resume after socket/API failures from durable state.** Do not rely on the
   final chat message as the only completion record. Commit useful work, push the
   branch, keep the draft PR current, and re-run `scripts/agent-signals.sh` after a
   fresh session starts.

If your harness exposes no watchdog configuration and no reliable background shell
log, assume cold builds inside nested background agents are unsafe. Use one
foreground implementation session per worktree, or have the orchestrator run the
first cold build itself before handing the warmed worktree to an agent.

## Known Claude Code / Conductor Knobs

These are runtime settings, not Overnight settings. Put them in the harness's
local config, shell profile, workspace settings, or secret/env facility. Do not
commit machine-specific absolute paths to a public repo.

| Variable | Purpose | Example |
|---|---|---|
| `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` | Raises the background subagent no-progress watchdog. Claude Code's documented default is `600000` ms. | `3600000` |
| `BASH_MAX_TIMEOUT_MS` | Allows long shell validations when the harness caps Bash calls. | `3600000` |
| `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` | Lets background shell output remain retrievable without an early wait ceiling, where supported. | `0` |
| `CLAUDE_CODE_RETRY_WATCHDOG` | Enables retry/watchdog behavior for transient provider or socket failures, where supported. | `1` |
| `CARGO_TARGET_DIR` | Shares Rust build artifacts across git worktrees. | `/path/to/repo/.shared-cargo-target` |

Example local profile:

```bash
export CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS=3600000
export BASH_MAX_TIMEOUT_MS=3600000
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0
export CLAUDE_CODE_RETRY_WATCHDOG=1
export CARGO_TARGET_DIR=/path/to/repo/.shared-cargo-target
```

Other harnesses use different names. The invariant is the same: raise or disable
the nested-agent no-progress watchdog for known-long work, run cold builds through
a command path whose output can be polled, and share build artifacts across
worktrees.

## Fresh Session Prompt

Use this when starting a new session whose job is to run or supervise parallel
Overnight orchestration:

```text
You are supervising Overnight orchestration in <repo>.

Before spawning parallel implementation slices, apply the runtime reliability
profile:

- Confirm the base branch, task queue, review surface, and human gates from
  AGENTS.md / CLAUDE.md.
- Confirm the harness has a persistence loop for unattended work: native Goal, a
  scheduled re-prompt, Stop hook, cron, or equivalent.
- Check whether the harness has a background-agent no-progress watchdog. If it
  does, raise/disable it for long implementation agents, or avoid nested
  background implementation agents for cold builds.
- Run long validation through the harness's background shell/task facility and
  poll/read logs between turns.
- Pre-warm shared build caches before spawning worktrees. For Rust worktrees, set
  CARGO_TARGET_DIR=/path/to/repo/.shared-cargo-target and run the first heavy
  cargo build/test from the orchestrator session.
- If a socket/API error or transcript loss happens, resume from durable state:
  branch, draft PR, task row, committed per-slice brief, and
  scripts/agent-signals.sh <base>.

Then claim only launch-ready, non-overlapping rows, give each slice its own
branch/worktree/session, open draft PRs early, and iterate on
scripts/agent-signals.sh until review is clean and CI passes. Never merge or push
to main/protected branches.
```

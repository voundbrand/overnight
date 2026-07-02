# Orchestrator Preflight

Scheduled orchestrators should not spend an agent message just to discover that
nothing changed. Run the local preflight first:

```bash
npm run plan:orchestrator:preflight -- --plan <plan-slug>
```

If your queues live outside `implementation_plans/`, pass the root explicitly:

```bash
npm run plan:orchestrator:preflight -- \
  --plans-root 000_implementation_plans_all \
  --plan crm_revamp
```

The script reads the plan's `TASK_QUEUE.md` plus scratch files under `.context/`:

- `CODEX_OFFLINE_ASSIGNMENT_*.md`
- `CODEX_OFFLINE_WORKER_CLOSEOUT_*.md`

It writes:

```text
.context/implementation-plan-orchestrator-state.json
```

and prints one line:

```text
NO_ACTION_REQUIRED reasons=none active=3/3 stale=0 pending_closeouts=0 next=G-06 cooldown=8m blocked=none
ACTION_REQUIRED reasons=completed_closeouts_pending active=2/3 stale=0 pending_closeouts=1 next=G-06 cooldown=0m blocked=none
BLOCKED reasons=none active=0/3 stale=0 pending_closeouts=0 next=none cooldown=0m blocked=no_offline_candidate
```

Automation policy:

- `NO_ACTION_REQUIRED`: stop locally; do not wake an agent.
- `BLOCKED`: surface the line to the human.
- `ACTION_REQUIRED`: wake the human-selected harness and make it read the state
  JSON before broad plan context.

Useful options:

```bash
--max-active 2
--stale-minutes 180
--spawn-cooldown-minutes 15
--ack-closeouts
--mark-launch
--json
```

After an orchestrator reconciles pending closeouts, run:

```bash
npm run plan:orchestrator:preflight -- --plan <plan-slug> --ack-closeouts
```

After it launches a worker, run:

```bash
npm run plan:orchestrator:preflight -- --plan <plan-slug> --mark-launch
```

The preflight state is scratch state. The canonical project truth remains the
task queue, commits, branches, draft PRs, reviews, and validation artifacts.

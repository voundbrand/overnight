# Task Tracker API — Task Queue

**Status:** ACTIVE
**Last updated:** YYYY-MM-DD
**Plan index:** [`INDEX.md`](INDEX.md)

This is an **example** queue. The three rows below show the column format and the
status values an agent reads. Replace them with your own rows.

## Conventions

- **Status:** `READY` (mechanically launch-ready) / `IN-PROGRESS` / `BLOCKED` / `DONE` / `DEFERRED`
- **Priority:** `P0` critical path / `P1` near-term / `P2` later / `P3` post-MVP
- **Owner:** `unassigned` until an agent or person claims the row (use the branch name).
- **Notes** carries the launch-ready data: `Brief:` path, `Blocked-by:` rows, `Owned files:` set, and the `Verify:` command.

A row is READY only when its brief exists, its decisions are Accepted, its
`Blocked-by` rows are DONE, and its `Owned files` set is disjoint from every
IN-PROGRESS row's. See [`INDEX.md`](INDEX.md) for the full Definition of Ready / Done.

## E — Task Model And Status Workflow
**Design doc:** [`DECISION_LOG.md`](DECISION_LOG.md) (D1, D2)

| ID | Task | Status | Priority | Owner | Notes |
|---|---|---|---|---|---|
| E-01 | Define the Task model and status enum | READY | P0 | unassigned | Add the `Task` type (`id`, `title`, `description`, `assignee_id`, `status`, `project_id`) and a `TaskStatus` enum (`todo`/`doing`/`done`). Brief: `OVERNIGHT_E-01_example_slice.md`. Cites: D1, D2. Blocked-by: none. Owned files: `src/models/task.*`, `src/models/index.*`. Verify: `<your test runner> test task_model` exits 0; repo gate green. |
| E-02 | Add the status-transition validator | IN-PROGRESS | P0 | feature/E-02-status-transitions | Enforce `todo → doing → done`; reject illegal jumps (e.g. `todo → done`) with a typed error. Cites: D2. Blocked-by: E-01. Owned files: `src/services/task_status.*`. Verify: `<your test runner> test status_transition` exits 0, including the negative cases; repo gate green. |
| E-03 | Expose `PATCH /tasks/:id/status` endpoint | DONE | P1 | feature/E-03-status-endpoint | Route validates the transition through the E-02 service, returns the updated task or `409` on an illegal transition. Cites: D2, D3. Blocked-by: E-02. Owned files: `src/routes/tasks.*`. Verify: `<your test runner> test tasks_status_route` exits 0; PR reviewer clean + CI green at the recorded head. |

## Notes on the format

- One row = one reviewable slice. If a row is too big to review in one PR, split it.
- The `Owned files` set is what keeps parallel agents from colliding — keep it disjoint per IN-PROGRESS row.
- A DONE row records the evidence in Notes (the passing `Verify`, and that the PR reviewer was clean and CI green at a specific commit).
- Replace `<your test runner>` with the real command for your stack (for example a single test invocation plus your repo's format + lint + test gate).

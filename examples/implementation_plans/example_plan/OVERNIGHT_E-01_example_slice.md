# Overnight brief — E-01: Task model and status enum

> Example per-slice brief. One brief makes one `TASK_QUEUE.md` row launch-ready for
> an unattended agent. Copy this shape for your own slices.

## Row

`E-01 | Define the Task model and status enum`

## Base

`origin/main`

> `origin/main` is the documented default base. Any non-`main` integration base
> also works (for example a stacked feature branch) — set it once here so the agent
> opens its PR against the right target.

## Context

The example task-tracking API needs a `Task` type and a `TaskStatus` enum before any
status-transition logic (E-02) or status endpoint (E-03) can be built. This slice
adds only the data model and the status values — no validation, no routes.

Governing sources:

- [`DECISION_LOG.md`](DECISION_LOG.md) D1 (a task belongs to exactly one project), D2 (linear status workflow).
- [`TASK_QUEUE.md`](TASK_QUEUE.md) E-01 row.

## Scope

- Add a `Task` model with fields: `id`, `title`, `description`, `assignee_id`
  (nullable), `project_id` (non-null, per D1), and `status`.
- Add a `TaskStatus` enum with exactly three values: `todo`, `doing`, `done`.
- Export the new types from the models module so E-02 and E-03 can consume them.
- Add a focused unit test that constructs a `Task` and round-trips its status value.

## Acceptance Criteria

- `Task` has a non-nullable `project_id` (D1) and a `status` typed as `TaskStatus`.
- `TaskStatus` has exactly the three documented values and a stable serialized form (`"todo"` / `"doing"` / `"done"`).
- The model is exported and importable by other modules.
- The new unit test passes; no transition logic is added here (that is E-02).

## Offline Validation

This slice validates entirely offline — no network, no live services.

```bash
<your test runner> test task_model
```

Then run the repo-wide gate (substitute your stack's commands):

```bash
<your format check> && <your linter> && <your test runner> test
```

Both must exit 0 against committed code before the row can be DONE.

## Governing Decisions

- **D1** — `project_id` is non-null.
- **D2** — the enum values are exactly `todo` / `doing` / `done` (the transition rules themselves are E-02, not this slice).

## Owned Files / Writes

- `src/models/task.*`
- `src/models/index.*` (only to export the new types)

> Keep this set disjoint from every IN-PROGRESS row so parallel agents don't collide.

## Out Of Scope

- Status-transition validation — that is **E-02**.
- The `PATCH /tasks/:id/status` route — that is **E-03**.
- Persistence/migrations beyond what the model itself declares.
- Authorization and project-membership checks.

## Risks

- Over-reaching into transition logic. Stop at the model + enum; let E-02 own the rules.
- Adding a fourth status (for example `blocked`) without a decision. That needs a new `Dxx` first.

## Blocked-Stop Conditions

- Stop if another owner already claims `src/models/task.*` with conflicting changes.
- Stop if implementing the model requires a schema/decision that is not yet Accepted in `DECISION_LOG.md` (prepare a decision note and move to independent work).
- Stop and surface a human gate before anything that would touch `main`, credentials, money, external sends, or real user data.

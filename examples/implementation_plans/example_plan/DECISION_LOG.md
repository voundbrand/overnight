# Task Tracker API — Decision Log

**Status:** ACTIVE
**Last updated:** YYYY-MM-DD

Append-only product and architecture decisions for the example task-tracking API.
Rows in [`TASK_QUEUE.md`](TASK_QUEUE.md) cite these by id (`D1`, `D2`, ...). Never
edit a decision in place once it is Accepted — supersede it with a new one.

This is an **example** with two illustrative decisions. Replace them with your own.

---

## D1 — A Task Always Belongs To Exactly One Project

**Date:** YYYY-MM-DD
**Status:** Accepted

**Decision:** Every `Task` carries a non-null `project_id`. There are no
project-less ("inbox") tasks in the MVP.

**Consequence:** The data model can enforce ownership and authorization through
the project, and queries can scope by project without a special case. A future
"personal inbox" would be modeled as a real project, not a null.

---

## D2 — Task Status Is A Linear Workflow, Validated Server-Side

**Date:** YYYY-MM-DD
**Status:** Accepted

**Decision:** A task moves through `todo → doing → done` in order. The only legal
transitions are `todo → doing` and `doing → done` (plus an explicit `doing → todo`
reopen). Any other change (for example `todo → done`) is rejected with a typed
error, and the rule is enforced in a single server-side service — not in the
client and not duplicated across routes.

**Consequence:** The status transition has one authoritative seam to test
(behavior-first, including the negative cases), and clients cannot skip states.
If the workflow later needs branching (for example a `blocked` state), it
supersedes this decision rather than scattering new `if` checks across routes.

---

> Format note: keep decisions short and outcome-focused — what was decided and
> what it forces downstream. The "Consequence" line is what makes a decision
> testable and makes its task rows reviewable.

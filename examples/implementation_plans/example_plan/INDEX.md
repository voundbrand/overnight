# Task Tracker API — Implementation Plan

**Status:** ACTIVE
**Date created:** YYYY-MM-DD

This planning package is a generic **example** that ships with Overnight so you can
see the implementation-plan format. The example product is a small **task-tracking
web API**: users, projects, tasks, and a status workflow. Replace the contents with
your own product — keep the structure.

> This is a skeleton. The rows, decisions, and brief below are illustrative, not a
> real backlog. Swap in your own scope before pointing an agent at it.

## Files

- [`INDEX.md`](INDEX.md) — **START HERE.** This file: what the plan covers and how the pieces fit.
- [`TASK_QUEUE.md`](TASK_QUEUE.md) — the implementation workstreams and rows. The PR review state of each row IS the work queue.
- [`DECISION_LOG.md`](DECISION_LOG.md) — append-only product and architecture decisions (`Dxx`). Rows cite these.
- [`OVERNIGHT_E-01_example_slice.md`](OVERNIGHT_E-01_example_slice.md) — a worked per-slice brief: scope, acceptance criteria, offline validation, governing decisions, owned files, base branch.

Per-slice briefs are named `OVERNIGHT_<ID>_<slug>.md` and live alongside this file.
One brief makes one task row launch-ready for an unattended agent.

## How an agent uses this package

The driver is the **pull request and its review**, not a kanban board. A row is
picked from `TASK_QUEUE.md`, the agent opens a draft PR early, then loops on review
signals (reviewer findings + CI checks via `scripts/agent-signals.sh`) until the
reviewer is clean, checks pass, and required approvals exist. See the Overnight
README and the `overnight-agent-runbook` skill for the full loop.

## Scope

The example API covers:

- **Users** — create an account, authenticate, fetch the current user.
- **Projects** — a named container that owns tasks; each project has one owner.
- **Tasks** — title, description, assignee, and a status (`todo` / `doing` / `done`).
- **Status workflow** — a task moves `todo → doing → done`; illegal transitions are rejected.

Out of scope for the example: real auth providers, billing, notifications, a web UI.
Those would become their own workstreams and decisions in a real plan.

## Definition of Ready / Done

A row is only safe for an unattended agent to pick when it is mechanically **READY**,
and only truthfully **DONE** when a machine says so.

**Definition of Ready (READY):** every `Dxx` it cites is Accepted; every `Blocked-by`
row is DONE; every contract/fixture its `Verify` references already exists on disk;
its `Owned files` set is disjoint from every IN-PROGRESS row's; a per-slice brief
exists (or the agent authors one first).

**Definition of Done (DONE):** the recorded `Verify:` command exits 0; the repo-wide
gate is green (format + lint + tests); the work merges only to an agent-owned,
non-`main` branch after green gates. `main` stays protected and human-gated — agents
never merge or push to it. A red `Verify` forces BLOCKED, never DONE.

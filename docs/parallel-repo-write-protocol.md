# Parallel Repo-Write Protocol

This is the committed protocol that lets several autonomous agents work on
the same repository without corrupting the coordination files that drive the
build.

## Branch And Worktree Isolation

- Each task runs in its own branch/worktree named by the task ID when a dedicated
  worktree is available.
- The protected base is `origin/main` (any non-main base works the same way if
  you point the loop at it); agents may open or update draft pull requests against
  `main`, but they never merge, squash, fast-forward, or push to
  `main`/`origin/main`.
- Mainline landing remains human-gated. Agents may integrate only agent-owned
  non-main branches after review and checks are green.
- The draft PR plus `scripts/agent-signals.sh origin/main` is the review loop:
  CodeRabbit review threads and GitHub checks are the source of truth.

## File Ownership

- A row's `Writes:` entry is the ownership set for the slice. Edits outside that
  set require either a smaller readiness-prep brief or an explicit row update.
- Two launch-ready rows may not claim overlapping `Writes:` paths unless one is a
  deliberate integration/readiness row that serializes the shared file.
- Shared coordination files have a single writer-of-record. Other agents produce
  reviewable patches into a per-agent inbox path such as
  `build/inbox/<agent-id>/` instead of editing those files concurrently.

## Append-Only Coordination

- `DECISION_LOG.md` and `TASK_QUEUE.md` are append-only / forward-only
  coordination logs after the append-only gate lands.
- New decision IDs and task IDs are monotonic. An agent claims a new decision ID
  by appending a reservation line before writing the body.
- Existing entries are not silently rewritten. Status flips owned by the current
  branch are allowed only for the claimed row, and they must be validated by the
  row's Verify command plus the PR review/check loop.
- Migration filenames use monotonic numeric prefixes such as
  `0001_workspace_store.sql`; duplicate prefixes fail the gate.

## Repo-Wide Gate

The CI convergence signal is the required PR check set. It includes:

- A frozen build-seam check for any zero-dependency contract package.
- A plan-wiki check (generator + smoke) for the implementation-plan renderer.
- A repo-write protocol check for this protocol, migration-number checks, PR
  policy wording, and queue wiring.

Every pushed head is rechecked. A red check or actionable CodeRabbit finding is
handled before claiming another row.

## Retired Mechanisms

Do not restore the retired board, dispatcher, polling daemon, required
status file, or generated branch-kanban data. The pull request,
the task row, and this CI gate are the coordination surface.

---
name: prd-to-task-queue
description: Convert product conversations, PRDs, plans, or specs into repo-native implementation-plan artifacts and TASK_QUEUE.md rows instead of GitHub/Linear/external issue tracker tickets. Use when asked to create a PRD, break down a PRD/spec/plan into implementation work, create agent-ready tasks, adapt issue workflows to this repo, or maintain PRD-to-task traceability.
---

# PRD To Task Queue

Use this skill to turn product intent into durable repo artifacts. The output is
tracked Markdown under `implementation_plans/`, not external issues.

## Required Reading

1. `AGENTS.md` and `.claude/skills/overnight-agent-runbook/SKILL.md` for the row +
   Goal contract.
2. The target `implementation_plans/<plan>/INDEX.md`, `MASTER_PLAN.md`,
   `TASK_QUEUE.md`, and traceability file if present.
3. Existing PRDs, runbooks, decision logs, architecture plans, or route/data-class
   matrices referenced by nearby rows.
4. `docs/quality-lenses.md` or the repo's equivalent when choosing test seams or
   quality gates; repo domain docs if present when choosing domain vocabulary.

## Workflow

1. **Bind the destination.** Choose the implementation-plan folder that owns the
   work. If no folder exists, create or update an implementation-plan folder
   before adding queue rows.
2. **Synthesize or update the PRD locally.** For a major capability, create or
   update `PRD_<CAPABILITY>.md` in the plan folder. Include problem, target
   users/personas, user stories, acceptance criteria, non-goals,
   security/privacy constraints, demo criteria, release gates, and open
   decisions. Use the plan's domain vocabulary. Do not publish to an issue
   tracker.
3. **Find the validation seams.** Name the highest public seams that can prove
   the work: API route, domain service, repository contract, UI journey,
   runbook/evidence export, browser smoke, or static validation. Prefer existing
   seams over new test infrastructure.
4. **Break work into tracer-bullet rows.** Add thin vertical slices to
   `TASK_QUEUE.md`: each row should be independently reviewable and should close
   a concrete PRD story, acceptance criterion, release gate, or decision. Avoid
   layer-only rows unless a contract/schema branch is the required first slice.
5. **Encode execution metadata in queue terms.** For each row, set `Status`,
   `Priority`, `Owner`, `Reference`, and `Notes`.
   - New rows default to `PENDING` and `unassigned`.
   - Use `BLOCKED` only when a named approval, credential, live-provider input,
     upstream branch, or decision is required before implementation.
   - Put PRD/story/AC links and architecture/contract references in `Reference`.
   - Put done means, validation seams, dependencies, and out-of-scope boundaries
     in `Notes`.
6. **Preserve traceability.** Update the plan's traceability map or index only
   when the new rows need a durable product outcome, branchability guidance, or
   release-gate mapping.
7. **Validate the docs.** Run `git diff --check`; run app or doc-generation
   checks only when the changed files require them.

## Row Shape

Use the existing queue table columns. A good row answers:

- What observable behavior, evidence, or decision becomes true?
- Which product outcome, PRD story, or acceptance criterion does it close?
- Which public seam proves completion?
- What must not happen?
- Which rows or human decisions block it?

Prefer concise rows over issue-style essays. Long background belongs in PRDs,
architecture docs, decision logs, or traceability files linked from the row.

## External-Issue Adaptation

When a source workflow says "issue," translate it as follows:

| External issue concept | Repo-native equivalent |
|---|---|
| Parent issue | PRD or plan doc (e.g. the workstream section in `TASK_QUEUE.md`) |
| Issue title | `TASK_QUEUE.md` row `Task` |
| Issue body | PRD/architecture doc plus row `Notes` |
| Acceptance criteria | PRD ACs, row `Notes`, validation commands |
| Blocked by | Row `Notes`, status `BLOCKED`, or grouped Goal sequencing |
| Labels/triage | `Priority`, workstream section, quality lens, branchability guidance |
| Assignee | `Owner` only when an actual branch/workspace claims the row |
| Published issue ID | Stable row ID such as `K-09` or `EQ-06` |

Do not create GitHub, Linear, or other external tickets unless the user
explicitly asks for that integration.

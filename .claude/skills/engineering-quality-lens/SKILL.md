---
name: engineering-quality-lens
description: Selects and applies the repo's engineering quality lens for implementation-plan Goals. Use when planning, reviewing, or starting a task and you need to choose TDD, diagnosis, architecture, DDD, DDIA, Release It, refactoring, or service-layer guidance.
---

# Engineering Quality Lens

Use this skill to decide which software engineering discipline should shape a
Goal before code changes start, or to review whether a branch used the right
discipline before closeout.

## Required Reading

1. `docs/agents/quality-lenses.md`
2. `docs/agents/domain.md`
3. The relevant `implementation_plans/<plan>/TASK_QUEUE.md` row and references

## Workflow

1. Name the work type: feature, bug, refactor, data-plane, runtime, UI, planning,
   domain-modeling, or shared-mechanics.
2. Pick one primary skill: `tdd`, `diagnose`, `architecture-review`,
   `code-structure`, or no extra skill for tiny docs-only edits.
3. Pick the rule lens that should bias decisions: APoSD, Clean Architecture,
   DDD/IDDD, DDIA, Release It, Refactoring, WELC, Code Complete, or Pragmatic
   Programmer.
4. State the test seam and quality gate in concrete repo terms.
5. If the task touches shared operational mechanics or changes implementation
   code that may affect the actions/service-layer split, run `code-structure`
   before closeout. Do not ask first; record the outcome or record
   `code-structure: not applicable (<reason>)` for docs-only/ownership-only work.

## Output Shape

```md
Engineering quality lens:
- Work type:
- Primary skill:
- Rule lens:
- Test seam:
- Quality gate:
```

If the current task lacks a concrete test seam or quality gate, treat that as a
planning gap and fix the Goal/task row before implementation.

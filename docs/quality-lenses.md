# Engineering Quality Lenses

This repo uses quality lenses to choose the right software engineering discipline
for each Goal. A lens is not a second source of truth; it is a review and
implementation bias applied to the existing task queue, Goal, and validation
surface.

## Default Lens Set

| Work type | Primary skill | Rule lens | Evidence expected |
|---|---|---|---|
| New behavior or feature slice | `tdd` | Code Complete, Clean Code, APoSD | One behavior at a time, public-interface tests, green validation, local refactor. |
| Bug or regression | `diagnose` | Pragmatic Programmer, WELC | Repro loop, ranked hypotheses, targeted instrumentation, regression test or seam gap. |
| Shared operational mechanics | `code-structure` | Clean Architecture, PoEAA, APoSD | Actions keep domain rules; service layer owns reusable mechanics with explicit inputs/outputs. |
| Security/authz or policy gate | `tdd` | Clean Architecture, DDD, Release It! | Policy/API tests prove fail-closed behavior, allowlisted audit metadata, and no privileged or sensitive-data leakage. |
| Domain modeling | `engineering-quality-lens` or `architecture-review` | DDD / IDDD | Bounded context, local language, invariants, aggregate or value-object boundaries, translation points. |
| Data plane, queues, migrations, retries | `engineering-quality-lens` | DDIA, Release It! | Source of truth, consistency, idempotency, retry/replay safety, schema evolution, failure/observability behavior. |
| Existing-code refactor | `architecture-review` | Refactoring, Refactoring.Guru, WELC | Named smell, smallest behavior-preserving change, safety net or explicit verification gap. |
| Runtime/integration reliability | `engineering-quality-lens` | Release It!, DDIA | Bounded waits/resources, timeouts, backoff, blast-radius limits, degraded modes, diagnostics. |
| Planning or ambiguous requirements | `engineering-quality-lens` | Pragmatic Programmer, DDD | Outcome, acceptance criteria, boundaries, terminology, blocked stop condition. |

## Goal Prompt Contract

When a task prompt can infer the work type, include:

```md
Engineering quality lens:
- Work type: <feature | bug | refactor | data-plane | runtime | UI | planning>
- Primary skill: <skill name or "none required">
- Rule lens: <book/rule family>
- Test seam: <API route | domain service | repository contract | UI journey | runbook evidence>
- Quality gate: <specific validation or review evidence>
```

If the lens is wrong for the actual code discovered, the agent should correct it
in final reporting or the relevant plan docs instead of forcing the work through
the wrong process.

## Resource Inputs

Keep your own working reference materials (book notes, rule summaries) wherever
your repo stores docs. Use them as background when updating skills or quality
docs, but do not bulk-copy large rule sets into always-on prompts.

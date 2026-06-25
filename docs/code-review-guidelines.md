# Code Review Guidelines

The repo's review discipline in one place, so a one-shot reviewer (CodeRabbit) and
the overnight agent threads (`.claude/skills/overnight-agent-runbook`) flag the same
things. Distilled from the *review-criteria* skills — `.claude/skills/code-structure`,
`.claude/skills/architecture-review`, `.claude/skills/engineering-quality-lens`. The
*process* skills (`tdd`, `diagnose`) govern HOW a change is made, not what review
flags, so they stay with the implementing agent.

## Always (every diff)

- **Correctness first** — logic errors, unhandled cases, off-by-one, race/ordering,
  resource leaks, swallowed errors, wrong failure classification.
- **Reuse & simplification** — duplicated operational logic, dead code, a simpler
  equivalent, an existing helper that already does it. Flag over-engineering too.
- **Tests** — a behavior change needs a test through a public seam; a bug fix needs a
  regression test; flag assertions that cannot fail (vacuous tests).

## Service-layer separation (`code-structure`)

- **Actions own the "why/when":** business rules, state transitions, auth/ownership,
  failure classification, user-facing errors. **The service layer owns the "how":**
  reusable operations, provider/SDK calls, command execution — explicit params,
  structured returns, no reaching into DB/state.
- Flag: a *god service* (one function hiding all control flow); a *leaky service*
  (mutating domain state directly); inconsistent argument/error styles; operational
  logic duplicated across 2+ callers (extract it) — **and** logic extracted for a
  single caller (over-abstraction).

## Architecture (`architecture-review`)

- Does the change make the module **deeper** (more leverage behind a smaller, clearer
  interface) or wider/shallower?
- Framework, transport, DB, provider, clock, queue, filesystem details belong behind
  **adapters**, not in domain/action code.
- Persistence / retries / queues / events: source of truth, consistency,
  **idempotency**, replay, and schema evolution must be explicit.
- A changed domain term must be owned by one context and reflected in tests/docs.
- Refactor only with a **named smell, a safety net (tests), the smallest treatment,
  and a stop condition** — never a broad rewrite riding along with a feature.

## Repo invariants (hard — see `AGENTS.md` + your decision log)

Adapt this section to your own project's hard rules. The pattern: enumerate the
invariants that are *decisions*, not preferences, and cite where each is recorded so a
reviewer can flag a violation without re-litigating it. Examples of the shape these
take:

- A **frozen contract package** (a zero-dependency, std-only crate/module shared
  across the system) is a build seam: **never** add an external dependency to it, and a
  type/enum/error/trait signature change is a contract edit, not a local tweak.
- **Vocabulary neutrality:** no concrete domain nouns in the shared contract source —
  vocabulary is supplied as data and validated against the contract.
- **Single write path** invariants: only one designated service mints a given token or
  performs a given privileged write; a critical action never auto-confirms; a
  configuration may make a gate stricter, never weaker.
- Dependency-free static assets (docs sites, prototypes) stay build-dependency-free;
  generated output directories are not hand-edited.

## Scope

Flag only what changes the decision; prefer fewer, high-confidence findings over a
long list. No drive-by rewrites. The plan markdown is the source of truth — a terse
`TASK_QUEUE.md` row is fine if its workstream design doc + cited decisions cover it.
Never suggest reviving a retired branch-kanban / dispatcher / agent-status-file model.

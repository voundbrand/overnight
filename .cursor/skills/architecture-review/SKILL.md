---
name: architecture-review
description: Reviews implementation-plan work for module depth, service-layer boundaries, DDD seams, data/runtime contracts, and safe refactoring opportunities. Use when a task touches shared architecture, repeated mechanics, domain modeling, persistence, runtime boundaries, or risky existing code.
---

# Architecture Review

Use this as a focused design checkpoint, not a broad rewrite license.

## Review Questions

1. What module/interface is the task really changing?
2. Does the change make the module deeper: more leverage behind a smaller,
   clearer interface?
3. Are business rules in the domain/use-case/action layer and reusable mechanics
   in the service layer?
4. Are framework, transport, database, provider, clock, queue, and filesystem
   details kept behind appropriate adapters?
5. If domain language changed, is the term owned by one context and reflected in
   tests/docs?
6. If persistence, retries, queues, jobs, or events changed, are source of truth,
   consistency, idempotency, replay, and schema evolution explicit?
7. If refactoring existing code, is there a named smell, safety net, smallest
   treatment, and stop condition?

## Output

Return findings in this shape:

```md
Architecture review:
- Primary risk:
- Recommended change:
- Files/modules:
- Validation:
- Residual risk:
```

Use `code-structure` for the specific actions-versus-service-layer separation
check when shared operational mechanics are involved.

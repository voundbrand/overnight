---
name: tdd
description: Runs behavior-first test-driven development for implementation-plan feature slices. Use when building behavior, fixing a bug with a known seam, adding integration tests, or when a prompt asks for red-green-refactor.
---

# Test-Driven Development

Use one vertical slice at a time. Tests should verify behavior through public
interfaces, not private implementation shape.

## Workflow

1. Read the task row, Goal, domain docs, and existing nearby tests.
2. Name the public seam: API route, domain service, repository contract, UI
   journey, CLI, or runbook check.
3. Write one failing test for one observable behavior.
4. Implement only enough code to pass that test.
5. Repeat for the next behavior.
6. Refactor only while green; run the same validation after each structural move.

## Guardrails

- Do not write all tests first and all implementation second.
- Do not test private helpers unless there is no better seam and the gap is
  recorded.
- Prefer existing fixture and repository patterns over new test infrastructure.
- For weak or unclear legacy behavior, switch to `diagnose` or
  `architecture-review` before broad edits.

## Closeout

Report the red/green evidence, final validation commands, and any behavior that
could not be pinned to a good seam.

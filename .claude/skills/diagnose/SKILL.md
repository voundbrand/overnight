---
name: diagnose
description: Disciplined diagnosis loop for bugs, failing tests, regressions, or performance problems. Use when something is broken, flaky, slow, throwing, or producing wrong output.
---

# Diagnose

Build a trusted feedback loop before fixing. Do not guess from code inspection
alone when a reproducible signal can be created.

## Workflow

1. Reproduce with the narrowest deterministic loop available: failing test, CLI,
   curl, browser script, fixture replay, or temporary harness.
2. Confirm the loop matches the user's symptom.
3. List 3-5 ranked hypotheses with falsifiable predictions.
4. Instrument only at boundaries that distinguish those hypotheses. Tag temporary
   logs with a unique prefix.
5. Turn the minimized repro into a regression test at the correct seam when one
   exists.
6. Fix, rerun the original loop, rerun validation, and remove temporary
   instrumentation.

## If No Good Loop Exists

Stop and report what was tried, what artifact is missing, and whether the next
step needs logs, trace data, credentials, browser access, or permission for
temporary instrumentation.

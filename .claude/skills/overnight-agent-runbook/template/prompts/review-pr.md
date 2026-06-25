# Prompt: Review one PR at one head (returns findings only)

Seed a fresh review thread per new head SHA. It reviews; it does not fix.

```text
Review this pull request at this exact head and return findings only. Do not edit
code or push.

PR: <url/id>. Head SHA: <sha>. Base: <base branch, e.g. origin/main>. Plan: <HTML plan path>.

Do:
- Inspect the diff against the plan and the stated quality gate.
- Run the agnostic reviewer when available (e.g. CodeRabbit: cr --agent --base
  <base>), plus your own read for correctness, security, contracts, and tests.
- Return each finding classified: actionable (valid, in scope, fixable here),
  invalid (wrong facts / contradicted by code), duplicate, blocked (needs a human
  decision/credential/upstream), out-of-scope (real but not this PR).

Output: the classified findings with file:line and a one-line fix suggestion for
each actionable one, plus an overall verdict (approve / changes-requested /
blocked) for this SHA. No code changes.
```

# Prompt: Decompose a feature into a PR shape

Use first, before any implementation thread. It decides the *shape*: one PR, a
stack, or parallel pieces — and whether a thread needs more than one agent.

```text
Assess this work and decide its PR shape. Do NOT implement yet.

Work: <describe the feature/project, with links to plans/issues>.
Base branch: <base, e.g. origin/main>.

Answer concretely:
1. Can this land as ONE reviewable PR? Judge by blast radius, not line count — a
   PR is "one" when a single reviewer can hold it in their head and it has one
   verifiable final state.
2. If not, propose a PR stack: ordered pieces, each one reviewable PR with one
   final state. For each piece say: stacked (depends on a prior PR) or parallel
   (independent), what it branches from, and the landing order.
3. For each piece, say whether its thread needs ONE agent or MULTIPLE agents
   working in tandem (e.g. impl + a paired reviewer, or split frontend/backend),
   and why.
4. For each piece, name which saved prompt to seed its thread with (see the
   runbook's prompt library) and the quality lens (work type, primary skill,
   test seam, quality gate).
5. Write an HTML plan per piece via the implementation-plan-wiki pattern so it is
   readable on a phone.

Output: the PR stack (shape + dependencies + landing order), the per-piece agent
count, the chosen seed prompt per piece, and the plan paths. Stop there.
```

## Sizing heuristics

- **One PR, one agent** — a self-contained change with one validation surface and
  no high-risk shared files.
- **Stacked PRs** — the work has a natural sequence (contract → behavior → UI), or
  later pieces depend on earlier ones landing. Each piece is its own PR; piece N+1
  branches off piece N (or off base after N merges).
- **Parallel PRs** — genuinely independent pieces with no shared files. Run their
  threads concurrently.
- **Multiple agents in one thread** — when a single piece still benefits from
  division of labor (e.g. an implementer plus a paired reviewer, or a
  frontend/backend split converging on one PR). The thread still owns one PR (or
  one stacked sub-sequence); the agents coordinate inside it.
- **Break it down further** — if any single piece would touch more than ~3
  high-risk shared files or has more than one final state, split again.

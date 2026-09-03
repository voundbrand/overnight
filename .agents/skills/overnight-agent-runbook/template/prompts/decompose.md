# Prompt: Decompose a feature into a PR shape

Use first, before any implementation thread. It decides the *shape*: one PR, a
stack, or parallel pieces — and whether a thread needs more than one agent.

Also decide the operating mode. Use **Normal Conductor/local-agent mode** for
human-steered daytime work: focused local `Verify`, draft PRs, optional local
integration train, and certification only before landing. Use the overnight
runbook only when the user asks for unattended/high-assurance execution or a
dependency needs exact hosted evidence before downstream work starts.

```text
Assess this work and decide its PR shape. Do NOT implement yet.

Work: <describe the feature/project, with links to plans/issues>.
Base branch: <base, e.g. origin/main>.

Answer concretely:
1. Can this land as ONE reviewable PR? Judge by blast radius, not line count — a
   PR is "one" when a single reviewer can hold it in their head and it has one
   verifiable final state.
2. If not, propose ordered source slices with one final state each. For each
   piece say: stacked (depends on a prior PR), parallel (independent), or
   single-integration worker; what it branches from; integration order; and the
   landing unit. Also say whether `local-integration-train` should be used as an
   accelerator; if yes, name the train branch/worktree, merge order, combined
   Verify command, which dependents may start speculatively, and the real parent
   each must later rebind to before readiness.
3. For each piece, say whether it should run local-only, cloud-safe, or
   human-gated. Cloud-safe means it can run from pushed Git plus synthetic
   fixtures and does not need local dirty files, Docker Desktop, credentials,
   browser state, private network access, staging, or production.
4. For each piece, say whether its thread needs ONE agent or MULTIPLE agents
   working in tandem (e.g. impl + a paired reviewer, or split frontend/backend),
   and why.
5. For each piece, name which saved prompt to seed its thread with (see the
   runbook's prompt library) and the quality lens (work type, primary skill,
   test seam, quality gate).
6. Write an HTML plan per piece via the implementation-plan-wiki pattern so it is
   readable on a phone.

Output: the PR stack (shape + dependencies + landing order), the per-piece agent
count, the chosen seed prompt per piece, and the plan paths. Stop there.
```

## Sizing heuristics

- **One PR, one agent** — a self-contained change with one validation surface and
  no high-risk shared files.
- **One campaign integration PR** — the user wants one landing, but the work
  still uses bounded worker branches, focused commits, worker admission,
  checkpoint controls/CI/review, and one final aggregate certification.
- **Local integration train** — hosted CI is slowing a compatible wave. Keep a
  controller-owned local-only train, merge locally verified worker heads, run
  the combined local suite, and use failures as discovery. The train is not
  landable evidence; pushed heads still need hosted CI/review/signals or the
  repo's equivalent certification.
- **Stacked PRs** — the work has a natural sequence (contract → behavior → UI), or
  later pieces depend on earlier ones landing. Each piece is its own PR; piece N+1
  branches off piece N (or off base after N merges).
- **Parallel PRs** — genuinely independent pieces with no shared files. Run their
  threads concurrently.
- **Cloud-safe worker** — a slice whose parent, source, and fixtures are all in
  pushed Git and whose validation does not need local Docker, credentials,
  browser state, private network access, staging, or production. Cloud workers
  push branches/PRs; the local controller integrates and certifies.
- **Multiple agents in one thread** — when a single piece still benefits from
  division of labor (e.g. an implementer plus a paired reviewer, or a
  frontend/backend split converging on one PR). The thread still owns one PR (or
  one stacked sub-sequence); the agents coordinate inside it.
- **Break it down further** — if any single piece would touch more than ~3
  high-risk shared files or has more than one final state, split again.

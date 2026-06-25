# Contributing to Overnight

Thanks for wanting to make this better. Overnight is a system for shipping reviewed
PRs unattended — so the most natural way to contribute is to **use it on itself**.

## Ground rules

- **`main` is human-gated.** The same rule the system enforces applies to this repo:
  agents (and contributors) open PRs; a maintainer merges to `main`. Never push to
  `main` directly.
- **Keep it portable.** This package must work in *any* repo. Don't add dependencies
  on a specific product, company, language, or build system. If you need an example,
  make it neutral.
- **No product/domain leakage.** No real client data, credentials, internal URLs, or
  domain-specific jargon. The verification step greps for that — keep it clean.
- **Smallest change that helps.** One reviewable slice per PR. If a change spans a
  contract → behavior → docs sequence, stack it.

## What good contributions look like

- **New harness support** — wiring notes for another agent runtime in
  `docs/configuration.md` and `docs/autonomy-engine.md`.
- **New review surfaces** — making the signals probe or `pr-review-loop` work with
  another reviewer or PR host, without breaking the GitHub default.
- **New quality lenses** — a focused skill under `.claude/skills/` that names a
  discipline and the smallest rule set that changes a decision.
- **Docs and examples** — clearer explanations, more neutral example plans.
- **Prompt library additions** — reusable seed prompts in
  `.claude/skills/overnight-agent-runbook/template/prompts/`.

## How to develop

1. Fork and branch (`feat/…`, `fix/…`, `docs/…`).
2. Make the change in one reviewable slice.
3. Open a **draft** PR early.
4. Let the review loop run: address valid CodeRabbit findings, push a new head,
   repeat until the reviewer is clean and checks pass.
5. Mark the PR ready and request a maintainer review for the merge.

## Reporting issues

Open an issue with: what you tried, the harness + review surface you used, the
`scripts/agent-signals.sh` output if relevant, and what you expected vs what happened.

## License

By contributing you agree your contributions are licensed under the [MIT License](LICENSE).

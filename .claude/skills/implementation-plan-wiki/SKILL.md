---
name: implementation-plan-wiki
description: Build or update a Vercel-hosted static wiki for Git-tracked implementation plans, with left-sidebar accordion navigation from plan index to docs, task queues, and individual task pages; include validation, protected hosting, and review gates.
---

# Implementation Plan Wiki

Use this skill when turning `implementation_plans/` into a hosted internal wiki
or updating the wiki generator for another project.

## Workflow

1. Keep Git-tracked plan files canonical. The hosted wiki is generated output.
2. Generate real static HTML pages, not only a client-side SPA:
   - `/` for all plans.
   - `/plans/<plan>/` for plan overview.
   - `/plans/<plan>/tasks/` for parsed queue rows.
   - `/plans/<plan>/tasks/<task-id>/` for one task.
   - `/plans/<plan>/docs/<doc-slug>/` for source docs.
3. Use a left sidebar accordion with plans, docs, task queues, and individual
   tasks. Add breadcrumbs so users can drill down and back up.
4. Preserve canonical source links for every generated page.
5. Protect hosted output with Vercel Deployment Protection / Vercel
   Authentication. If production aliases are public on the current plan, deploy
   real wiki content only to protected preview/deployment URLs and deploy a
   harmless production placeholder.

## UI Conventions

The shell is a dense, calm docs/wiki UI. Keep these conventions when editing it:

- Stay dependency-free static HTML/CSS/JS. No framework, no SPA conversion, no
  decorative gradients or marketing hero sections.
- Theme: CSS custom properties in `src/styles.css` define a light token set on
  `:root`, a dark set on `:root[data-theme="dark"]`, and the same dark set under
  `@media (prefers-color-scheme: dark)` scoped to `:root:not([data-theme="light"])`
  so JS-disabled pages still follow the system theme. A tiny inline `<head>`
  script (`themeBootScript` in `build-site.mjs`) applies the stored choice before
  paint to avoid a flash; the `.theme-toggle` button in the topbar flips and
  persists `wiki-theme` in `localStorage` via `src/app.js`.
- Mobile: at `<= 860px` the sidebar becomes a fixed off-canvas drawer toggled by
  the `.nav-toggle` button and a `.scrim` backdrop (handled in `src/app.js`).
  Keep `.table-wrap { overflow-x: auto }` and `overflow-wrap: anywhere` on body
  text so content never overflows horizontally.
- Typography is compact (14px base, ~1.5 line-height). Use the `--mono` font for
  task IDs, file/source paths, plan slugs, and status badges. Keep headings clear
  but not oversized (h1 ~1.55rem).
- Active nav state uses `.nav-sub.active` (accent left-border + tint). The
  sidebar filter (`#nav-filter`) hides non-matching `.nav-plan`/`.nav-sub` items.

## Review And Validation

Run the local checks before reporting completion:

```sh
npm run check --prefix implementation_plans/site
PLAN_PUBLIC_PLACEHOLDER=1 npm run build:public-placeholder --prefix implementation_plans/site
PLAN_PUBLIC_PLACEHOLDER=1 node implementation_plans/site/scripts/smoke-site.mjs
git diff --check
```

For non-trivial generator or plan changes:

- use the repo review loop (`.claude/skills/pr-review-loop/SKILL.md`) when creating a
  review branch or draft pull request (GitHub by default; Azure DevOps or GitLab
  also work);
- run or read CodeRabbit feedback when available;
- use an independent review pass for schema, parser, or deployment-protection
  changes;
- keep merge, policy bypass, protected-branch, credential, and public-sharing
  actions human-gated.

## Scaffold Into A New Project

This skill bundles a ready-to-use generator under `template/`. To stand up the
wiki in another repo:

1. Copy the template into the target repo's plans area:

   ```sh
   mkdir -p <repo>/implementation_plans/site
   cp -R .claude/skills/implementation-plan-wiki/template/. <repo>/implementation_plans/site/
   cd <repo>/implementation_plans/site && npm install
   ```

2. Adjust the project-specific knobs in `scripts/build-site.mjs`
   (`plansRoot`, `excludedPlanDirs`, `planDocOrder`, and the `parseTaskQueue`
   column expectations) and set `name` in `package.json`. The template README
   lists each knob.

3. Validate locally:

   ```sh
   npm run check
   PLAN_PUBLIC_PLACEHOLDER=1 npm run build:public-placeholder
   ```

4. Link and deploy with protection (see "Hosting" in the template README); keep
   `dist/` and `.vercel/` out of Git.

Keep `template/` in sync when you improve the live generator under
`implementation_plans/site/` — the template is the reusable seed, not a fork.

Do not copy `.vercel/`, `dist/`, local env files, or deployment URLs between
projects.

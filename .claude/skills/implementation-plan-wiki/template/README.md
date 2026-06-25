# Implementation Plan Wiki (template)

Drop-in static-site generator that turns Git-tracked implementation plans into a
Vercel-hosted internal wiki. Canonical source stays under
`implementation_plans/<plan>/`; this is a generated hosted view.

This folder is a **template** carried by the `implementation-plan-wiki` skill.
Copy it into a target repo (see the skill's "Scaffold Into A New Project"
section) and adjust the few project-specific knobs noted below.

## Layout

```text
scripts/build-site.mjs   # generator: parses plans, emits static HTML + JSON
scripts/serve.mjs        # local dev server: serves dist/ + POST /api/regenerate
scripts/smoke-site.mjs   # post-build smoke test (routes, links, health)
src/styles.css           # dense docs UI, light/dark theming
src/app.js               # theme toggle, mobile drawer, sidebar filter, regenerate
package.json             # build / serve / build:public-placeholder / check scripts
vercel.json              # framework:null static build, no-store + noindex headers
.gitignore               # ignores dist/ and .vercel/
```

## Local build

```sh
npm run check                                   # build + smoke
PLAN_PUBLIC_PLACEHOLDER=1 npm run build:public-placeholder
```

Generated output:

```text
dist/
├── index.html
├── site-data.json
├── health.json
└── plans/<plan>/
    ├── index.html
    ├── tasks/index.html
    ├── tasks/<task-id>/index.html
    └── docs/<doc-slug>/index.html
```

## Local preview + regenerate

```sh
npm run serve            # http://127.0.0.1:8799  (PORT=… to override)
```

`serve.mjs` serves `dist/` with the same clean URLs as Vercel and exposes
`POST /api/regenerate`. The topbar **Regenerate** button (the circular-arrow
icon) calls that endpoint to rebuild from the canonical plan markdown and reloads
the page — handy for watching `TASK_QUEUE.md` status change during a run without
leaving the browser. The button is hidden unless this server answers a
`GET /api/regenerate` probe, so it never appears on static/Vercel hosting. The
server binds to localhost only (it can trigger a build) and uses Node builtins —
no dependencies, no `npm install`.

## Project-specific knobs (edit after copying)

In `scripts/build-site.mjs`:

- `plansRoot` — defaults to the parent of the site dir (`implementation_plans/`).
  Repoint if plans live elsewhere.
- `excludedPlanDirs` — folders under the plans root that are not plans
  (e.g. `site`, bundles).
- `planDocOrder` — canonical doc ordering in the sidebar/overview.
- `parseTaskQueue` header map — expects Markdown task tables with `ID` / `Task`
  columns and optional `Status` / `Priority` / `Owner` / `Reference` / `Notes`.

In `package.json`: set `name`. In `vercel.json`: nothing project-specific, but
confirm the Vercel project name/scope when you link the directory.

## Hosting (protected)

Use Vercel Deployment Protection with Vercel Authentication. On Vercel plans
where production aliases are public, deploy real content only to protected
preview URLs and keep production as a placeholder:

```sh
npm run check
vercel build && vercel deploy --prebuilt --yes
PLAN_PUBLIC_PLACEHOLDER=1 vercel build --prod && vercel deploy --prebuilt --prod --yes
```

Verify protection: `curl -o /dev/null -w '%{http_code}' <preview-url>` should
return `401`. Do not commit `dist/` or `.vercel/`.

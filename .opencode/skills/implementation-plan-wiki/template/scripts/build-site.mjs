#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const plansRoot = path.resolve(siteRoot, "..");
const outDir = path.resolve(siteRoot, "dist");
const publicPlaceholder = process.env.PLAN_PUBLIC_PLACEHOLDER === "1";

const planDocOrder = [
  "INDEX.md",
  "MASTER_PLAN.md",
  "TASK_QUEUE.md",
  "DECISION_LOG.md",
  "BUILD_LOG.md",
];

const excludedPlanDirs = new Set(["site"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function titleizeSlug(slug) {
  return slug
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function firstHeading(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? stripMarkdown(match[1]).trim() : fallback;
}

function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/\[`?([^\]`]+)`?\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTaskQueue(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tasks = [];
  let section = "Tasks";
  let sectionDoc = "";

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+)$/);
    if (heading) {
      section = stripMarkdown(heading[1]).replace(/^[-\s]+/, "").trim();
      sectionDoc = "";
      continue;
    }

    // A "**Design doc:** [FILE.md](FILE.md)" line under a workstream header maps the
    // whole section to its canonical design doc — read by agents in the source AND
    // surfaced as a link on every task page (single source of truth, no drift).
    const designDoc = lines[index].match(/\*\*Design doc:\*\*.*?\(([^)]+\.md)\)/i);
    if (designDoc) {
      sectionDoc = designDoc[1].trim();
      continue;
    }

    const headerCells = splitMarkdownTableRow(lines[index]);
    if (!headerCells.includes("ID") || !headerCells.includes("Task")) {
      continue;
    }

    const separatorCells = splitMarkdownTableRow(lines[index + 1] || "");
    if (!isSeparatorRow(separatorCells)) {
      continue;
    }

    const headerMap = new Map(headerCells.map((cell, cellIndex) => [cell, cellIndex]));
    index += 2;

    while (index < lines.length) {
      const cells = splitMarkdownTableRow(lines[index]);
      if (cells.length === 0 || isSeparatorRow(cells)) {
        break;
      }

      const get = (name) => cells[headerMap.get(name)] || "";
      const id = stripMarkdown(get("ID")).trim();
      if (id) {
        tasks.push({
          id,
          title: stripMarkdown(get("Task")).trim(),
          status: stripMarkdown(get("Status")).trim() || "UNKNOWN",
          priority: stripMarkdown(get("Priority")).trim() || "UNKNOWN",
          owner: stripMarkdown(get("Owner")).trim() || "unassigned",
          reference: get("Reference"),
          notes: get("Notes"),
          section,
          designDoc: sectionDoc,
        });
      }

      index += 1;
    }
  }

  return tasks;
}

function markdownNoLinks(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function markdownInline(value) {
  const source = String(value ?? "");
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let html = "";
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(source)) !== null) {
    html += markdownNoLinks(source.slice(lastIndex, match.index));
    const text = match[1];
    const href = match[2];
    if (/^(https?:|mailto:|#)/i.test(href)) {
      html += `<a href="${escapeHtml(href)}">${markdownNoLinks(text)}</a>`;
    } else {
      html += `<code>${escapeHtml(stripMarkdown(text))}</code>`;
    }
    lastIndex = match.index + match[0].length;
  }

  html += markdownNoLinks(source.slice(lastIndex));
  return html;
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = null;
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${markdownInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const line of lines) {
    const fence = line.match(/^```/);
    if (fence && !inCode) {
      flushParagraph();
      flushList();
      inCode = true;
      codeLines = [];
      continue;
    }
    if (fence && inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      inCode = false;
      codeLines = [];
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 1, 5);
      const text = stripMarkdown(heading[2]);
      html.push(`<h${level} id="${slugify(text)}">${markdownInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (list !== "ul") {
        flushList();
        list = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${markdownInline(bullet[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (list !== "ol") {
        flushList();
        list = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${markdownInline(ordered[1])}</li>`);
      continue;
    }

    if (line.trim().startsWith("|")) {
      flushParagraph();
      flushList();
      html.push(`<pre class="md-table">${escapeHtml(line)}</pre>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return html.join("\n");
}

async function readIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}

async function collectPlans() {
  const entries = await readdir(plansRoot, { withFileTypes: true });
  const plans = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || excludedPlanDirs.has(entry.name)) continue;
    const planDir = path.resolve(plansRoot, entry.name);
    const indexMarkdown = await readIfExists(path.resolve(planDir, "INDEX.md"));
    const masterMarkdown = await readIfExists(path.resolve(planDir, "MASTER_PLAN.md"));
    const taskMarkdown = await readIfExists(path.resolve(planDir, "TASK_QUEUE.md"));
    const htmlPlan = await readIfExists(path.resolve(planDir, "index.html"));

    if (!indexMarkdown && !masterMarkdown && !taskMarkdown && !htmlPlan) continue;

    const files = await readdir(planDir, { withFileTypes: true });
    const docs = [];
    const preferred = new Set(planDocOrder);

    for (const docName of planDocOrder) {
      const content = await readIfExists(path.resolve(planDir, docName));
      if (content) {
        docs.push({
          name: docName,
          slug: slugify(docName.replace(/\.md$/i, "")),
          title: firstHeading(content, docName),
          content,
          sourcePath: `implementation_plans/${entry.name}/${docName}`,
        });
      }
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".md") || preferred.has(file.name)) {
        continue;
      }
      const content = await readFile(path.resolve(planDir, file.name), "utf8");
      docs.push({
        name: file.name,
        slug: slugify(file.name.replace(/\.md$/i, "")),
        title: firstHeading(content, file.name),
        content,
        sourcePath: `implementation_plans/${entry.name}/${file.name}`,
      });
    }

    const tasks = taskMarkdown ? parseTaskQueue(taskMarkdown) : [];
    const title = firstHeading(indexMarkdown || masterMarkdown || taskMarkdown || "", titleizeSlug(entry.name));

    plans.push({
      slug: entry.name,
      title,
      status: extractStatus(indexMarkdown || taskMarkdown || masterMarkdown || ""),
      docs,
      tasks,
      index: indexDocAnchors(docs),
    });
  }

  return plans.sort((a, b) => a.title.localeCompare(b.title));
}

function extractStatus(markdown) {
  const match = markdown.match(/\*\*Status:\*\*\s*([^\n]+)/i);
  return match ? stripMarkdown(match[1]).trim() : "UNKNOWN";
}

// Recognizes the ids that thread the plan together: user stories (US-EPIC04-12,
// US-AB-02, US-03-05), decisions (D56), and workstream task ids (A-01, P-09, CC-02,
// R-04, CC-02b). The 2+-digit suffix avoids matching tokens like UTF-8.
const WORK_ID = "US-[A-Za-z0-9-]+|D\\d+|[A-Z]{1,4}-\\d{2,}[a-z]?";

// Build id -> {docSlug, anchor} from the doc HEADINGS the generator already anchors
// (markdownToHtml gives every h1–h4 `id="${slugify(text)}"`). This is how a task row's
// terse `US-…`/`D…` reference becomes a click into the actual story/decision — no
// duplication, the plan markdown stays the single source of truth. Precedence: a `D`
// id prefers DECISION_LOG.md; a `US` id prefers the doc with the most id-headings (the
// authoritative epics doc).
function indexDocAnchors(docs) {
  // id -> first occurrence per doc: { docSlug, docName, anchor (nearest heading),
  // isHeadingDef, defCount (id-headings in that doc) }
  const occ = new Map();
  const tokenRe = new RegExp(`\\b(${WORK_ID})\\b`, "gi");
  const leading = new RegExp(`^(${WORK_ID})\\b`, "i");
  for (const doc of docs) {
    const lines = doc.content.split(/\r?\n/);
    let inCode = false;
    let currentAnchor = null;
    let defCount = 0;
    const seen = new Set();
    const docOcc = [];
    for (const raw of lines) {
      if (/^```/.test(raw)) { inCode = !inCode; continue; }
      if (inCode) continue;
      const heading = raw.match(/^(#{1,4})\s+(.+)$/);
      let text = raw;
      let headingDefId = null;
      if (heading) {
        text = stripMarkdown(heading[2]);
        currentAnchor = slugify(text);
        const lm = text.match(leading);
        if (lm) { headingDefId = lm[1].toUpperCase(); defCount += 1; }
      }
      for (const m of text.matchAll(tokenRe)) {
        const id = m[1].toUpperCase();
        if (seen.has(id)) continue; // first occurrence of this id within the doc
        seen.add(id);
        const entry = { docSlug: doc.slug, docName: doc.name, anchor: currentAnchor, isHeadingDef: id === headingDefId, defCount: 0 };
        docOcc.push(entry);
        if (!occ.has(id)) occ.set(id, []);
        occ.get(id).push(entry);
      }
    }
    for (const e of docOcc) e.defCount = defCount; // stamp final per-doc heading-def count
  }
  // anchorIndex: best HEADING-DEFINITION per id (clean "this section defines X" link)
  const anchorIndex = new Map();
  for (const [id, list] of occ) {
    const defs = list.filter((e) => e.isHeadingDef);
    if (!defs.length) continue;
    let best = defs[0];
    for (const e of defs.slice(1)) {
      const preferDecision = id.startsWith("D") && e.docName === "DECISION_LOG.md" && best.docName !== "DECISION_LOG.md";
      const richer = (e.defCount || 0) > (best.defCount || 0);
      if (preferDecision || (best.docName !== "DECISION_LOG.md" && richer)) best = e;
    }
    anchorIndex.set(id, { docSlug: best.docSlug, anchor: best.anchor });
  }
  return { anchorIndex, mentions: occ };
}

function docLink(plan, docSlug, anchor, label, asCode) {
  const href = `/plans/${plan.slug}/docs/${docSlug}/${anchor ? `#${anchor}` : ""}`;
  const inner = asCode ? `<code>${escapeHtml(label)}</code>` : escapeHtml(label);
  return `<a href="${href}">${inner}</a>`;
}

// The "Related work" block on a task page: links the ids in the row's Notes to their
// story/decision anchors, links any supporting doc the Notes name, and lists ids that
// have no dedicated section (e.g. story groups whose spec is the linked decisions).
function relatedWorkSection(plan, task) {
  const { anchorIndex, mentions } = plan.index;
  const selfId = task.id.toUpperCase();
  const text = `${task.notes || ""} ${task.title || ""}`;
  const shownSlugs = new Set();

  // (0) the workstream's canonical design doc (from the section's "**Design doc:**"
  // pointer). General context first; deduped against the more specific groups below.
  const design = [];
  if (task.designDoc) {
    const doc = plan.docs.find((d) => d.name === task.designDoc);
    if (doc) { design.push(`<a href="/plans/${plan.slug}/docs/${doc.slug}/">${escapeHtml(doc.name)}</a>`); shownSlugs.add(doc.slug); }
  }

  // (1) ids the row's Notes REFERENCE -> heading-definition link, else mention link, else plain.
  const refIds = [...new Set([...text.matchAll(new RegExp(`\\b(${WORK_ID})\\b`, "gi"))].map((m) => m[1].toUpperCase()))]
    .filter((id) => id !== selfId);
  const linked = [];
  const unlinked = [];
  for (const id of refIds) {
    const def = anchorIndex.get(id);
    if (def) { linked.push(docLink(plan, def.docSlug, def.anchor, id, true)); continue; }
    const mention = (mentions.get(id) || []).find((m) => m.docName !== "TASK_QUEUE.md");
    if (mention) { linked.push(docLink(plan, mention.docSlug, mention.anchor, id, true)); continue; }
    unlinked.push(`<code>${escapeHtml(id)}</code>`);
  }

  // (2) where THIS task is discussed (its own id mentioned in a supporting doc).
  const discussed = [];
  for (const m of mentions.get(selfId) || []) {
    if (m.docName === "TASK_QUEUE.md" || shownSlugs.has(m.docSlug)) continue;
    shownSlugs.add(m.docSlug);
    discussed.push(docLink(plan, m.docSlug, m.anchor, m.docName, false));
  }

  // (3) supporting docs the Notes name outright (not already shown above).
  const named = [];
  for (const doc of plan.docs) {
    if (doc.name === "TASK_QUEUE.md" || shownSlugs.has(doc.slug)) continue;
    if (text.includes(doc.sourcePath) || text.includes(doc.name)) {
      shownSlugs.add(doc.slug);
      named.push(`<a href="/plans/${plan.slug}/docs/${doc.slug}/">${escapeHtml(doc.name)}</a>`);
    }
  }

  if (!design.length && !discussed.length && !linked.length && !named.length && !unlinked.length) return "";
  const rows = ["<h2>Related work</h2>"];
  if (design.length) rows.push(`<p><strong>Design doc:</strong> ${design.join(" · ")}</p>`);
  if (discussed.length) rows.push(`<p><strong>Discussed in:</strong> ${discussed.join(" · ")}</p>`);
  if (linked.length) rows.push(`<p><strong>Stories &amp; decisions:</strong> ${linked.join(" · ")}</p>`);
  if (named.length) rows.push(`<p><strong>Supporting docs:</strong> ${named.join(" · ")}</p>`);
  if (unlinked.length) {
    rows.push(`<p class="related-unlinked"><strong>Referenced (no section yet):</strong> ${unlinked.join(" · ")}</p>`);
  }
  return rows.join("\n");
}

function taskGroups(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    if (!groups.has(task.section)) groups.set(task.section, []);
    groups.get(task.section).push(task);
  }
  return [...groups.entries()];
}

function statusClass(status) {
  const normalized = String(status).toLowerCase();
  if (normalized.includes("done")) return "done";
  if (normalized.includes("block")) return "blocked";
  if (normalized.includes("progress")) return "progress";
  if (normalized.includes("defer")) return "deferred";
  return "pending";
}

function sourcePathLabel(sourcePath) {
  return `<code>${escapeHtml(sourcePath)}</code>`;
}

function makeNav(plans, activePlanSlug, activeTaskId, activeDocSlug) {
  const planLinks = plans
    .map((plan) => {
      const open = plan.slug === activePlanSlug ? " open" : "";
      const tasks = plan.tasks
        .slice(0, 80)
        .map((task) => {
          const active = task.id === activeTaskId ? " active" : "";
          return `<a class="nav-sub${active}" href="/plans/${plan.slug}/tasks/${encodeURIComponent(task.id)}/"><span>${escapeHtml(task.id)}</span><small>${escapeHtml(task.title)}</small></a>`;
        })
        .join("");
      const docs = plan.docs
        .slice(0, 30)
        .map((doc) => {
          const active = doc.slug === activeDocSlug ? " active" : "";
          return `<a class="nav-sub${active}" href="/plans/${plan.slug}/docs/${doc.slug}/"><span>${escapeHtml(doc.name)}</span></a>`;
        })
        .join("");

      return `<details class="nav-plan"${open}>
        <summary>${escapeHtml(plan.title)}</summary>
        <a class="nav-sub${plan.slug === activePlanSlug && !activeTaskId && !activeDocSlug ? " active" : ""}" href="/plans/${plan.slug}/"><span>Overview</span></a>
        <a class="nav-sub" href="/plans/${plan.slug}/tasks/"><span>Task Queue</span></a>
        <details class="nav-group"${activeTaskId && plan.slug === activePlanSlug ? " open" : ""}>
          <summary>Tasks</summary>
          ${tasks || '<span class="nav-empty">No parsed tasks</span>'}
        </details>
        <details class="nav-group"${activeDocSlug && plan.slug === activePlanSlug ? " open" : ""}>
          <summary>Docs</summary>
          ${docs}
        </details>
      </details>`;
    })
    .join("");

  return `<aside class="sidebar" id="sidebar">
    <div class="sidebar-head">
      <a class="brand" href="/">Implementation Plan Wiki</a>
      <input id="nav-filter" type="search" placeholder="Filter plans, tasks, docs…" aria-label="Filter navigation" autocomplete="off">
    </div>
    <nav>${planLinks}</nav>
  </aside>`;
}

const themeBootScript = `(function(){try{var t=localStorage.getItem('wiki-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

const themeToggleButton = `<button class="icon-btn theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle light/dark theme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
      </button>`;

const navToggleButton = `<button class="icon-btn nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="sidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"></path></svg>
      </button>`;

// Rebuilds dist/ from the canonical plan markdown. Hidden by default; src/app.js
// reveals it only when the local dev server (scripts/serve.mjs) answers
// GET /api/regenerate, so static/Vercel hosting never shows a dead button.
const regenerateButton = `<button class="icon-btn regen-toggle" type="button" hidden aria-label="Regenerate wiki from plan files" title="Regenerate from plan files">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v5h-5"></path></svg>
      </button>`;

function layout({ plans, title, activePlanSlug, activeTaskId, activeDocSlug, breadcrumbs, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} - Implementation Plan Wiki</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script>${themeBootScript}</script>
</head>
<body>
  <div class="app-shell">
    ${makeNav(plans, activePlanSlug, activeTaskId, activeDocSlug)}
    <main class="content">
      <header class="topbar">
        ${navToggleButton}
        <div class="breadcrumbs">${breadcrumbs.map((crumb) => `<a href="${crumb.href}">${escapeHtml(crumb.label)}</a>`).join("<span>/</span>")}</div>
        ${regenerateButton}
        ${themeToggleButton}
      </header>
      <div class="content-body">
        ${body}
      </div>
    </main>
  </div>
  <div class="scrim" id="nav-scrim"></div>
  <script src="/assets/app.js"></script>
</body>
</html>`;
}

async function writePage(relativePath, html) {
  const target = path.resolve(outDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
}

function statCards(plans) {
  const taskCount = plans.reduce((sum, plan) => sum + plan.tasks.length, 0);
  const blockedCount = plans.reduce((sum, plan) => sum + plan.tasks.filter((task) => statusClass(task.status) === "blocked").length, 0);
  const inProgressCount = plans.reduce((sum, plan) => sum + plan.tasks.filter((task) => statusClass(task.status) === "progress").length, 0);
  return `<div class="stats">
    <div><strong>${plans.length}</strong><span>Plans</span></div>
    <div><strong>${taskCount}</strong><span>Tasks</span></div>
    <div><strong>${inProgressCount}</strong><span>In progress</span></div>
    <div><strong>${blockedCount}</strong><span>Blocked</span></div>
  </div>`;
}

function planCards(plans) {
  return `<div class="plan-grid">${plans.map((plan) => `<a class="plan-card" href="/plans/${plan.slug}/">
    <span class="badge ${statusClass(plan.status)}">${escapeHtml(plan.status)}</span>
    <h2>${escapeHtml(plan.title)}</h2>
    <p>${escapeHtml(plan.slug)}</p>
    <dl>
      <div><dt>Docs</dt><dd>${plan.docs.length}</dd></div>
      <div><dt>Tasks</dt><dd>${plan.tasks.length}</dd></div>
    </dl>
  </a>`).join("")}</div>`;
}

function taskTable(plan, tasks) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>ID</th><th>Task</th><th>Status</th><th>Priority</th><th>Owner</th></tr></thead>
    <tbody>${tasks.map((task) => `<tr>
      <td><a href="/plans/${plan.slug}/tasks/${encodeURIComponent(task.id)}/">${escapeHtml(task.id)}</a></td>
      <td>${markdownInline(task.title)}</td>
      <td><span class="badge ${statusClass(task.status)}">${escapeHtml(task.status)}</span></td>
      <td>${escapeHtml(task.priority)}</td>
      <td>${escapeHtml(task.owner)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function docList(plan) {
  return `<div class="doc-list">${plan.docs.map((doc) => `<a href="/plans/${plan.slug}/docs/${doc.slug}/">
    <strong>${escapeHtml(doc.title)}</strong>
    <span>${escapeHtml(doc.name)}</span>
  </a>`).join("")}</div>`;
}

function publicPlaceholderHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Implementation Plan Wiki</title>
  <style>
    :root { --bg: #f6f7f9; --panel: #fff; --ink: #1f2328; --muted: #59636e; --line: #d6dce2; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0d1117; --panel: #161b22; --ink: #e6edf3; --muted: #9198a1; --line: #2c333d; }
    }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    section { max-width: 680px; border: 1px solid var(--line); background: var(--panel); padding: 24px; border-radius: 8px; }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Implementation Plan Wiki</h1>
      <p>This public production alias is intentionally empty. Use the Vercel-authenticated deployment URL shared by the team to access hosted implementation plans.</p>
    </section>
  </main>
</body>
</html>`;
}

async function copyAssets() {
  await mkdir(path.resolve(outDir, "assets"), { recursive: true });
  const styles = await readFile(path.resolve(siteRoot, "src", "styles.css"), "utf8");
  const app = await readFile(path.resolve(siteRoot, "src", "app.js"), "utf8");
  await writeFile(path.resolve(outDir, "assets", "styles.css"), styles);
  await writeFile(path.resolve(outDir, "assets", "app.js"), app);
}

async function build() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (publicPlaceholder) {
    await writePage("index.html", publicPlaceholderHtml());
    await writePage("health.json", `${JSON.stringify({ ok: true, publicPlaceholder: true }, null, 2)}\n`);
    await writePage("site-data.json", `${JSON.stringify({ publicPlaceholder: true }, null, 2)}\n`);
    console.log("Built public placeholder dist");
    return;
  }

  const plans = await collectPlans();
  await copyAssets();

  await writePage("index.html", layout({
    plans,
    title: "All Plans",
    breadcrumbs: [{ label: "All Plans", href: "/" }],
    body: `<section class="page-head">
      <p class="eyebrow">Git-tracked implementation plans</p>
      <h1>Implementation Plan Wiki</h1>
      <p class="lead">Browse every plan from master context down to individual queue items. Git remains canonical; this is a generated hosted view.</p>
      ${statCards(plans)}
    </section>
    <section class="section">
      <h2>Plans</h2>
      ${planCards(plans)}
    </section>`,
  }));

  for (const plan of plans) {
    await writePage(`plans/${plan.slug}/index.html`, layout({
      plans,
      activePlanSlug: plan.slug,
      title: plan.title,
      breadcrumbs: [
        { label: "All Plans", href: "/" },
        { label: plan.title, href: `/plans/${plan.slug}/` },
      ],
      body: `<section class="page-head">
        <p class="eyebrow">${escapeHtml(plan.slug)}</p>
        <h1>${escapeHtml(plan.title)}</h1>
        <p class="lead">Status: <span class="badge ${statusClass(plan.status)}">${escapeHtml(plan.status)}</span></p>
        <div class="actions">
          <a href="/plans/${plan.slug}/tasks/">Open task queue</a>
          <span class="source-path">Source: ${sourcePathLabel(`implementation_plans/${plan.slug}/`)}</span>
        </div>
      </section>
      <section class="section">
        <h2>Task Summary</h2>
        ${taskTable(plan, plan.tasks.slice(0, 20))}
      </section>
      <section class="section">
        <h2>Docs</h2>
        ${docList(plan)}
      </section>`,
    }));

    const grouped = taskGroups(plan.tasks);
    await writePage(`plans/${plan.slug}/tasks/index.html`, layout({
      plans,
      activePlanSlug: plan.slug,
      title: `${plan.title} Tasks`,
      breadcrumbs: [
        { label: "All Plans", href: "/" },
        { label: plan.title, href: `/plans/${plan.slug}/` },
        { label: "Tasks", href: `/plans/${plan.slug}/tasks/` },
      ],
      body: `<section class="page-head">
        <p class="eyebrow">Task queue</p>
        <h1>${escapeHtml(plan.title)} Tasks</h1>
        <p class="lead">${plan.tasks.length} parsed queue items grouped by section.</p>
      </section>
      ${grouped.map(([section, tasks]) => `<section class="section">
        <h2>${escapeHtml(section)}</h2>
        ${taskTable(plan, tasks)}
      </section>`).join("") || "<p>No parsed tasks.</p>"}`,
    }));

    for (const task of plan.tasks) {
      await writePage(`plans/${plan.slug}/tasks/${encodeURIComponent(task.id)}/index.html`, layout({
        plans,
        activePlanSlug: plan.slug,
        activeTaskId: task.id,
        title: `${task.id} - ${task.title}`,
        breadcrumbs: [
          { label: "All Plans", href: "/" },
          { label: plan.title, href: `/plans/${plan.slug}/` },
          { label: "Tasks", href: `/plans/${plan.slug}/tasks/` },
          { label: task.id, href: `/plans/${plan.slug}/tasks/${encodeURIComponent(task.id)}/` },
        ],
        body: `<article class="task-detail">
          <p class="eyebrow">${escapeHtml(task.section)}</p>
          <h1><span class="task-id">${escapeHtml(task.id)}</span> &middot; ${markdownInline(task.title)}</h1>
          <div class="meta-grid">
            <div><strong>Status</strong><span class="badge ${statusClass(task.status)}">${escapeHtml(task.status)}</span></div>
            <div><strong>Priority</strong><span>${escapeHtml(task.priority)}</span></div>
            <div><strong>Owner</strong><span>${escapeHtml(task.owner)}</span></div>
          </div>
          <h2>Notes</h2>
          <p>${markdownInline(task.notes || "No notes listed.")}</p>
          ${relatedWorkSection(plan, task)}
          <h2>Source</h2>
          <p>${sourcePathLabel(`implementation_plans/${plan.slug}/TASK_QUEUE.md`)}</p>
        </article>`,
      }));
    }

    for (const doc of plan.docs) {
      await writePage(`plans/${plan.slug}/docs/${doc.slug}/index.html`, layout({
        plans,
        activePlanSlug: plan.slug,
        activeDocSlug: doc.slug,
        title: `${plan.title} - ${doc.title}`,
        breadcrumbs: [
          { label: "All Plans", href: "/" },
          { label: plan.title, href: `/plans/${plan.slug}/` },
          { label: doc.name, href: `/plans/${plan.slug}/docs/${doc.slug}/` },
        ],
        body: `<article class="doc-page">
          <p class="eyebrow">${escapeHtml(doc.name)}</p>
          <h1>${escapeHtml(doc.title)}</h1>
          <p>Canonical source: ${sourcePathLabel(doc.sourcePath)}</p>
          <hr>
          ${markdownToHtml(doc.content)}
        </article>`,
      }));
    }
  }

  const siteData = {
    generatedAt: new Date().toISOString(),
    publicPlaceholder: false,
    plans: plans.map((plan) => ({
      slug: plan.slug,
      title: plan.title,
      status: plan.status,
      docs: plan.docs.map((doc) => ({ name: doc.name, slug: doc.slug, title: doc.title, sourcePath: doc.sourcePath })),
      tasks: plan.tasks,
    })),
  };

  await writePage("site-data.json", `${JSON.stringify(siteData, null, 2)}\n`);
  await writePage("health.json", `${JSON.stringify({ ok: true, publicPlaceholder: false, planCount: plans.length }, null, 2)}\n`);
  await writePage("404.html", layout({
    plans,
    title: "Not Found",
    breadcrumbs: [{ label: "All Plans", href: "/" }],
    body: `<section class="page-head"><h1>Not found</h1><p class="lead">This implementation-plan wiki route does not exist.</p></section>`,
  }));

  console.log(`Built ${plans.length} plans into ${path.relative(process.cwd(), outDir)}`);
}

await build();

#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const outDir = path.resolve(siteRoot, "dist");
const publicPlaceholder = process.env.PLAN_PUBLIC_PLACEHOLDER === "1";

async function readRequired(relativePath) {
  try {
    return await readFile(path.resolve(outDir, relativePath), "utf8");
  } catch (error) {
    throw new Error(`missing generated file ${relativePath}: ${error.message}`);
  }
}

const index = await readRequired("index.html");
const health = JSON.parse(await readRequired("health.json"));
const siteData = JSON.parse(await readRequired("site-data.json"));

if (publicPlaceholder) {
  if (!index.includes("intentionally empty") || health.publicPlaceholder !== true) {
    throw new Error("public placeholder build is not safe");
  }
  console.log("Wiki placeholder smoke test passed");
  process.exit(0);
}

if (!index.includes("Implementation Plan Wiki")) {
  throw new Error("index.html does not look like the wiki");
}

if (!Array.isArray(siteData.plans) || siteData.plans.length === 0) {
  throw new Error("site-data.json has no plans");
}

// Project-agnostic: exercise the first generated plan rather than a hardcoded slug.
const samplePlan = siteData.plans[0];
await readRequired(`plans/${samplePlan.slug}/index.html`);
await readRequired(`plans/${samplePlan.slug}/tasks/index.html`);

if (samplePlan.tasks.length > 0) {
  await readRequired(`plans/${samplePlan.slug}/tasks/${encodeURIComponent(samplePlan.tasks[0].id)}/index.html`);
}

if (health.ok !== true || health.publicPlaceholder !== false) {
  throw new Error("health.json has invalid wiki health state");
}

const checked = new Set();
const linkPattern = /\bhref="([^"]+)"/g;
const htmlFiles = [
  "index.html",
  `plans/${samplePlan.slug}/index.html`,
  `plans/${samplePlan.slug}/tasks/index.html`,
];

for (const plan of siteData.plans) {
  if (plan.tasks[0]) {
    htmlFiles.push(`plans/${plan.slug}/tasks/${encodeURIComponent(plan.tasks[0].id)}/index.html`);
  }
  if (plan.docs[0]) {
    htmlFiles.push(`plans/${plan.slug}/docs/${plan.docs[0].slug}/index.html`);
  }
}

for (const htmlFile of htmlFiles) {
  const html = await readRequired(htmlFile);
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    if (href.includes("#")) continue;
    if (checked.has(href)) continue;
    checked.add(href);

    const relative = href === "/"
      ? "index.html"
      : `${href.replace(/^\/+/, "").replace(/\/$/, "")}/index.html`;
    const assetRelative = href.replace(/^\/+/, "");
    if (!existsSync(path.resolve(outDir, relative)) && !existsSync(path.resolve(outDir, assetRelative))) {
      throw new Error(`broken generated link ${href} found in ${htmlFile}`);
    }
  }
}

console.log(`Wiki smoke test passed (${siteData.plans.length} plans)`);

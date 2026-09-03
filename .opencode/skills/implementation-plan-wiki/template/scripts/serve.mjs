#!/usr/bin/env node
// Local dev server for the plan wiki. Serves dist/ with clean URLs AND exposes a
// regenerate endpoint so the in-page "Regenerate" button can rebuild from the
// canonical plan markdown without dropping to a terminal. Dependency-free (Node
// builtins only); bound to localhost because POST /api/regenerate runs a build.
// This is a LOCAL convenience — static/Vercel hosting has no such endpoint, so the
// button feature-detects it and stays hidden there.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const distDir = path.resolve(siteRoot, "dist");
const buildScript = path.resolve(here, "build-site.mjs");
const host = "127.0.0.1";
// First candidate that parses to a valid port wins; junk (e.g. a stray shell
// arg like "#") is skipped, falling back to 8799 instead of crashing.
function pickPort(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") continue;
    const value = Number(candidate);
    if (Number.isInteger(value) && value >= 0 && value < 65536) return value;
  }
  return 8799;
}
const port = pickPort(process.env.PORT, process.argv[2]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

let building = false;

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [buildScript], { cwd: siteRoot });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ code, output: output.trim() }));
    child.on("error", (error) => resolve({ code: 1, output: String(error) }));
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(body);
}

// Resolve an incoming URL path to a file inside dist/, honoring the clean URLs the
// generator emits (`/plans/x/` -> `/plans/x/index.html`). Refuses path traversal.
async function resolveStatic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded.includes("\0")) return null;
  const safe = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  let target = path.join(distDir, safe);
  if (target !== distDir && !target.startsWith(distDir + path.sep)) return null;

  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");
  } catch {
    if (!path.extname(target)) {
      const asDir = path.join(target, "index.html");
      if (existsSync(asDir)) target = asDir;
      else if (existsSync(`${target}.html`)) target = `${target}.html`;
    }
  }
  return existsSync(target) ? target : null;
}

const server = createServer(async (req, res) => {
  const url = req.url || "/";
  const pathname = url.split("?")[0];

  if (pathname === "/api/regenerate") {
    if (req.method === "GET") {
      return sendJson(res, 200, { capable: true, building });
    }
    if (req.method === "POST") {
      if (building) return sendJson(res, 409, { ok: false, error: "build already running" });
      building = true;
      const result = await runBuild();
      building = false;
      const ok = result.code === 0;
      return sendJson(res, ok ? 200 : 500, { ok, code: result.code, output: result.output });
    }
    return sendJson(res, 405, { ok: false, error: "method not allowed" });
  }

  const file = await resolveStatic(pathname);
  if (!file) {
    const notFound = path.join(distDir, "404.html");
    if (existsSync(notFound)) {
      const body = await readFile(notFound);
      res.writeHead(404, { "content-type": MIME[".html"], "cache-control": "no-store" });
      return res.end(body);
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }

  const body = await readFile(file);
  res.writeHead(200, {
    "content-type": MIME[path.extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(body);
});

async function main() {
  if (!existsSync(distDir)) {
    console.log("No dist/ yet — running an initial build…");
    const result = await runBuild();
    if (result.code !== 0) {
      console.error(result.output);
      process.exitCode = 1;
      return;
    }
  }
  server.listen(port, host, () => {
    console.log(`Plan wiki dev server: http://${host}:${port}/`);
    console.log("The in-page Regenerate button rebuilds from implementation_plans/ (this server only).");
  });
}

await main();

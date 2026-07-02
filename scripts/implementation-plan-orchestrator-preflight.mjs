#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");

const defaults = {
  plan: "playbooks_teamwork_workbench",
  contextDir: ".context",
  stateFile: ".context/implementation-plan-orchestrator-state.json",
  plansRoot: "implementation_plans",
  maxActive: 3,
  staleMinutes: 180,
  spawnCooldownMinutes: 15,
};

function parseArgs(argv) {
  const options = { ...defaults, writeState: true, json: false, ackCloseouts: false, markLaunch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };
    if (arg === "--plan") options.plan = next();
    else if (arg === "--plans-root") options.plansRoot = next();
    else if (arg === "--context-dir") options.contextDir = next();
    else if (arg === "--state-file") options.stateFile = next();
    else if (arg === "--max-active") options.maxActive = Number.parseInt(next(), 10);
    else if (arg === "--stale-minutes") options.staleMinutes = Number.parseInt(next(), 10);
    else if (arg === "--spawn-cooldown-minutes") options.spawnCooldownMinutes = Number.parseInt(next(), 10);
    else if (arg === "--json") options.json = true;
    else if (arg === "--no-write-state") options.writeState = false;
    else if (arg === "--ack-closeouts") options.ackCloseouts = true;
    else if (arg === "--mark-launch") options.markLaunch = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  assertPositiveInteger(options.maxActive, "--max-active");
  assertPositiveInteger(options.staleMinutes, "--stale-minutes");
  assertPositiveInteger(options.spawnCooldownMinutes, "--spawn-cooldown-minutes");
  return options;
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function printHelp() {
  console.log(`Usage: node scripts/implementation-plan-orchestrator-preflight.mjs [options]

Cheap local preflight for implementation-plan orchestration. It reads the
canonical TASK_QUEUE.md plus scratch assignment/closeout files, writes a compact
state JSON, and prints NO_ACTION_REQUIRED, ACTION_REQUIRED, or BLOCKED.

Options:
  --plan <slug>                    Plan slug under implementation_plans/ (default: ${defaults.plan})
  --plans-root <path>              Plans root directory (default: ${defaults.plansRoot})
  --context-dir <path>             Scratch context directory (default: ${defaults.contextDir})
  --state-file <path>              State JSON path (default: ${defaults.stateFile})
  --max-active <n>                 Concurrency cap (default: ${defaults.maxActive})
  --stale-minutes <n>              Assignment stale threshold (default: ${defaults.staleMinutes})
  --spawn-cooldown-minutes <n>     Minimum minutes between launches (default: ${defaults.spawnCooldownMinutes})
  --ack-closeouts                  Mark current closeouts as reconciled in state
  --mark-launch                    Record now as the last launch time
  --no-write-state                 Do not write the state JSON
  --json                           Print the full state JSON instead of the one-line verdict
`);
}

function readText(relativePath) {
  return readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

function readJsonIfExists(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, "utf8"));
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

function splitMarkdownTableRowLoose(line, expectedCells) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const body = trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed.slice(1);
  const cells = [];
  let cursor = 0;
  for (let index = 0; index < body.length && cells.length < expectedCells - 1; index += 1) {
    if (body[index] !== "|") continue;
    cells.push(body.slice(cursor, index).trim());
    cursor = index + 1;
  }
  cells.push(body.slice(cursor).trim());
  return cells;
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTaskQueue(markdown) {
  const lines = markdown.split(/\r?\n/);
  const rows = [];
  let section = "Tasks";
  let designDoc = "";
  let ordinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^##\s+(.+)$/);
    if (heading) {
      section = stripMarkdown(heading[1]).replace(/^[-\s]+/, "").trim();
      designDoc = "";
      continue;
    }

    const designDocMatch = lines[index].match(/\*\*Design doc:\*\*.*?\(([^)]+\.md)\)/i);
    if (designDocMatch) {
      designDoc = designDocMatch[1].trim();
      continue;
    }

    const headerCells = splitMarkdownTableRow(lines[index]);
    if (!headerCells.includes("ID") || !headerCells.includes("Task")) continue;

    const separatorCells = splitMarkdownTableRow(lines[index + 1] || "");
    if (!isSeparatorRow(separatorCells)) continue;

    const headerMap = new Map(headerCells.map((cell, cellIndex) => [cell, cellIndex]));
    index += 2;

    while (index < lines.length) {
      const cells = splitMarkdownTableRowLoose(lines[index], headerCells.length);
      if (cells.length === 0 || isSeparatorRow(cells)) break;

      const get = (name) => cells[headerMap.get(name)] || "";
      const id = stripMarkdown(get("ID")).trim();
      if (id) {
        const rowText = cells.join(" ");
        rows.push({
          ordinal,
          id,
          title: stripMarkdown(get("Task")).trim(),
          status: normalizeToken(stripMarkdown(get("Status")).trim() || "UNKNOWN"),
          priority: normalizeToken(stripMarkdown(get("Priority")).trim() || "UNKNOWN"),
          owner: stripMarkdown(get("Owner")).trim() || "unassigned",
          reference: get("Reference"),
          notes: get("Notes"),
          section,
          designDoc,
          gate: finalGate(rowText),
          blockedBy: blockedByIds(rowText),
          hasBrief: false,
        });
        ordinal += 1;
      }
      index += 1;
    }
  }
  return rows;
}

function normalizeToken(value) {
  return String(value || "").trim().toUpperCase();
}

function finalGate(text) {
  const gates = [...String(text).matchAll(/\[GATE:\s*([^\]]+)\]/gi)].map((match) => match[1].trim().toLowerCase());
  return gates.at(-1) || "none";
}

function blockedByIds(text) {
  const match = String(text).match(/Blocked-by:\s*([^.;\]]+)/i);
  if (!match) return [];
  return [...match[1].matchAll(/\b[A-Z]{1,4}-\d+[a-z]?\b/g)].map((item) => item[0]);
}

function briefExists(planDir, rowId) {
  const absolutePlanDir = path.resolve(repoRoot, planDir);
  if (!existsSync(absolutePlanDir)) return false;
  const prefix = `OVERNIGHT_${rowId.replace(/-/g, "-")}_`;
  return readdirSync(absolutePlanDir).some((name) => name.startsWith(prefix) && name.endsWith(".md"));
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

function fileRecord(relativePath) {
  const absolutePath = path.resolve(repoRoot, relativePath);
  const stat = statSync(absolutePath);
  const content = readFileSync(absolutePath, "utf8");
  return {
    path: relativePath,
    rowId: extractRowId(relativePath, content),
    mtimeMs: Math.trunc(stat.mtimeMs),
    size: stat.size,
    sha256: hashContent(content),
  };
}

function extractRowId(relativePath, content) {
  const assigned = content.match(/Assigned row:\s*`?([A-Z]{1,4}-\d+[a-z]?)/i);
  if (assigned) return assigned[1].toUpperCase();
  const slice = content.match(/Slice:\s*`?([A-Z]{1,4}-\d+[a-z]?)/i);
  if (slice) return slice[1].toUpperCase();
  const heading = content.match(/(?:Assignment|Closeout).*?\b([A-Z]{1,4}-\d+[a-z]?)\b/i);
  if (heading) return heading[1].toUpperCase();
  const basename = path.basename(relativePath);
  const file = basename.match(/(?:ASSIGNMENT|CLOSEOUT)_([A-Z]{1,4}-\d+[a-z]?)/i);
  return file ? file[1].toUpperCase() : "UNKNOWN";
}

function collectContextFiles(contextDir) {
  const absoluteContextDir = path.resolve(repoRoot, contextDir);
  if (!existsSync(absoluteContextDir)) return { assignments: [], closeouts: [] };
  const names = readdirSync(absoluteContextDir);
  const assignments = names
    .filter((name) => /^CODEX_OFFLINE_ASSIGNMENT_.+\.md$/i.test(name))
    .map((name) => fileRecord(path.join(contextDir, name)));
  const closeouts = names
    .filter((name) => /^CODEX_OFFLINE_WORKER_CLOSEOUT_.+\.md$/i.test(name))
    .map((name) => fileRecord(path.join(contextDir, name)));
  return { assignments, closeouts };
}

function git(args, fallback = "") {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function priorityRank(priority) {
  const match = String(priority).match(/^P(\d+)$/i);
  return match ? Number.parseInt(match[1], 10) : 99;
}

function summarizeRows(rows) {
  const byStatus = {};
  const byGate = {};
  const byPriority = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byGate[row.gate] = (byGate[row.gate] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
  }
  return { total: rows.length, byStatus, byGate, byPriority };
}

function selectNextCandidate(rows, activeRowIds) {
  const byId = new Map(rows.map((row) => [row.id.toUpperCase(), row]));
  return rows
    .filter((row) => row.status === "PENDING")
    .filter((row) => row.gate === "offline")
    .filter((row) => !activeRowIds.has(row.id.toUpperCase()))
    .filter((row) => row.blockedBy.every((id) => byId.get(id.toUpperCase())?.status === "DONE"))
    .sort((left, right) => {
      const priority = priorityRank(left.priority) - priorityRank(right.priority);
      return priority !== 0 ? priority : left.ordinal - right.ordinal;
    })[0] || null;
}

function buildState(options) {
  const now = new Date();
  const planDir = path.join(options.plansRoot, options.plan);
  const taskQueuePath = `${planDir}/TASK_QUEUE.md`;
  const taskQueue = readText(taskQueuePath);
  const taskQueueStat = statSync(path.resolve(repoRoot, taskQueuePath));
  const rows = parseTaskQueue(taskQueue);
  for (const row of rows) row.hasBrief = briefExists(planDir, row.id);

  const previous = readJsonIfExists(options.stateFile) || {};
  const contextFiles = collectContextFiles(options.contextDir);
  const closeoutsByRow = new Map(contextFiles.closeouts.map((closeout) => [closeout.rowId, closeout]));
  const activeAssignments = contextFiles.assignments
    .filter((assignment) => !closeoutsByRow.has(assignment.rowId))
    .map((assignment) => ({
      ...assignment,
      ageMinutes: Math.max(0, Math.floor((now.getTime() - assignment.mtimeMs) / 60000)),
    }));
  const activeRowIds = new Set(activeAssignments.map((assignment) => assignment.rowId));
  const staleAssignments = activeAssignments.filter((assignment) => assignment.ageMinutes >= options.staleMinutes);
  const acknowledgedCloseouts = options.ackCloseouts
    ? Object.fromEntries(contextFiles.closeouts.map((closeout) => [closeout.path, closeout.sha256]))
    : previous.acknowledgedCloseouts || {};
  const pendingCloseouts = contextFiles.closeouts.filter((closeout) => acknowledgedCloseouts[closeout.path] !== closeout.sha256);

  const lastLaunchAt = options.markLaunch ? now.toISOString() : previous.orchestration?.lastLaunchAt || null;
  const lastLaunchMs = lastLaunchAt ? Date.parse(lastLaunchAt) : 0;
  const launchCooldownRemainingMinutes = lastLaunchMs
    ? Math.max(0, options.spawnCooldownMinutes - Math.floor((now.getTime() - lastLaunchMs) / 60000))
    : 0;
  const belowConcurrencyCap = activeAssignments.length < options.maxActive;
  const nextOfflineCandidate = selectNextCandidate(rows, activeRowIds);

  const reasons = [];
  if (pendingCloseouts.length > 0) reasons.push("completed_closeouts_pending");
  if (staleAssignments.length > 0) reasons.push("stale_assignments");
  if (belowConcurrencyCap && nextOfflineCandidate && launchCooldownRemainingMinutes === 0) {
    reasons.push("below_concurrency_cap_with_candidate");
  }

  const blockedReasons = [];
  if (!nextOfflineCandidate && activeAssignments.length === 0 && pendingCloseouts.length === 0) {
    blockedReasons.push("no_offline_candidate");
  }

  const actionRequired = reasons.length > 0;
  const verdict = actionRequired ? "ACTION_REQUIRED" : blockedReasons.length > 0 ? "BLOCKED" : "NO_ACTION_REQUIRED";

  return {
    generatedAt: now.toISOString(),
    repo: {
      branch: git(["branch", "--show-current"], "unknown"),
      head: git(["rev-parse", "--short", "HEAD"], "unknown"),
    },
    plan: {
      slug: options.plan,
      taskQueuePath,
      taskQueueHash: hashContent(taskQueue),
      taskQueueMtimeMs: Math.trunc(taskQueueStat.mtimeMs),
      counts: summarizeRows(rows),
    },
    options: {
      maxActive: options.maxActive,
      staleMinutes: options.staleMinutes,
      spawnCooldownMinutes: options.spawnCooldownMinutes,
    },
    assignments: {
      active: activeAssignments,
      stale: staleAssignments,
      completed: contextFiles.assignments.filter((assignment) => closeoutsByRow.has(assignment.rowId)),
    },
    closeouts: {
      pending: pendingCloseouts,
      all: contextFiles.closeouts,
    },
    orchestration: {
      verdict,
      actionRequired,
      reasons,
      blockedReasons,
      activeCount: activeAssignments.length,
      belowConcurrencyCap,
      lastLaunchAt,
      launchCooldownRemainingMinutes,
      nextOfflineCandidate: nextOfflineCandidate ? {
        id: nextOfflineCandidate.id,
        title: nextOfflineCandidate.title,
        priority: nextOfflineCandidate.priority,
        owner: nextOfflineCandidate.owner,
        section: nextOfflineCandidate.section,
        designDoc: nextOfflineCandidate.designDoc,
        hasBrief: nextOfflineCandidate.hasBrief,
      } : null,
    },
    acknowledgedCloseouts,
  };
}

function verdictLine(state) {
  const next = state.orchestration.nextOfflineCandidate?.id || "none";
  const reasons = state.orchestration.reasons.length ? state.orchestration.reasons.join(",") : "none";
  const blockers = state.orchestration.blockedReasons.length ? state.orchestration.blockedReasons.join(",") : "none";
  return [
    state.orchestration.verdict,
    `reasons=${reasons}`,
    `active=${state.orchestration.activeCount}/${state.options.maxActive}`,
    `stale=${state.assignments.stale.length}`,
    `pending_closeouts=${state.closeouts.pending.length}`,
    `next=${next}`,
    `cooldown=${state.orchestration.launchCooldownRemainingMinutes}m`,
    `blocked=${blockers}`,
  ].join(" ");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const state = buildState(options);
  if (options.writeState) {
    const statePath = path.resolve(repoRoot, options.stateFile);
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
  console.log(options.json ? JSON.stringify(state, null, 2) : verdictLine(state));
}

try {
  main();
} catch (error) {
  console.error(`implementation-plan-orchestrator-preflight: ${error.message}`);
  process.exit(1);
}

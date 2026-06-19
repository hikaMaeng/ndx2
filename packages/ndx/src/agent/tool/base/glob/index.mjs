#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { compileGlob, matchesGlob, normalizeGlobPath } from "../_lib/glob.mjs";

const pattern = process.argv[2] ?? "";
const pathInput = process.argv[3] || ".";
const rawLimit = Number(process.argv[4] || "100");
const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 5000) : 100;
const projectHome = path.resolve(process.env.NDX_PROJECT_HOME || process.cwd());
const virtualRoot = path.resolve(process.env.NDX_USER_HOME || projectHome);
const callId = process.env.NDX_TOOL_CALL_ID || "";
const excludedDirectoryNames = new Set([".git", "node_modules", ".yarn", ".turbo", ".vite", ".next", "dist", "build", "coverage", "volume"]);

if (!pattern.trim()) {
  emitError("pattern is required.");
  process.exit(1);
}

emitProgress("resolving search root");
const root = resolveNdxPath(pathInput, projectHome);
if (!isInside(root, virtualRoot)) {
  emitError(pathCorrectionMessage("path escapes NDX virtual root", pathInput, root));
  process.exit(1);
}

let rootStat;
try {
  rootStat = await fs.stat(root);
} catch {
  emitError(pathCorrectionMessage("search root does not exist", pathInput, root));
  process.exit(1);
}
if (!rootStat.isDirectory() && !rootStat.isFile()) {
  emitError(`search root is not a file or directory: ${pathInput}`);
  process.exit(1);
}

let globRegex;
try {
  globRegex = compileGlob(pattern);
} catch (error) {
  emitError(`invalid glob pattern: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

emitProgress("scanning files");
const files = [];
let total = 0;
for await (const filePath of filesUnder(root, root)) {
  if (!matchesGlob(filePath, globRegex, { projectHome, searchRoot: root })) {
    continue;
  }
  total += 1;
  if (files.length < limit) {
    files.push(filePath);
  }
}

emitProgress("formatting results");
const output = {
  pattern,
  root,
  count: total,
  files,
  truncated: total > files.length
};
emitSidebarItem({
  group: { id: "file-searches", title: "파일 검색" },
  key: `glob:${pattern}:${root}:${callId}`,
  title: pattern,
  body: `${root} · ${total}개 파일`,
  kind: "glob"
});
emitResult(output);

function emitProgress(message) {
  console.log(JSON.stringify({ type: "progress", message }));
}

function emitError(message) {
  console.log(JSON.stringify({ type: "error", success: false, message }));
}

function emitResult(output) {
  console.log(JSON.stringify({ type: "result", success: true, output }));
}

function emitSidebarItem(input) {
  const payload = { type: "ndx.agentcall", name: "session.sidebar_item", input };
  console.log(`[[ndx-agentcall:${JSON.stringify(payload)}]]`);
}

function resolveNdxPath(input, base) {
  let normalizedInput = normalizeGlobPath(input.trim() || ".");
  const projectName = path.basename(projectHome);
  for (const prefix of [`/ndx/workspace/${projectName}`, `/workspace/${projectName}`, `workspace/${projectName}`, `ndx/workspace/${projectName}`]) {
    while (normalizedInput === prefix || normalizedInput.startsWith(`${prefix}/`)) {
      normalizedInput = normalizedInput.slice(prefix.length).replace(/^\/+/, "") || ".";
    }
  }
  return path.resolve(path.isAbsolute(normalizedInput) ? normalizedInput : path.join(base, normalizedInput));
}

function isInside(candidate, rootPath) {
  const relative = path.relative(rootPath, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function* filesUnder(current, rootPath) {
  let stat;
  try {
    stat = await fs.lstat(current);
  } catch {
    return;
  }
  if (stat.isFile()) {
    yield current;
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }

  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const child = path.join(current, entry.name);
    if (entry.isDirectory() && shouldSkipDirectory(child, rootPath)) {
      continue;
    }
    if (entry.isDirectory() || entry.isFile()) {
      yield* filesUnder(child, rootPath);
    }
  }
}

function shouldSkipDirectory(directory, rootPath) {
  if (path.resolve(directory) === path.resolve(rootPath)) {
    return false;
  }
  const relative = normalizeGlobPath(path.relative(projectHome, directory));
  return excludedDirectoryNames.has(path.basename(directory)) || relative === ".ndx/tool-output" || relative.startsWith(".ndx/tool-output/");
}

function pathCorrectionMessage(reason, originalInput, resolvedPath) {
  return [
    `${reason}: ${originalInput}`,
    `resolved path: ${resolvedPath}`,
    `project root: ${projectHome}`,
    `NDX virtual root: ${virtualRoot}`,
    "Use project-relative paths for project files. Common virtual forms such as /workspace/<project>, workspace/<project>, and ndx/workspace/<project> are accepted."
  ].join("\n");
}

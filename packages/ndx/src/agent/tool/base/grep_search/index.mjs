#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const pattern = process.argv[2] ?? "";
const pathInput = process.argv[3] || ".";
const globPattern = process.argv[4] || "";
const rawLimit = Number(process.argv[5] || "100");
const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000) : 100;
const projectHome = path.resolve(process.env.NDX_PROJECT_HOME || process.cwd());
const virtualRoot = path.resolve(process.env.NDX_USER_HOME || projectHome);
const callId = process.env.NDX_TOOL_CALL_ID || "";
const excludedDirectoryNames = new Set([".git", "node_modules", ".yarn", ".turbo", ".vite", ".next", "dist", "build", "coverage", "volume"]);
const maxFileBytes = 2 * 1024 * 1024;
const maxLineLength = 2000;

if (!pattern) {
  emitError("pattern is required.");
  process.exit(1);
}

let regex;
try {
  regex = new RegExp(pattern, "i");
} catch (error) {
  emitError(`invalid JavaScript regular expression: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

emitProgress("resolving search root");
const root = resolveNdxPath(pathInput, projectHome);
if (!isInside(root, virtualRoot)) {
  emitError(`path escapes NDX virtual root: ${pathInput}`);
  process.exit(1);
}

emitProgress("searching files");
const globRegex = globPattern ? compileGlob(globPattern) : undefined;
const matches = [];
let truncated = false;

for await (const filePath of filesUnder(root, root)) {
  if (truncated) {
    break;
  }
  if (globRegex && !matchesGlob(filePath, globRegex)) {
    continue;
  }
  await searchFile(filePath);
}

emitProgress("formatting results");
const payload = {
  pattern,
  root,
  matches,
  count: matches.length,
  truncated
};
emitSidebarItem({
  group: { id: "text-searches", title: "텍스트 검색" },
  key: `grep-search:${pattern}:${callId}`,
  title: pattern,
  body: `${matches.length}개 매치`,
  kind: "grep_search"
});
emitResult(payload);

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
  return path.resolve(path.isAbsolute(input) ? input : path.join(base, input));
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
  const relative = normalizeRelative(path.relative(projectHome, directory));
  return excludedDirectoryNames.has(path.basename(directory)) || relative === ".ndx/tool-output" || relative.startsWith(".ndx/tool-output/");
}

function compileGlob(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesGlob(filePath, globRegex) {
  const relative = normalizeRelative(path.relative(projectHome, filePath));
  return globRegex.test(relative) || globRegex.test(path.basename(filePath));
}

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

async function searchFile(filePath) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return;
  }
  if (!stat.isFile() || stat.size > maxFileBytes) {
    return;
  }
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return;
  }
  if (buffer.includes(0)) {
    return;
  }
  const lines = buffer.toString("utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? "";
    regex.lastIndex = 0;
    if (regex.test(text)) {
      if (matches.length < limit) {
        matches.push({
          path: filePath,
          line: index + 1,
          text: text.length > maxLineLength ? `${text.slice(0, maxLineLength)}...` : text
        });
      } else {
        truncated = true;
        return;
      }
    }
  }
}

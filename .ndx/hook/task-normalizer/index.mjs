import fs from "node:fs/promises";
import path from "node:path";
import { emitEffect, readContext } from "./lib.mjs";

const context = await readContext();
const projectHome = context.projectHome || process.cwd();
const testRoot = path.join(projectHome, "test");
const candidates = [];

async function walk(directory) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith("_report.json")) {
      candidates.push(full);
    }
  }
}

await walk(testRoot);
const tasks = [];
for (const file of candidates.sort()) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    const categories = Object.entries(parsed).filter(([key, value]) => key !== "@meta" && value && typeof value === "object");
    if (categories.length === 0) continue;
    const checks = categories.flatMap(([category, value]) => {
      const items = Array.isArray(value?.items) ? value.items : [];
      return items.map((item) => `${category}: ${item.id || item.description || "unnamed"} => ${item.description || "no description"}`);
    });
    if (checks.length > 0) {
      tasks.push({ file: path.relative(projectHome, file), checks });
    }
  } catch {
    // Ignore non-suite JSON.
  }
}

if (tasks.length === 0) {
  emitEffect({ type: "noeffect" });
} else {
  const content = [
    "PROJECT HOOK: Treat discovered task JSON as an executable checklist before broad implementation.",
    "Normalize vague suite items into concrete commands, expected artifacts, and stop conditions.",
    "If a suite cannot be executed, state that as the first blocker instead of continuing implementation.",
    ...tasks.slice(-3).map((task) => [`Task file: ${task.file}`, ...task.checks.map((check) => `- ${check}`)].join("\n"))
  ].join("\n\n");
  emitEffect({
    type: "noeffect",
    appendMessages: [{ role: "system", content }]
  });
}

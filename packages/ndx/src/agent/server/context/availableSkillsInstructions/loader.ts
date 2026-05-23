import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ndxBasePath, normalizeWslPath } from "../../../../common/file/index.js";
import type { SessionMetadata } from "../types.js";
import { parseSkillFile } from "./parser.js";
import type { SkillMetadata, SkillRoot, SkillScope } from "./types.js";

const MAX_SCAN_DEPTH = 6;

export async function loadSkills(sessionMetadata: Pick<SessionMetadata, "userHome" | "projectHome" | "cwd">): Promise<SkillMetadata[]> {
  const userHome = sessionMetadata.userHome ?? os.homedir();
  const projectHome = normalizeWslPath(sessionMetadata.projectHome ?? sessionMetadata.cwd);
  const roots = await resolveSkillRoots(userHome, projectHome);
  const byName = new Map<string, SkillMetadata>();

  for (const root of roots) {
    for (const skillPath of await discoverSkillFiles(root.path)) {
      const parsed = await parseSkillFile(skillPath, root);
      if (parsed) {
        byName.set(parsed.name, parsed);
      }
    }
  }

  const ignoredSkillNames = await loadIgnoredSkillNames(userHome, projectHome);
  return [...byName.values()].filter((skill) => !ignoredSkillNames.has(skill.name)).sort((a, b) =>
    promptScopeRank(a.scope) - promptScopeRank(b.scope)
    || a.name.localeCompare(b.name)
    || a.pathToSkillMd.localeCompare(b.pathToSkillMd)
  );
}

async function loadIgnoredSkillNames(userHome: string, projectHome: string): Promise<Set<string>> {
  const ignored = new Set<string>();
  for (const ignorePath of [
    path.posix.join(ndxBasePath(userHome), "system", ".skillignore"),
    path.posix.join(projectHome, ".ndx", ".skillignore"),
  ]) {
    const contents = await readTextFileOptional(ignorePath);
    for (const line of contents?.split(/\r?\n/) ?? []) {
      const name = line.trim();
      if (name) {
        ignored.add(name);
      }
    }
  }
  return ignored;
}

async function readTextFileOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function resolveSkillRoots(userHome: string, projectHome: string): Promise<SkillRoot[]> {
  const userNdx = ndxBasePath(userHome);
  const projectNdx = path.posix.join(normalizeWslPath(projectHome), ".ndx");
  const roots: SkillRoot[] = [];

  roots.push(...await pluginSkillRoots(path.posix.join(userNdx, "plugin"), "user"));
  roots.push({ path: path.posix.join(userNdx, "skills"), scope: "user" });
  roots.push(...await pluginSkillRoots(path.posix.join(projectNdx, "plugin"), "repo"));
  roots.push({ path: path.posix.join(projectNdx, "skills"), scope: "repo" });
  roots.push(...await pluginSkillRoots(path.posix.join(userNdx, "system", "plugin"), "system"));
  roots.push({ path: path.posix.join(userNdx, "system", "skills"), scope: "system" });

  return roots;
}

async function pluginSkillRoots(pluginDirectory: string, scope: SkillScope): Promise<SkillRoot[]> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(pluginDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => ({ path: path.posix.join(pluginDirectory, entry.name, "skills"), scope }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function discoverSkillFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [{ directory: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > MAX_SCAN_DEPTH) {
      continue;
    }

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(current.directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.posix.join(current.directory, entry.name);
      if (entry.isDirectory()) {
        queue.push({ directory: entryPath, depth: current.depth + 1 });
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function promptScopeRank(scope: SkillScope): number {
  if (scope === "system") {
    return 0;
  }
  if (scope === "repo") {
    return 1;
  }
  return 2;
}

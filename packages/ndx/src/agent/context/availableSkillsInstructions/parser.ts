import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeWslPath } from "../../../common/file/index.js";
import type { SkillMetadata, SkillRoot } from "./types.js";

type SkillCache = {
  name: string;
  description: string;
  sourceMtimeMs?: number;
  sourceSize?: number;
};

export async function parseSkillFile(skillPath: string, root: SkillRoot): Promise<SkillMetadata | undefined> {
  const skillDirectory = path.dirname(skillPath);
  const sourceStat = await fs.stat(skillPath);
  const cached = await readSkillCache(path.join(skillDirectory, ".cache"), sourceStat);
  if (cached) {
    return {
      name: cached.name,
      description: cached.description,
      pathToSkillMd: normalizeWslPath(skillPath),
      root: normalizeWslPath(root.path),
      scope: root.scope,
    };
  }

  const contents = await fs.readFile(skillPath, "utf8");
  const frontmatter = extractFrontmatter(contents);
  if (!frontmatter) {
    return undefined;
  }

  const fields = parseFlatYamlFrontmatter(frontmatter);
  const fallbackName = path.basename(path.dirname(skillPath));
  const name = sanitizeSingleLine(fields.get("name") ?? fallbackName);
  if (!name) {
    return undefined;
  }

  const parsed = {
    name,
    description: sanitizeSingleLine(fields.get("description") ?? ""),
    sourceMtimeMs: sourceStat.mtimeMs,
    sourceSize: sourceStat.size,
  };
  await fs.writeFile(path.join(skillDirectory, ".cache"), JSON.stringify(parsed, null, 2), "utf8");

  return {
    name: parsed.name,
    description: parsed.description,
    pathToSkillMd: normalizeWslPath(skillPath),
    root: normalizeWslPath(root.path),
    scope: root.scope,
  };
}

async function readSkillCache(cachePath: string, sourceStat: Awaited<ReturnType<typeof fs.stat>>): Promise<SkillCache | undefined> {
  let contents: string;
  try {
    contents = await fs.readFile(cachePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const parsed = JSON.parse(contents) as Partial<SkillCache>;
  const name = sanitizeSingleLine(parsed.name ?? "");
  if (!name || parsed.sourceMtimeMs !== sourceStat.mtimeMs || parsed.sourceSize !== sourceStat.size) {
    return undefined;
  }
  return {
    name,
    description: sanitizeSingleLine(parsed.description ?? ""),
  };
}

function extractFrontmatter(contents: string): string | undefined {
  const lines = contents.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return undefined;
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex <= 1) {
    return undefined;
  }

  return lines.slice(1, closingIndex).join("\n");
}

function parseFlatYamlFrontmatter(frontmatter: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, rawKey, rawValue] = match;
    fields.set(rawKey.toLowerCase(), rawValue.replace(/^['"]|['"]$/g, ""));
  }
  return fields;
}

function sanitizeSingleLine(raw: string): string {
  return raw.split(/\s+/).filter(Boolean).join(" ");
}

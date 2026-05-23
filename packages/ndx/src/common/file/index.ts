import { constants as fsConstants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

function toPosixSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeDrivePrefix(value: string): string {
  const normalized = toPosixSlashes(value);
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!match) {
    return normalized;
  }

  const [, drive, rest] = match;
  return path.posix.join("/mnt", drive.toLowerCase(), rest);
}

export function normalizeWslPath(value: string): string {
  if (!value) {
    return value;
  }
  if (value.startsWith("/mnt/")) {
    return toPosixSlashes(value);
  }
  if (/^[A-Za-z]:/.test(value)) {
    return normalizeDrivePrefix(value);
  }
  return toPosixSlashes(value);
}

export function ndxBasePath(userHome?: string): string {
  const home = userHome ?? os.homedir();
  return path.posix.join(normalizeWslPath(home), ".ndx");
}

export function ndxFilePath(userHome: string, ...segments: string[]): string {
  return path.posix.join(ndxBasePath(userHome), ...segments.map((segment) => toPosixSlashes(segment)));
}

export async function readTextFileOptional(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeTextFileIfNotExists(filePath: string, text: string): Promise<void> {
  try {
    await fs.writeFile(filePath, text, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "EEXIST") {
      return;
    }
    throw error;
  }
}

export async function ensureDirectory(pathToCreate: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(pathToCreate, { recursive: true });
}

export interface CopyDirectoryOptions {
  overwriteExisting?: boolean;
}

export async function copyDirectoryRecursively(
  sourceDirectory: string,
  targetDirectory: string,
  options: CopyDirectoryOptions = {}
): Promise<void> {
  const { overwriteExisting = false } = options;

  let sourceEntries;
  try {
    sourceEntries = await fs.readdir(sourceDirectory, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return;
    }
    throw error;
  }

  await ensureDirectory(targetDirectory);
  for (const entry of sourceEntries) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const targetPath = path.join(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursively(sourcePath, targetPath, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      if (overwriteExisting) {
        await fs.copyFile(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (!overwriteExisting && nodeError.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
}

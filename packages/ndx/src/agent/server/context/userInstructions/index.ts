import os from "node:os";
import path from "node:path";
import { NDX_AGENTS_FILE, type SessionMetadata } from "../types.js";
import { ndxFilePath, readTextFileOptional } from "../../../../common/file/index.js";

export async function buildUserInstructions(sessionMetadata: SessionMetadata): Promise<string[]> {
  const userHome = sessionMetadata.userHome ?? os.homedir();
  const projectHome = sessionMetadata.projectHome ?? sessionMetadata.cwd;
  const sources = [ndxFilePath(userHome, NDX_AGENTS_FILE)];
  const projectRoot = path.resolve(projectHome);
  const cwd = path.resolve(sessionMetadata.cwd);
  const relativeCwd = path.relative(projectRoot, cwd);

  sources.push(path.join(projectRoot, NDX_AGENTS_FILE));
  if (relativeCwd && !relativeCwd.startsWith("..") && !path.isAbsolute(relativeCwd)) {
    let currentDirectory = projectRoot;
    for (const segment of relativeCwd.split(path.sep)) {
      currentDirectory = path.join(currentDirectory, segment);
      sources.push(path.join(currentDirectory, NDX_AGENTS_FILE));
    }
  }

  const rendered = await Promise.all(
    sources.map(async (sourcePath) => {
      const text = (await readTextFileOptional(sourcePath) ?? "").trim();
      return text ? `# AGENTS.md instructions for ${sourcePath}\n\n<INSTRUCTIONS>\n${text}\n</INSTRUCTIONS>` : "";
    }),
  );
  return rendered.filter((section) => section.length > 0);
}

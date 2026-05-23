import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ndxFilePath, readTextFileOptional } from "../../../../common/file/index.js";
import { NDX_CONTAINER_ASSETS_ROOT } from "../../../../server/common/index.js";

/** Resolves the instruction for a model by loading .ndx/system/modelprompt/<model>.md, then default.md. */
export async function resolveModelInstruction(model: string, userHome?: string): Promise<string> {
  const home = userHome ?? os.homedir();
  let candidate = model.trim().toLowerCase();

  while (candidate.length > 0) {
    const promptPath = ndxFilePath(home, "system", "modelprompt", `${candidate.replace(/[\\/]/g, "_")}.md`);
    const instruction = await readTextFileOptional(promptPath);
    if (instruction) {
      return instruction;
    }

    const separatorIndex = candidate.lastIndexOf(":");
    if (separatorIndex < 0) {
      break;
    }
    candidate = candidate.slice(0, separatorIndex);
  }

  const userDefault = await readTextFileOptional(ndxFilePath(home, "system", "modelprompt", "default.md"));
  if (userDefault) {
    return userDefault;
  }

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bundledDefaultPromptPaths = [
    path.join(NDX_CONTAINER_ASSETS_ROOT, "system", "modelprompt", "default.md"),
    path.join(process.cwd(), "assets", "system", "modelprompt", "default.md"),
    path.join(moduleDirectory, "..", "..", "init", "assets", "system", "modelprompt", "default.md"),
    path.join(moduleDirectory, "..", "..", "..", "..", "..", "src", "agent", "server", "init", "assets", "system", "modelprompt", "default.md"),
  ];

  for (const promptPath of bundledDefaultPromptPaths) {
    const bundledDefault = await readTextFileOptional(promptPath);
    if (bundledDefault) {
      return bundledDefault;
    }
  }

  return "";
}

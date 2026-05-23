import os from "node:os";
import { NDX_SYSTEM_PROMPT_FILE, type SessionMetadata } from "../types.js";
import { ndxFilePath, readTextFileOptional } from "../../../../common/file/index.js";

export async function buildDeveloperInstructions(sessionMetadata: SessionMetadata): Promise<string> {
  const userHome = sessionMetadata.userHome ?? os.homedir();
  const text = await readTextFileOptional(ndxFilePath(userHome, NDX_SYSTEM_PROMPT_FILE)) ?? "";
  return text.trim() ? `<developer_instructions>\n${text.trim()}\n</developer_instructions>` : "";
}

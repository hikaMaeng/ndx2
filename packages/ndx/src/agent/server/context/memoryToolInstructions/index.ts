import os from "node:os";
import path from "node:path";
import { ndxBasePath, readTextFileOptional } from "../../../../common/file/index.js";

export const MEMORY_TOOL_SUMMARY_TOKEN_LIMIT = 5_000;

export type MemoryToolInstructionsOptions = {
  userHome?: string;
  tokenLimit?: number;
};

const MEMORY_TOOL_TEMPLATE = `## Memory

Memory files are stored under {{ base_path }}.

- {{ base_path }}/memory_summary.md is already included below. Do not reopen it.
- {{ base_path }}/MEMORY.md is the searchable main registry.
- {{ base_path }}/skills/<name>/ stores skill-specific memory.
- {{ base_path }}/rollout_summaries/ stores past session summaries.

Quick memory pass:

1. Scan MEMORY_SUMMARY and extract task-relevant keywords.
2. Search MEMORY.md for those keywords when more detail is needed.
3. Open at most one or two rollout_summaries entries only when directly relevant.
4. Stop the memory pass when the summary is unrelated.

When memory informs the answer, append an <oai-mem-citation> block at the end.

========= MEMORY_SUMMARY BEGINS =========
{{ memory_summary }}
========= MEMORY_SUMMARY ENDS =========`;

export async function buildMemoryToolInstructions(): Promise<string> {
  return "";
}

export async function buildMemoryToolDeveloperInstructions(
  options: MemoryToolInstructionsOptions = {}
): Promise<string | undefined> {
  const userHome = options.userHome ?? os.homedir();
  const basePath = path.posix.join(ndxBasePath(userHome), "memories");
  const memorySummary = await readTextFileOptional(path.posix.join(basePath, "memory_summary.md"));
  if (memorySummary === undefined) {
    return undefined;
  }

  const truncatedSummary = truncateTextByTokens(
    memorySummary,
    options.tokenLimit ?? MEMORY_TOOL_SUMMARY_TOKEN_LIMIT,
  );
  if (!truncatedSummary.trim()) {
    return undefined;
  }

  return MEMORY_TOOL_TEMPLATE
    .replaceAll("{{ base_path }}", basePath)
    .replace("{{ memory_summary }}", truncatedSummary);
}

export function truncateTextByTokens(text: string, tokenLimit: number): string {
  if (tokenLimit <= 0) {
    return "";
  }

  let tokenCount = 0;
  let output = "";
  for (const segment of text.match(/\s+|\S+/g) ?? []) {
    if (!/\S/.test(segment)) {
      output += segment;
      continue;
    }

    if (tokenCount >= tokenLimit) {
      break;
    }

    output += segment;
    tokenCount += 1;
  }

  return output;
}

import crypto from "node:crypto";
import type { NDXToolSystemArgHandlerInput } from "./runtimeArgTypes.js";

export function LOADED_SKILL({ turnContext }: NDXToolSystemArgHandlerInput): string {
  const names = new Set<string>();
  const paths = new Set<string>();
  const blocks: Array<{ name: string; path: string; sha256: string }> = [];
  for (const message of [turnContext.developer, turnContext.user, ...turnContext.history]) {
    for (const blockMatch of messageText(message).matchAll(/<skill>[\s\S]*?<\/skill>/g)) {
      const block = blockMatch[0];
      const name = block.match(/<name>([^<]+)<\/name>/)?.[1]?.trim();
      const skillPath = block.match(/<path>([^<]+)<\/path>/)?.[1]?.trim();
      if (name) names.add(name);
      if (skillPath) paths.add(skillPath);
      if (name && skillPath) {
        blocks.push({ name, path: skillPath, sha256: crypto.createHash("sha256").update(block).digest("hex") });
      }
    }
  }
  return JSON.stringify({ names: [...names], paths: [...paths], blocks });
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const record = message as { content?: unknown; output?: unknown };
  if (typeof record.content === "string") {
    return record.content;
  }
  if (typeof record.output === "string") {
    return record.output;
  }
  return "";
}

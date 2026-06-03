import type { NDXToolSystemArgHandlerInput } from "./runtimeArgTypes.js";

export function LOADED_SKILL({ turnContext }: NDXToolSystemArgHandlerInput): string {
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const message of [turnContext.developer, turnContext.user, ...turnContext.history]) {
    for (const match of messageText(message).matchAll(/<skill>\s*<name>([^<]+)<\/name>\s*<path>([^<]+)<\/path>/g)) {
      if (match[1]?.trim()) names.add(match[1].trim());
      if (match[2]?.trim()) paths.add(match[2].trim());
    }
  }
  return JSON.stringify({ names: [...names], paths: [...paths] });
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

import type { NDXModelMessage } from "../session/types.js";

export type NDXContextUsage = {
  tokens: number;
  messageTokens: number;
  toolDefinitionTokens: number;
  percent: number;
  contextsize: number;
  parts?: NDXContextUsagePart[];
};

export type NDXContextUsagePart = {
  key: "developer" | "user" | "history" | "toolDefinitions" | "remaining";
  label: string;
  tokens: number;
  percent: number;
};

export type NDXContextAvailability = {
  shouldCompact: boolean;
  reason: string;
  remainingTokens: number;
  requiredTokens: number;
  averageTurnTokens: number;
  outputReserveTokens: number;
  limitPercent: number;
};

export type NDXContextAvailabilityInput = {
  averageTurnTokens?: number;
  outputReserveTokens?: number;
  limitPercent?: number;
};

export function calculateContextUsage(messages: Array<NDXModelMessage | Record<string, unknown>>, contextsize: number, extraContent = "", toolDefinitions: unknown[] = []): NDXContextUsage {
  const messageTokens = messages.reduce((total, message) => total + estimateContextTokens(messageText(message)), 0) + estimateContextTokens(extraContent);
  const toolDefinitionTokens = toolDefinitions.length > 0 ? estimateContextTokens(JSON.stringify(toolDefinitions)) : 0;
  const tokens = messageTokens + toolDefinitionTokens;
  return {
    tokens,
    messageTokens,
    toolDefinitionTokens,
    percent: contextsize > 0 ? Math.min(100, Math.round((tokens / contextsize) * 10000) / 100) : 0,
    contextsize
  };
}

export function calculateDetailedContextUsage(messages: Array<NDXModelMessage | Record<string, unknown>>, contextsize: number, extraContent = "", toolDefinitions: unknown[] = []): NDXContextUsage {
  let developerTokens = 0;
  let userTokens = 0;
  let historyTokens = estimateContextTokens(extraContent);
  let firstUserContextSeen = false;

  for (const message of messages) {
    const content = messageText(message);
    const tokens = estimateContextTokens(content);
    const role = typeof (message as { role?: unknown }).role === "string" ? String((message as { role: string }).role) : "";
    if (role === "system") {
      developerTokens += tokens;
    } else if (role === "user" && !firstUserContextSeen) {
      firstUserContextSeen = true;
      userTokens += tokens;
    } else {
      historyTokens += tokens;
    }
  }

  const toolDefinitionTokens = toolDefinitions.length > 0 ? estimateContextTokens(JSON.stringify(toolDefinitions)) : 0;
  const messageTokens = developerTokens + userTokens + historyTokens;
  const tokens = messageTokens + toolDefinitionTokens;
  const percent = (partTokens: number) => contextsize > 0 ? Math.min(100, Math.round((partTokens / contextsize) * 10000) / 100) : 0;
  const remainingTokens = Math.max(0, contextsize - tokens);
  return {
    tokens,
    messageTokens,
    toolDefinitionTokens,
    percent: percent(tokens),
    contextsize,
    parts: [
      { key: "developer", label: "Developer message", tokens: developerTokens, percent: percent(developerTokens) },
      { key: "user", label: "User message", tokens: userTokens, percent: percent(userTokens) },
      { key: "history", label: "Session history", tokens: historyTokens, percent: percent(historyTokens) },
      { key: "toolDefinitions", label: "Tool definitions", tokens: toolDefinitionTokens, percent: percent(toolDefinitionTokens) },
      { key: "remaining", label: "Remaining", tokens: remainingTokens, percent: percent(remainingTokens) }
    ]
  };
}

export function judgeContextAvailability(usage: Pick<NDXContextUsage, "tokens" | "contextsize" | "percent">, input: NDXContextAvailabilityInput = {}): NDXContextAvailability {
  const remainingTokens = Math.max(0, usage.contextsize - usage.tokens);
  const averageTurnTokens = Math.max(0, Math.ceil(input.averageTurnTokens ?? Math.max(4096, usage.contextsize * 0.12)));
  const outputReserveTokens = Math.max(1024, Math.ceil(input.outputReserveTokens ?? Math.min(8192, Math.max(2048, usage.contextsize * 0.08))));
  const requiredTokens = outputReserveTokens + Math.ceil(averageTurnTokens * 1.15);
  const limitPercent = Math.min(99, Math.max(1, input.limitPercent ?? 88));
  const shouldCompact = remainingTokens < requiredTokens || usage.percent >= limitPercent;
  const reason = shouldCompact
    ? remainingTokens < requiredTokens
      ? `remaining context ${remainingTokens} tokens is below required ${requiredTokens} tokens`
      : `context usage ${usage.percent}% reached compaction threshold ${limitPercent}%`
    : `remaining context ${remainingTokens} tokens is enough for required ${requiredTokens} tokens`;
  return {
    shouldCompact,
    reason,
    remainingTokens,
    requiredTokens,
    averageTurnTokens,
    outputReserveTokens,
    limitPercent
  };
}

function messageText(message: NDXModelMessage | Record<string, unknown>): string {
  if (typeof (message as { content?: unknown }).content === "string") {
    return String((message as { content: string }).content);
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export function estimateContextTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

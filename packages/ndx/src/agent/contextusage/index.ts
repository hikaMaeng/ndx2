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

export function calculateContextUsage(
  messages: Array<NDXModelMessage | Record<string, unknown>>,
  contextsize: number,
  extraContent = "",
  toolDefinitions: unknown[] = [],
  prefixPreview?: readonly string[]
): NDXContextUsage {
  const messageTokens = messageTokenParts(messages, prefixPreview).reduce((total, part) => total + part.tokens, 0) + estimateContextTokens(extraContent);
  const toolDefinitionTokens = toolDefinitions.length > 0 ? estimateContextTokens(modelToolDefinitionsText(toolDefinitions)) : 0;
  const tokens = messageTokens + toolDefinitionTokens;
  return {
    tokens,
    messageTokens,
    toolDefinitionTokens,
    percent: contextsize > 0 ? Math.min(100, Math.round((tokens / contextsize) * 10000) / 100) : 0,
    contextsize
  };
}

export function calculateDetailedContextUsage(
  messages: Array<NDXModelMessage | Record<string, unknown>>,
  contextsize: number,
  extraContent = "",
  toolDefinitions: unknown[] = [],
  prefixPreview?: readonly string[]
): NDXContextUsage {
  let developerTokens = 0;
  let userTokens = 0;
  let historyTokens = estimateContextTokens(extraContent);
  let firstUserContextSeen = false;

  for (const { message, tokens } of messageTokenParts(messages, prefixPreview)) {
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

  const toolDefinitionTokens = toolDefinitions.length > 0 ? estimateContextTokens(modelToolDefinitionsText(toolDefinitions)) : 0;
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
  const defaultAverageTurnTokens = Math.max(4096, usage.contextsize * 0.12);
  const averageTurnTokens = Math.max(0, Math.ceil(Math.min(input.averageTurnTokens ?? defaultAverageTurnTokens, defaultAverageTurnTokens)));
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

function messageTokenParts(messages: Array<NDXModelMessage | Record<string, unknown>>, prefixPreview?: readonly string[]): Array<{ message: NDXModelMessage | Record<string, unknown>; tokens: number }> {
  const prefixLength = prefixPreviewMatches(messages, prefixPreview) ? prefixPreview!.length : 0;
  return messages.map((message, index) => ({
    message,
    tokens: estimateContextTokens(index < prefixLength ? prefixPreview![index] : modelRequestMessageText(message))
  }));
}

function prefixPreviewMatches(messages: Array<NDXModelMessage | Record<string, unknown>>, prefixPreview?: readonly string[]): boolean {
  if (!prefixPreview || prefixPreview.length === 0 || messages.length < prefixPreview.length) {
    return false;
  }
  for (let index = 0; index < prefixPreview.length; index += 1) {
    if (modelRequestMessageText(messages[index]) !== prefixPreview[index]) {
      return false;
    }
  }
  return true;
}

export function modelRequestMessageText(message: NDXModelMessage | Record<string, unknown>): string {
  if (typeof (message as { content?: unknown }).content === "string") {
    const role = typeof (message as { role?: unknown }).role === "string" ? String((message as { role: string }).role) : "message";
    return `${role}:\n${String((message as { content: string }).content)}`;
  }
  if (message && typeof message === "object") {
    const type = typeof (message as { type?: unknown }).type === "string" ? String((message as { type: string }).type) : "input_item";
    if (type === "function_call") {
      const name = typeof (message as { name?: unknown }).name === "string" && String((message as { name: string }).name).trim()
        ? String((message as { name: string }).name).trim()
        : "unknown";
      const callId = responseToolCallId(message) ?? "tool_call";
      return [`assistant function_call ${name} (${callId}):`, JSON.stringify(parseFunctionCallArguments((message as { arguments?: unknown }).arguments))].join("\n");
    }
    if (type === "function_call_output") {
      const callId = typeof (message as { call_id?: unknown }).call_id === "string" && String((message as { call_id: string }).call_id).trim()
        ? String((message as { call_id: string }).call_id).trim()
        : "tool_call";
      const output = typeof (message as { output?: unknown }).output === "string" ? String((message as { output: string }).output) : JSON.stringify((message as { output?: unknown }).output ?? "");
      return `tool result (${callId}):\n${output}`;
    }
    if (type === "reasoning") {
      return `assistant reasoning:\n${safeJson(message)}`;
    }
    if (Array.isArray((message as { content?: unknown }).content)) {
      const role = typeof (message as { role?: unknown }).role === "string" ? String((message as { role: string }).role) : "message";
      return `${role}:\n${safeJson((message as { content: unknown[] }).content)}`;
    }
    return `${type}:\n${safeJson(message)}`;
  }
  return String(message);
}

function modelToolDefinitionsText(toolDefinitions: unknown[]): string {
  return `tools:\n${safeJson(toolDefinitions)}`;
}

function responseToolCallId(message: Record<string, unknown>): string | undefined {
  for (const key of ["call_id", "id"]) {
    const value = message[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function parseFunctionCallArguments(rawArguments: unknown): Record<string, unknown> {
  const parsed = typeof rawArguments === "string"
    ? (() => {
        try {
          return JSON.parse(rawArguments) as unknown;
        } catch {
          return rawArguments;
        }
      })()
    : rawArguments ?? {};
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return { arguments: parsed };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return String(value);
  }
}

export function estimateContextTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

import type { NDXAgentWebContextUsage, NDXAgentWebModel, NDXAgentWebProvider, NDXAgentWebSessionData } from "ndx/agent/web";

export type SocketState = "idle" | "checking" | "ready" | "connecting" | "negotiating" | "connected" | "offline" | "error";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export type ProviderBundle = {
  provider: NDXAgentWebProvider;
  models: NDXAgentWebModel[];
};

export type { NDXAgentWebContextUsage };

export type SelectedModelConfig = {
  provider: string;
  model: string;
  contextsize: number;
  url: string;
  token: string;
  modalities: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export const DEFAULT_MODEL: SelectedModelConfig = {
  provider: "",
  model: "",
  contextsize: 100_000,
  url: "",
  token: "",
  modalities: ["text"] as Array<"text" | "image" | "file">
};

export function toModelConfig(model: SelectedModelConfig) {
  return {
    type: "openai" as const,
    model: model.model,
    url: model.url ?? "",
    token: model.token ?? "",
    contextsize: typeof model.contextsize === "number" ? model.contextsize : 100_000,
    modalities: model.modalities ?? ["text"],
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...(typeof model.topP === "number" ? { topP: model.topP } : {}),
    ...(typeof model.topK === "number" ? { topK: model.topK } : {}),
    ...(typeof model.minP === "number" ? { minP: model.minP } : {})
  };
}

export function sessionDataToChatMessage(data: NDXAgentWebSessionData): ChatMessage {
  const text = sessionDataContentsText(data.contents) ?? JSON.stringify(data.contents);
  return {
    id: data.dataid,
    role: data.type === "user" ? "user" : data.type === "assistant" ? "assistant" : "system",
    text
  };
}

export function sessionDataToVisibleChatMessage(data: NDXAgentWebSessionData): ChatMessage | undefined {
  if (data.type === "user") {
    return sessionDataToChatMessage(data);
  }
  if (data.type !== "assistant") {
    return undefined;
  }
  if (!data.contents || typeof data.contents !== "object") {
    return sessionDataToChatMessage(data);
  }
  const kind = (data.contents as { kind?: unknown }).kind;
  return kind === "assistant_message" || kind === "error" ? sessionDataToChatMessage(data) : undefined;
}

export function sessionDataContentsText(contents: unknown): string | undefined {
  if (typeof contents === "string") {
    return contents;
  }
  if (!contents || typeof contents !== "object") {
    return undefined;
  }

  const payload = contents as {
    kind?: unknown;
    text?: unknown;
    message?: unknown;
    content?: unknown;
    summary?: unknown;
    toolCalls?: unknown;
    output?: unknown;
    success?: unknown;
    iteration?: unknown;
    tool?: unknown;
    callId?: unknown;
    event?: unknown;
    result?: unknown;
    results?: unknown;
    messageCount?: unknown;
    phase?: unknown;
    attachments?: unknown;
  };
  if ((payload.kind === "user_message" || payload.kind === "assistant_message") && typeof payload.text === "string") {
    const attachments = Array.isArray(payload.attachments)
      ? payload.attachments
          .map((attachment) => {
            if (!attachment || typeof attachment !== "object") return "";
            const next = attachment as { name?: unknown; mimeType?: unknown; path?: unknown };
            const name = typeof next.name === "string" ? next.name : "attachment";
            const mimeType = typeof next.mimeType === "string" ? next.mimeType : "file";
            const filePath = typeof next.path === "string" ? next.path : "";
            return filePath ? `[${mimeType}] ${name}` : "";
          })
          .filter(Boolean)
      : [];
    return attachments.length > 0 ? [payload.text, ...attachments].filter(Boolean).join("\n") : payload.text;
  }
  if (payload.kind === "assistant_delta" && typeof payload.content === "string") {
    return payload.content;
  }
  if (payload.kind === "assistant_reasoning" && typeof payload.summary === "string") {
    return `reasoning: ${payload.summary}`;
  }
  if (payload.kind === "tool_call" && Array.isArray(payload.toolCalls)) {
    const calls = payload.toolCalls
      .map((item) => {
        if (!item || typeof item !== "object") {
          return String(item);
        }
        const next = item as { name?: unknown; arguments?: unknown };
        const name = typeof next.name === "string" && next.name.length > 0 ? next.name : "unknown tool";
        const args =
          typeof next.arguments === "string" && next.arguments.length > 0
            ? next.arguments
            : JSON.stringify(next.arguments ?? {});
        return `${name}(${args})`;
      })
      .filter((item) => item.length > 0);
    return calls.length > 0 ? `tool call: ${calls.join(", ")}` : undefined;
  }
  if (payload.kind === "tool_result") {
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length === 0) {
      const output = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output ?? {});
      return `tool result${payload.success === false ? " (failed)" : ""}: ${output}`;
    }
    return results
      .map((result) => {
        if (!result || typeof result !== "object") {
          return `tool result: ${String(result)}`;
        }
        const item = result as { tool?: unknown; toolCallId?: unknown; success?: unknown; output?: unknown };
        const tool = typeof item.tool === "string" ? item.tool : "unknown tool";
        const callId = typeof item.toolCallId === "string" ? `(${item.toolCallId})` : "";
        const output = typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? {});
        return `tool result: ${tool}${callId} ${item.success === false ? "failed" : "succeeded"}\n${output}`;
      })
      .join("\n\n");
  }
  if (payload.kind === "model_request") {
    return `model request started${typeof payload.iteration === "number" ? ` (iteration ${payload.iteration})` : ""}`;
  }
  if (payload.kind === "model_request_resuming") {
    return `model request resumed${typeof payload.iteration === "number" ? ` (iteration ${payload.iteration})` : ""}`;
  }
  if (payload.kind === "tool_batch" && Array.isArray(payload.toolCalls)) {
    return `tool batch started: ${payload.toolCalls.length} call(s)`;
  }
  if (payload.kind === "tool_started") {
    return `tool started: ${typeof payload.tool === "string" ? payload.tool : "unknown tool"}`;
  }
  if (payload.kind === "tool_progress") {
    const event = payload.event && typeof payload.event === "object" ? payload.event as { message?: unknown; type?: unknown } : {};
    return `tool progress: ${typeof payload.tool === "string" ? `${payload.tool}: ` : ""}${typeof event.message === "string" ? event.message : event.type ?? "progress"}`;
  }
  if (payload.kind === "tool_finished") {
    const result = payload.result && typeof payload.result === "object" ? payload.result as { tool?: unknown; status?: unknown; success?: unknown } : {};
    return `tool finished: ${typeof result.tool === "string" ? result.tool : "unknown tool"} (${typeof result.status === "string" ? result.status : result.success === false ? "failed" : "success"})`;
  }
  if (payload.kind === "turn_interrupted") {
    return `turn interrupted${typeof payload.phase === "string" ? ` during ${payload.phase}` : ""}`;
  }
  if (payload.kind === "error" && typeof payload.message === "string") {
    return payload.message;
  }
  return undefined;
}

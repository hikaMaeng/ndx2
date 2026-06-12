import type { NDXSessionAttachmentReference } from "ndx/common/protocol";
import { NDX_AGENT_WEB_API, type NDXAgentWebContextUsage, type NDXAgentWebSessionData } from "ndx/webclient/common";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  attachments: ChatMessageAttachment[];
};

export type ChatMessageAttachment = NDXSessionAttachmentReference & {
  index: number;
  url?: string;
};

export type { NDXAgentWebContextUsage };

const PENDING_USER_CHAT_MESSAGE_ID_PREFIX = "pending-user:";

export function pendingUserChatMessage(text: string): ChatMessage {
  return {
    id: `${PENDING_USER_CHAT_MESSAGE_ID_PREFIX}${Date.now()}`,
    role: "user",
    text,
    attachments: []
  };
}

export function isPendingUserChatMessage(message: Pick<ChatMessage, "id">): boolean {
  return message.id.startsWith(PENDING_USER_CHAT_MESSAGE_ID_PREFIX);
}

export function withoutPendingUserChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => !isPendingUserChatMessage(message));
}

export function sessionDataToChatMessage(data: NDXAgentWebSessionData): ChatMessage {
  const text = sessionDataContentsText(data.contents) ?? JSON.stringify(data.contents);
  return {
    id: data.dataid,
    role: data.type === "user" ? "user" : data.type === "assistant" ? "assistant" : "system",
    text,
    attachments: sessionDataContentsAttachments(data)
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
    compactDataId?: unknown;
    sourceRowCount?: unknown;
    summaryTokens?: unknown;
    tokens?: unknown;
    contextsize?: unknown;
    percent?: unknown;
    remainingTokens?: unknown;
    requiredTokens?: unknown;
    averageTurnTokens?: unknown;
    outputReserveTokens?: unknown;
    reason?: unknown;
  };
  if ((payload.kind === "user_message" || payload.kind === "tool_generated_user_message") && typeof payload.text === "string") {
    return visibleUserRequestText(payload.text);
  }
  if (payload.kind === "assistant_message" && typeof payload.text === "string") {
    return payload.text;
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
  if (payload.kind === "model_progress") {
    return typeof payload.message === "string" ? payload.message : "model request still running";
  }
  if (payload.kind === "compact") {
    return typeof payload.text === "string" ? `compact summary:\n${payload.text}` : "compact summary recorded";
  }
  if (payload.kind === "compact_started") {
    const percent = typeof payload.percent === "number" ? `${payload.percent}%` : "unknown";
    const remaining = typeof payload.remainingTokens === "number" ? `${payload.remainingTokens}` : "unknown";
    const required = typeof payload.requiredTokens === "number" ? `${payload.requiredTokens}` : "unknown";
    const reason = typeof payload.reason === "string" ? payload.reason : "context limit reached";
    return `compact started: ${reason}\ncontext ${percent}, remaining ${remaining} tokens, required ${required} tokens`;
  }
  if (payload.kind === "compact_completed") {
    const rows = typeof payload.sourceRowCount === "number" ? `${payload.sourceRowCount}` : "unknown";
    const summary = typeof payload.summaryTokens === "number" ? `${payload.summaryTokens}` : "unknown";
    return `compact completed: ${rows} source rows summarized into ${summary} tokens`;
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

export function visibleUserRequestText(text: string): string {
  const requestMatch = text.match(/^<request\s+thinking="(?:none|nothink|normal|low|medium|high|minimal|allowed)">\s*<thinking_instruction>[\s\S]*?<\/thinking_instruction>\s*<user_request>\s*([\s\S]*?)\s*<\/user_request>\s*<\/request>\s*$/);
  const legacyMatch = text.match(/^<ndx_request\s+reasoning="(?:none|nothink|normal|low|medium|high|minimal|allowed)">\s*<user_request>\s*([\s\S]*?)\s*<\/user_request>\s*<execution_policy>[\s\S]*<\/execution_policy>\s*<\/ndx_request>\s*$/);
  return requestMatch?.[1] ?? legacyMatch?.[1] ?? text;
}

export function sessionDataContentsAttachments(data: NDXAgentWebSessionData): ChatMessageAttachment[] {
  const contents = data.contents;
  if (!contents || typeof contents !== "object") {
    return [];
  }
  const payload = contents as { kind?: unknown; attachments?: unknown };
  if (payload.kind !== "user_message" && payload.kind !== "tool_generated_user_message") {
    return [];
  }
  if (!Array.isArray(payload.attachments)) {
    return [];
  }
  return payload.attachments.flatMap((attachment, index) => {
    if (!attachment || typeof attachment !== "object") {
      return [];
    }
    const record = attachment as { kind?: unknown; path?: unknown; name?: unknown; mimeType?: unknown; size?: unknown };
    if ((record.kind !== "image" && record.kind !== "file") || typeof record.path !== "string" || typeof record.name !== "string" || typeof record.mimeType !== "string" || typeof record.size !== "number") {
      return [];
    }
    return [{
      kind: record.kind,
      path: record.path,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      index,
      ...(record.kind === "image" ? { url: NDX_AGENT_WEB_API.sessionAttachment(data.sessionid, data.dataid, index) } : {})
    }];
  });
}

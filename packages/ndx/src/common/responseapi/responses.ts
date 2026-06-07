export type ResponseOutputEvent = {
  signal?: AbortSignal;
  onRequestPrepared?: (request: ResponsePreparedRequest) => Promise<void>;
  onText?: (delta: string, content: string, interrupt: ResponseStreamInterrupt) => Promise<void>;
  onReasoning?: (summary: string, content: string, interrupt: ResponseStreamInterrupt) => Promise<void>;
  onToolCall?: (toolCall: unknown, interrupt: ResponseStreamInterrupt) => Promise<void>;
  onDebug?: (event: string, context: Record<string, unknown>) => Promise<void>;
};

export type ResponsePreparedRequest = {
  endpoint: string;
  model: string;
  inputMode: "text" | "array";
  inputType: "string" | "array" | string;
  inputItemCount?: number;
  inputTextLength?: number;
  inputSerializedLength: number;
  inputSha256: string;
  inputPreview: string;
  toolCount: number;
  stream: true;
  attempt: number;
  inputBodyIndex: number;
  maxAttempts: number;
  requestTimeoutMs: number;
};

export type ResponseStreamInterrupt = (reason?: string | Error) => Promise<never>;

export type ModelResponse = {
  content: string;
  reasoning?: string;
  toolCalls: unknown[];
  outputItems: unknown[];
};

export type ResponsePayloadResult = {
  text: string;
  content: string;
  toolCalls: unknown[];
  outputItems: unknown[];
  reasoning: string[];
};

export type ResponseModelMessage = {
  role: string;
  content: string | Array<Record<string, unknown>>;
};

export type ResponseInputItem = ResponseModelMessage | Record<string, unknown>;

export type ResponseToolOutput = {
  toolCall: unknown;
  output: string;
};

export type ResponseModelConfig = {
  model: string;
  url: string;
  token: string;
  requestTimeoutMs?: number;
  reasoningEffort?: "none" | "nothink" | "normal" | "high" | "low" | "medium";
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export function normalizeResponseSummary(summary: unknown): string {
  if (typeof summary === "string") {
    return summary;
  }
  if (Array.isArray(summary)) {
    return summary
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (!entry || typeof entry !== "object") {
          return "";
        }
        const nested = entry as { text?: unknown };
        return typeof nested.text === "string" ? nested.text : "";
      })
      .filter((entry) => entry.length > 0)
      .join("\n");
  }
  if (summary && typeof summary === "object") {
    return typeof (summary as { text?: unknown }).text === "string" ? String((summary as { text: string }).text) : "";
  }
  return "";
}

export async function readResponsesStream(stream: ReadableStream<Uint8Array>, onEvent?: ResponseOutputEvent): Promise<ModelResponse> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningContent = "";
  const toolCalls: unknown[] = [];
  const outputItems: unknown[] = [];
  const interrupt: ResponseStreamInterrupt = async (reason) => {
    await reader.cancel(reason).catch(() => undefined);
    throw abortError(reason);
  };

  while (true) {
    if (onEvent?.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw abortError(onEvent.signal.reason instanceof Error ? onEvent.signal.reason : undefined);
    }
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\n\n/);
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      for (const line of frame.split(/\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payload = trimmed.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(payload) as unknown;
        } catch (error) {
          await onEvent?.onDebug?.("responseapi.stream.parse_failed", {
            error: error instanceof Error ? error.message : String(error),
            payloadPreview: payload.slice(0, 500)
          });
          throw error;
        }

        const completedEvent = isCompletedEvent(parsed);
        await onEvent?.onDebug?.("responseapi.stream.event", responsePayloadDebugContext(parsed));

        let parsedText: ResponsePayloadResult;
        try {
          parsedText = parseResponsesPayload(parsed);
        } catch (error) {
          await onEvent?.onDebug?.("responseapi.stream.payload_parse_failed", {
            error: error instanceof Error ? error.message : String(error),
            ...responsePayloadDebugContext(parsed)
          });
          throw error;
        }
        const streamFailure = responseFailureError(parsed);
        if (streamFailure && !isRecoverableToolCallParseFailure(streamFailure, parsedText)) {
          throw streamFailure;
        }
        if (streamFailure) {
          await onEvent?.onDebug?.("responseapi.stream.tool_call_parse_failure_recovered", {
            error: streamFailure.message,
            toolCallCount: parsedText.toolCalls.length,
            textLength: parsedText.text.length
          });
        }

        for (const summary of parsedText.reasoning) {
          const nextReasoningContent = isReasoningDeltaEvent(parsed)
            ? reasoningContent + summary
            : summary.length >= reasoningContent.length
              ? summary
              : reasoningContent + summary;
          if (nextReasoningContent !== reasoningContent) {
            reasoningContent = nextReasoningContent;
            await onEvent?.onReasoning?.(reasoningContent, content, interrupt);
          }
        }

        for (const toolCall of parsedText.toolCalls) {
          if (!toolCalls.some((current) => responseToolCallId(current) && responseToolCallId(current) === responseToolCallId(toolCall))) {
            await onEvent?.onToolCall?.(toolCall, interrupt);
          }
        }

        for (const item of parsedText.outputItems) {
          if (isResponseCarryForwardItem(item)) {
            outputItems.push(item);
          }
        }

        if (parsedText.toolCalls.length > 0) {
          for (const toolCall of parsedText.toolCalls) {
            const callId = responseToolCallId(toolCall);
            if (!callId || !toolCalls.some((current) => responseToolCallId(current) === callId)) {
              toolCalls.push(toolCall);
            }
          }
        }

        if (!completedEvent && parsedText.text.length > 0) {
          await onEvent?.onText?.(parsedText.text, content + parsedText.text, interrupt);
          content += parsedText.text;
        }
      }
    }

    if (done) {
      break;
    }
  }

  if (toolCalls.length === 0 && content.includes("<tool_")) {
    const textToolCalls = extractTextToolCalls(content);
    for (const toolCall of textToolCalls) {
      await onEvent?.onToolCall?.(toolCall, interrupt);
    }
    toolCalls.push(...textToolCalls);
    outputItems.push(...textToolCalls);
  }
  if (toolCalls.length > 0) {
    content = stripTextToolCalls(content);
  }

  await onEvent?.onDebug?.("responseapi.stream.complete", {
    contentLength: content.length,
    reasoningLength: reasoningContent.length,
    toolCallCount: toolCalls.length
  });
  return { content, reasoning: reasoningContent, toolCalls, outputItems };
}

function abortError(reason?: string | Error): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error(reason || "model request aborted.");
  error.name = "AbortError";
  return error;
}

export function parseResponsesPayload(payload: unknown): ResponsePayloadResult {
  const outputItems = extractResponsesOutput(payload);
  let text = "";
  const toolCalls: unknown[] = [];
  const reasoning: string[] = [];

  for (const item of outputItems) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const output = item as { type?: unknown; content?: unknown; summary?: unknown };
    if (typeof output.type !== "string") {
      continue;
    }

    if (output.type === "function_call") {
      toolCalls.push(output);
      continue;
    }

    if (output.type === "reasoning") {
      const summary = normalizeResponseSummary(output.summary) || extractReasoningContentText(output.content);
      if (summary) {
        reasoning.push(summary);
      }
      continue;
    }

    if (output.type === "response.reasoning_text.delta" || output.type === "reasoning_text.delta") {
      const delta = extractResponseText(output);
      if (delta) {
        reasoning.push(delta);
      }
      continue;
    }

    if (output.type === "message") {
      const messageText = extractOutputMessageText(output.content);
      if (messageText) {
        toolCalls.push(...extractTextToolCalls(messageText));
        text += stripTextToolCalls(messageText);
      }
      continue;
    }

    if (
      output.type === "response.output_text" ||
      output.type === "response.output_text.delta" ||
      output.type === "output_text" ||
      output.type === "message_delta"
    ) {
      const delta = extractResponseText(output);
      if (delta) {
        toolCalls.push(...extractTextToolCalls(delta));
        text += stripTextToolCalls(delta, { trim: false });
      }
    }
  }

  return {
    content: text,
    text,
    toolCalls,
    outputItems,
    reasoning
  };
}

export function buildResponsesToolContinuationInput(
  input: ResponseInputItem[],
  response: Pick<ModelResponse, "outputItems" | "toolCalls">,
  outputs: ResponseToolOutput[]
): ResponseInputItem[] {
  return [
    ...input,
    ...responsesCarryForwardItems(response.outputItems, response.toolCalls),
    ...outputs.map((output) => ({
      type: "function_call_output",
      call_id: responseToolCallId(output.toolCall) ?? "tool_call",
      output: output.output
    }))
  ];
}

export function responseToolCallId(toolCall: unknown): string | undefined {
  if (!toolCall || typeof toolCall !== "object") {
    return undefined;
  }
  const record = toolCall as { call_id?: unknown; id?: unknown };
  if (typeof record.call_id === "string" && record.call_id.trim().length > 0) {
    return record.call_id;
  }
  if (typeof record.id === "string" && record.id.trim().length > 0) {
    return record.id;
  }
  return undefined;
}

function responsesCarryForwardItems(outputItems: unknown[], toolCalls: unknown[]): ResponseInputItem[] {
  const textToolCalls = toolCalls.filter((item) => Boolean(item && typeof item === "object" && (item as { source?: unknown }).source === "text_tool_code"));
  const items = textToolCalls.length > 0 ? textToolCalls : outputItems.length > 0 ? outputItems : toolCalls;
  return items.filter((item): item is ResponseInputItem => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function isResponseCarryForwardItem(item: unknown): boolean {
  if (!item || typeof item !== "object") {
    return false;
  }
  const type = (item as { type?: unknown }).type;
  return type === "function_call" || type === "reasoning";
}

function extractResponsesOutput(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as { output?: unknown; items?: unknown; item?: unknown; response?: unknown; delta?: unknown };
  if (Array.isArray(root.output)) {
    return root.output;
  }
  if (Array.isArray(root.items)) {
    return root.items;
  }
  const responseOutput = root.response && typeof root.response === "object" ? (root.response as { output?: unknown[] }).output : undefined;
  if (Array.isArray(responseOutput)) {
    return responseOutput;
  }
  if (typeof (root as { type?: unknown }).type === "string") {
    return [root];
  }
  if (root.item !== undefined) {
    return [root.item];
  }
  const delta = (root as { delta?: unknown }).delta;
  if (Array.isArray(delta)) {
    return delta;
  }
  return [];
}

function isCompletedEvent(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && (payload as { type?: unknown }).type === "response.completed");
}

function isReasoningDeltaEvent(payload: unknown): boolean {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    ((payload as { type?: unknown }).type === "response.reasoning_text.delta" || (payload as { type?: unknown }).type === "reasoning_text.delta")
  );
}

function responseFailureError(payload: unknown): Error | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as { type?: unknown; error?: unknown; response?: unknown };
  const response = record.response && typeof record.response === "object" ? record.response as { status?: unknown; error?: unknown } : undefined;
  if (record.type !== "error" && record.type !== "response.failed" && response?.status !== "failed") {
    return undefined;
  }
  const errorPayload = record.error ?? response?.error;
  const message = responseErrorMessage(errorPayload);
  return new Error(message ? `model response failed: ${message}` : "model response failed.");
}

function responseErrorMessage(errorPayload: unknown): string {
  if (typeof errorPayload === "string") {
    return errorPayload;
  }
  if (!errorPayload || typeof errorPayload !== "object") {
    return "";
  }
  const record = errorPayload as { message?: unknown; code?: unknown; type?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  const code = typeof record.code === "string" ? record.code : "";
  const type = typeof record.type === "string" ? record.type : "";
  return [message, code || type ? `(${[type, code].filter(Boolean).join("/")})` : ""].filter(Boolean).join(" ");
}

function isRecoverableToolCallParseFailure(error: Error, parsedText: ResponsePayloadResult): boolean {
  return /parse tool call/i.test(error.message) && parsedText.toolCalls.length > 0;
}

function responsePayloadDebugContext(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { payloadType: typeof payload };
  }
  const record = payload as Record<string, unknown>;
  const response = record.response && typeof record.response === "object" ? record.response as Record<string, unknown> : undefined;
  const output = Array.isArray(record.output) ? record.output : Array.isArray(response?.output) ? response.output : undefined;
  const outputRecords = output?.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) ?? [];
  const text =
    typeof record.delta === "string"
      ? record.delta
      : typeof record.text === "string"
        ? record.text
        : "";
  return {
    type: typeof record.type === "string" ? record.type : undefined,
    keys: Object.keys(record).slice(0, 12),
    responseKeys: response ? Object.keys(response).slice(0, 12) : undefined,
    outputCount: output?.length,
    outputTypes: outputRecords.map((item) => typeof item.type === "string" ? item.type : typeof item.object === "string" ? item.object : "unknown").slice(0, 8),
    functionCallNames: outputRecords
      .filter((item) => item.type === "function_call")
      .map((item) => typeof item.name === "string" ? item.name : "unknown")
      .slice(0, 8),
    textLength: text.length
  };
}

function extractOutputMessageText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const outputText = content.map((entry) => extractResponseText(entry)).filter((item) => item.length > 0);
  return outputText.join("");
}

function extractReasoningContentText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const record = entry as { text?: unknown; content?: unknown };
      if (typeof record.text === "string") {
        return record.text;
      }
      if (typeof record.content === "string") {
        return record.content;
      }
      return "";
    })
    .filter((entry) => entry.length > 0)
    .join("");
}

function extractResponseText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (!input || typeof input !== "object") {
    return "";
  }

  const record = input as { type?: unknown; text?: unknown; delta?: unknown };
  if (record.type === "output_text" && typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.delta === "string") {
    return record.delta;
  }
  if (record.delta && typeof record.delta === "object" && typeof (record.delta as { text?: unknown }).text === "string") {
    return String((record.delta as { text: string }).text);
  }

  return "";
}

function extractTextToolCalls(text: string): unknown[] {
  const calls: unknown[] = [];
  const tagPattern = /<tool_(?:code|call)>\s*([\s\S]*?)\s*<\/tool_(?:code|call)>/giu;
  for (const match of text.matchAll(tagPattern)) {
    const body = match[1]?.trim();
    if (!body) {
      continue;
    }
    const jsonCalls = parseJsonToolCalls(body);
    if (jsonCalls.length > 0) {
      calls.push(...jsonCalls);
      continue;
    }
    const codeCall = parseCodeToolCall(body);
    if (codeCall) {
      calls.push(codeCall);
      continue;
    }
    const taggedCall = parseTaggedToolCall(body, calls.length);
    if (taggedCall) {
      calls.push(taggedCall);
    }
  }
  return calls;
}

function stripTextToolCalls(text: string, options: { trim?: boolean } = {}): string {
  const stripped = text.replace(/<tool_(?:code|call)>[\s\S]*?<\/tool_(?:code|call)>/giu, "");
  return options.trim === false ? stripped : stripped.trim();
}

function parseJsonToolCalls(body: string): unknown[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items
      .map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return undefined;
        }
        const record = item as { name?: unknown; tool?: unknown; arguments?: unknown; input?: unknown };
        const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : typeof record.tool === "string" && record.tool.trim() ? record.tool.trim() : "";
        if (!name) {
          return undefined;
        }
        return {
          type: "function_call",
          source: "text_tool_code",
          call_id: `text_tool_call_${index + 1}`,
          name,
          arguments: JSON.stringify(record.arguments ?? record.input ?? {})
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  } catch {
    return [];
  }
}

function parseCodeToolCall(body: string): unknown | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/u.exec(body.trim());
  if (!match) {
    return undefined;
  }
  return {
    type: "function_call",
    source: "text_tool_code",
    call_id: "text_tool_call_1",
    name: match[1],
    arguments: JSON.stringify(parseCodeToolArguments(match[2] ?? ""))
  };
}

function parseTaggedToolCall(body: string, index: number): unknown | undefined {
  const header = /^\s*(?:assistant\s+)?tool_call\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]+)\))?\s*:?\s*/u.exec(body);
  if (!header) {
    return undefined;
  }
  const args: Record<string, unknown> = {};
  const parameterPattern = /<parameter=([A-Za-z_][A-Za-z0-9_]*)>\s*([\s\S]*?)\s*<\/parameter>/giu;
  for (const match of body.matchAll(parameterPattern)) {
    const name = match[1]?.trim();
    if (name) {
      args[name] = match[2] ?? "";
    }
  }
  if (Object.keys(args).length === 0) {
    const tail = body.slice(header[0].length).trim();
    if (!tail || /^<\/(?:function|tool_(?:code|call))>\s*$/iu.test(tail)) {
      return {
        type: "function_call",
        source: "text_tool_code",
        call_id: header[2]?.trim() || `text_tool_call_${index + 1}`,
        name: header[1],
        arguments: JSON.stringify({})
      };
    }
    if (!tail.startsWith("{")) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(tail) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return undefined;
      }
      Object.assign(args, parsed);
    } catch {
      return undefined;
    }
  }
  return {
    type: "function_call",
    source: "text_tool_code",
    call_id: header[2]?.trim() || `text_tool_call_${index + 1}`,
    name: header[1],
    arguments: JSON.stringify(args)
  };
}

function parseCodeToolArguments(input: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const part of splitCodeArguments(input)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/u.exec(part.trim());
    if (!match) {
      continue;
    }
    args[match[1]!] = parseCodeArgumentValue(match[2]!.trim());
  }
  return args;
}

function splitCodeArguments(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      current += char;
      quote = char;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts;
}

function parseCodeArgumentValue(value: string): unknown {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    const jsonString = value.startsWith("\"")
      ? value
      : `"${value.slice(1, -1).replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"")}"`;
    try {
      return JSON.parse(jsonString) as unknown;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  return value;
}

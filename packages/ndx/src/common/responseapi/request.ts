import { parseResponsesPayload, readResponsesStream, responseToolCallId, type ModelResponse, type ResponseInputItem, type ResponseOutputEvent, type ResponseModelConfig, type ResponseModelMessage, type ResponseStreamInterrupt } from "./responses.js";
import { promises as fs } from "node:fs";

const MAX_TRANSIENT_ATTEMPTS = 2;

export async function requestModelResponse(
  model: ResponseModelConfig,
  messages: ResponseInputItem[],
  tools: Record<string, unknown>[] = [],
  onEvent: ResponseOutputEvent = {}
): Promise<ModelResponse> {
  if (!model.model.trim()) {
    throw new Error("model name is required.");
  }
  if (!model.url.trim()) {
    throw new Error("model provider url is required.");
  }

  const baseUrl = new URL(model.url.trim());
  const normalizedPath = baseUrl.pathname.replace(/\/$/, "");
  const responseEndpoint = new URL(`${normalizedPath}/responses`, baseUrl);
  const requestBodies: Array<{ model: string; input: unknown; stream: true; tools?: Record<string, unknown>[]; temperature?: number; top_p?: number; top_k?: number; min_p?: number }> = [
    {
      model: model.model,
      input: await toResponsesInput(messages),
      stream: true,
      ...modelInferenceBody(model),
      ...(tools.length > 0 ? { tools } : {})
    }
  ];
  requestBodies.push({
    model: model.model,
    input: await toResponsesTextInput(messages),
    stream: true,
    ...modelInferenceBody(model),
    ...(tools.length > 0 ? { tools } : {})
  });

  let lastError: unknown;
  let shouldTryTextInput = false;
  for (const [bodyIndex, requestBody] of requestBodies.entries()) {
    if (bodyIndex > 0 && !shouldTryTextInput) {
      break;
    }
    for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
      if (onEvent.signal?.aborted) {
        throw onEvent.signal.reason instanceof Error ? onEvent.signal.reason : new Error("model request aborted.");
      }
      try {
        await onEvent.onDebug?.("responseapi.request.start", {
          endpoint: responseEndpoint.toString(),
          model: model.model,
          inputType: typeof requestBody.input,
          inputItemCount: Array.isArray(requestBody.input) ? requestBody.input.length : undefined,
          inputTextLength: typeof requestBody.input === "string" ? requestBody.input.length : undefined,
          toolCount: tools.length,
          stream: requestBody.stream,
          attempt,
          maxAttempts: MAX_TRANSIENT_ATTEMPTS
        });
        const response = await fetch(responseEndpoint, {
          method: "POST",
          signal: onEvent.signal,
          headers: {
            "Content-Type": "application/json",
            ...(model.token ? { Authorization: `Bearer ${model.token}` } : {})
          },
          body: JSON.stringify(requestBody)
        });

        await onEvent.onDebug?.("responseapi.request.response_received", {
          endpoint: responseEndpoint.toString(),
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          attempt,
          maxAttempts: MAX_TRANSIENT_ATTEMPTS
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          await onEvent.onDebug?.("responseapi.request.failed", {
            endpoint: responseEndpoint.toString(),
            status: response.status,
            bodyPreview: errorText.slice(0, 500),
            attempt,
            maxAttempts: MAX_TRANSIENT_ATTEMPTS
          });
          lastError = new Error(`model request failed: ${response.status}${errorText ? ` ${errorText}` : ""}`);
          if (response.status === 400 && errorText.includes("Invalid type for 'input'")) {
            shouldTryTextInput = true;
            break;
          }
          if (isRetryableStatus(response.status) && attempt < MAX_TRANSIENT_ATTEMPTS) {
            await waitBeforeRetry(attempt, onEvent);
            continue;
          }
          break;
        }

        const bodyStream = response.body;
        if (bodyStream && response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
          const streamed = await readResponsesStream(bodyStream, onEvent);
          if (streamed.content.trim() || streamed.toolCalls.length > 0) {
            await onEvent.onDebug?.("responseapi.request.stream_returned", {
              endpoint: responseEndpoint.toString(),
              contentLength: streamed.content.length,
              toolCallCount: streamed.toolCalls.length,
              outputItemCount: streamed.outputItems.length,
              attempt,
              maxAttempts: MAX_TRANSIENT_ATTEMPTS
            });
            return streamed;
          }
          lastError = new Error("model stream ended without assistant content or tool calls.");
          await onEvent.onDebug?.("responseapi.request.stream_empty", {
            endpoint: responseEndpoint.toString(),
            attempt,
            maxAttempts: MAX_TRANSIENT_ATTEMPTS
          });
          if (attempt < MAX_TRANSIENT_ATTEMPTS) {
            await waitBeforeRetry(attempt, onEvent);
            continue;
          }
          break;
        }

        const body = (await response.json()) as unknown;
        let parsed;
        try {
          parsed = parseResponsesPayload(body);
        } catch (error) {
          await onEvent.onDebug?.("responseapi.payload.parse_failed", {
            error: error instanceof Error ? error.message : String(error),
            payloadType: typeof body
          });
          throw error;
        }
        for (const summary of parsed.reasoning) {
          await onEvent.onReasoning?.(summary, "", responsePayloadInterrupt);
        }
        for (const toolCall of parsed.toolCalls) {
          await onEvent.onToolCall?.(toolCall, responsePayloadInterrupt);
        }
        if (parsed.text) {
          await onEvent.onText?.(parsed.text, parsed.text, responsePayloadInterrupt);
        }

        if (parsed.text.trim() || parsed.toolCalls.length > 0) {
          await onEvent.onDebug?.("responseapi.request.payload_returned", {
            endpoint: responseEndpoint.toString(),
            contentLength: parsed.text.length,
            toolCallCount: parsed.toolCalls.length,
            outputItemCount: parsed.outputItems.length,
            attempt,
            maxAttempts: MAX_TRANSIENT_ATTEMPTS
          });
          return parsed;
        }

        lastError = new Error("model response did not include assistant content.");
        break;
      } catch (error) {
        if (onEvent.signal?.aborted) {
          throw onEvent.signal.reason instanceof Error ? onEvent.signal.reason : error;
        }
        await onEvent.onDebug?.("responseapi.request.error", {
          endpoint: responseEndpoint.toString(),
          error: error instanceof Error ? error.message : String(error),
          attempt,
          maxAttempts: MAX_TRANSIENT_ATTEMPTS
        });
        lastError = error;
        if (isRetryableError(error) && attempt < MAX_TRANSIENT_ATTEMPTS) {
          await waitBeforeRetry(attempt, onEvent);
          continue;
        }
        break;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("model request failed.");
}

const responsePayloadInterrupt: ResponseStreamInterrupt = async (reason) => {
  if (reason instanceof Error) {
    throw reason;
  }
  const error = new Error(reason || "model request aborted.");
  error.name = "AbortError";
  throw error;
};

async function toResponsesInput(messages: ResponseInputItem[]): Promise<Array<ResponseInputItem | { role: string; content: Array<Record<string, unknown>> }>> {
  const input = [];
  for (const message of messages) {
    if (isResponseModelMessage(message)) {
      input.push({
        role: message.role,
        content: typeof message.content === "string"
          ? [{ type: "input_text" as const, text: message.content }]
          : await Promise.all(message.content.map(resolveInputContentPart))
      });
    } else {
      input.push(message);
    }
  }
  return input;
}

async function resolveInputContentPart(part: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof part.file_path !== "string") {
    return part;
  }
  const fileData = await fs.readFile(part.file_path);
  const mimeType = typeof part.mime_type === "string" && part.mime_type.trim() ? part.mime_type : "application/octet-stream";
  const dataUrl = `data:${mimeType};base64,${fileData.toString("base64")}`;
  if (part.type === "input_image") {
    return { type: "input_image", image_url: dataUrl };
  }
  if (part.type === "input_file") {
    return { type: "input_file", filename: typeof part.filename === "string" ? part.filename : "attachment", file_data: dataUrl };
  }
  return part;
}

async function toResponsesTextInput(messages: ResponseInputItem[]): Promise<string> {
  const lines = [];
  for (const message of messages) {
    if (isResponseModelMessage(message)) {
      lines.push(`${message.role}:\n${typeof message.content === "string" ? message.content : JSON.stringify(await Promise.all(message.content.map(resolveInputContentPart)))}`);
      continue;
    }

    const type = typeof message.type === "string" ? message.type : "input_item";
    if (type === "function_call") {
      const name = typeof message.name === "string" && message.name.trim() ? message.name.trim() : "unknown";
      const callId = responseToolCallId(message) ?? "tool_call";
      const args = typeof message.arguments === "string" ? message.arguments : JSON.stringify(message.arguments ?? {});
      lines.push(`assistant tool_call ${name} (${callId}):\n${args}`);
      continue;
    }
    if (type === "function_call_output") {
      const callId = typeof message.call_id === "string" && message.call_id.trim() ? message.call_id.trim() : "tool_call";
      const output = typeof message.output === "string" ? message.output : JSON.stringify(message.output ?? "");
      lines.push(`tool result (${callId}):\n${output}`);
      continue;
    }
    if (type === "reasoning") {
      lines.push(`assistant reasoning:\n${JSON.stringify(message)}`);
      continue;
    }
    lines.push(`${type}:\n${JSON.stringify(message)}`);
  }
  return lines.join("\n\n");
}

function isResponseModelMessage(message: ResponseInputItem): message is ResponseModelMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    typeof (message as { role?: unknown }).role === "string" &&
    (typeof (message as { content?: unknown }).content === "string" || Array.isArray((message as { content?: unknown }).content))
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /fetch failed|network|timeout|terminated|socket|econnreset|econnrefused|etimedout/i.test(message);
}

function modelInferenceBody(model: ResponseModelConfig): { temperature?: number; top_p?: number; top_k?: number; min_p?: number } {
  return {
    ...(typeof model.temperature === "number" ? { temperature: model.temperature } : {}),
    ...(typeof model.topP === "number" ? { top_p: model.topP } : {}),
    ...(typeof model.topK === "number" ? { top_k: model.topK } : {}),
    ...(typeof model.minP === "number" ? { min_p: model.minP } : {})
  };
}

async function waitBeforeRetry(attempt: number, onEvent: ResponseOutputEvent): Promise<void> {
  const delayMs = attempt * 750;
  await onEvent.onDebug?.("responseapi.request.retry", { attempt, nextAttempt: attempt + 1, delayMs });
  if (onEvent.signal?.aborted) {
    throw onEvent.signal.reason instanceof Error ? onEvent.signal.reason : new Error("model request aborted.");
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      onEvent.signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(onEvent.signal?.reason instanceof Error ? onEvent.signal.reason : new Error("model request aborted."));
    };
    onEvent.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

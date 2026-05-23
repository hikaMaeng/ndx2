import type { NDXModelMessage, NDXSessionDataRow } from "./types.js";
import type { NDXSessionAttachmentReference, NDXSessionDataContents, NDXToolResultContents } from "../../common/protocol/index.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export function userMessageContents(text: string, attachments: NDXSessionAttachmentReference[] = []): NDXSessionDataContents {
  return attachments.length > 0 ? { kind: "user_message", text, attachments } : { kind: "user_message", text };
}

export function assistantMessageContents(text: string): NDXSessionDataContents {
  return { kind: "assistant_message", text };
}

export function assistantDeltaContents(iteration: number, delta: string, content: string): NDXSessionDataContents {
  return { kind: "assistant_delta", iteration, delta, content };
}

export function assistantReasoningContents(iteration: number, summary: string): NDXSessionDataContents {
  return { kind: "assistant_reasoning", iteration, summary };
}

export function toolCallContents(iteration: number, toolCalls: unknown[]): NDXSessionDataContents {
  return { kind: "tool_call", iteration, toolCalls };
}

export function toolResultContents(iteration: number, results: NDXToolResultContents[]): NDXSessionDataContents {
  return { kind: "tool_result", iteration, results };
}

export function interruptContents(requestedAt: string): NDXSessionDataContents {
  return { kind: "interrupt", requestedAt };
}

export function errorContents(message: string): NDXSessionDataContents {
  return { kind: "error", message };
}

export function sessionDataText(row: Pick<NDXSessionDataRow, "type" | "contents">): string | undefined {
  if (typeof row.contents === "string") {
    return row.contents;
  }
  if (!row.contents || typeof row.contents !== "object") {
    return undefined;
  }

  const contents = row.contents as Partial<NDXSessionDataContents> & { text?: unknown; message?: unknown; content?: unknown; attachments?: unknown };
  if ((contents.kind === "user_message" || contents.kind === "assistant_message") && typeof contents.text === "string") {
    const attachments = Array.isArray(contents.attachments)
      ? contents.attachments
          .map((attachment) => {
            if (!attachment || typeof attachment !== "object") return "";
            const next = attachment as { path?: unknown; name?: unknown; mimeType?: unknown };
            const name = typeof next.name === "string" ? next.name : "attachment";
            const mimeType = typeof next.mimeType === "string" ? next.mimeType : "application/octet-stream";
            const filePath = typeof next.path === "string" ? next.path : "";
            return filePath ? `[${mimeType}] ${name}: ${filePath}` : "";
          })
          .filter(Boolean)
      : [];
    return attachments.length > 0 ? [contents.text, ...attachments].filter(Boolean).join("\n") : contents.text;
  }
  if (contents.kind === "assistant_reasoning" && typeof contents.summary === "string") {
    return contents.summary;
  }
  if (contents.kind === "error" && typeof contents.message === "string") {
    return contents.message;
  }
  if (contents.kind === "tool_call" && Array.isArray(contents.toolCalls)) {
    return contents.toolCalls
      .map((toolCall) => {
        if (!toolCall || typeof toolCall !== "object") {
          return String(toolCall);
        }
        const next = toolCall as { name?: unknown; arguments?: unknown };
        const name = typeof next.name === "string" && next.name.length > 0 ? next.name : "unknown";
        const args =
          typeof next.arguments === "string" && next.arguments.length > 0
            ? next.arguments
            : JSON.stringify(next.arguments ?? {});
        return `${name}(${args})`;
      })
      .filter((item) => item.length > 0)
      .join("\n");
  }
  if (contents.kind === "tool_result") {
    const results = Array.isArray(contents.results) ? contents.results : [];
    return results.map((result) => `${result.tool}(${result.toolCallId}) ${result.success ? "succeeded" : "failed"}:\n${stringifyToolOutput(result.output)}`).join("\n\n");
  }
  if (contents.kind === "assistant_delta" && typeof contents.content === "string") {
    return contents.content;
  }
  return undefined;
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === null || typeof output === "undefined") return "tool result unavailable";
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

export function sessionDataRowsToModelMessages(rows: NDXSessionDataRow[]): ResponseInputItem[] {
  const toolCallIterations = new Set<number>();
  for (const row of rows) {
    if (row.contents && typeof row.contents === "object" && (row.contents as { kind?: unknown }).kind === "tool_call") {
      const iteration = (row.contents as { iteration?: unknown }).iteration;
      if (typeof iteration === "number") {
        toolCallIterations.add(iteration);
      }
    }
  }

  return rows.flatMap((row) => {
    if (!row.contents || typeof row.contents !== "object") {
      const text = sessionDataText(row);
      return row.type === "user" && text ? [{ role: "user", content: text }] : row.type === "assistant" && text ? [{ role: "assistant", content: text }] : [];
    }

    const contents = row.contents as Partial<NDXSessionDataContents>;
    if (row.type === "user") {
      const content = userMessageModelContent(row.contents);
      if (typeof content === "string" && !content.trim()) {
        return [];
      }
      if (Array.isArray(content) && content.length === 0) {
        return [];
      }
      return content === undefined ? [] : [{ role: "user", content }];
    }

    if (contents.kind === "tool_call" && Array.isArray(contents.toolCalls)) {
      return contents.toolCalls.filter((toolCall): toolCall is ResponseInputItem => Boolean(toolCall && typeof toolCall === "object" && !Array.isArray(toolCall)));
    }

    if (contents.kind === "tool_result" && Array.isArray(contents.results)) {
      return contents.results.map((result) => ({
        type: "function_call_output",
        call_id: result.toolCallId || "tool_call",
        output: stringifyToolOutput(result.output)
      }));
    }

    if (contents.kind === "assistant_delta" && typeof contents.iteration === "number" && toolCallIterations.has(contents.iteration)) {
      return [];
    }

    if (contents.kind === "assistant_reasoning") {
      return [];
    }

    if (row.type === "assistant") {
      const content = sessionDataText(row);
      return typeof content === "string" && content.trim().length > 0 ? [{ role: "assistant", content }] : [];
    }

    return [];
  });
}

function userMessageModelContent(contents: unknown): string | Array<Record<string, unknown>> | undefined {
  if (!contents || typeof contents !== "object") {
    return sessionDataText({ type: "user", contents });
  }
  const payload = contents as { kind?: unknown; text?: unknown; attachments?: unknown };
  if (payload.kind !== "user_message" || !Array.isArray(payload.attachments)) {
    return sessionDataText({ type: "user", contents });
  }
  const parts: Record<string, unknown>[] = [];
  if (typeof payload.text === "string" && payload.text.trim().length > 0) {
    parts.push({ type: "input_text", text: payload.text });
  }
  for (const attachment of payload.attachments) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }
    const next = attachment as NDXSessionAttachmentReference;
    if (next.kind === "image") {
      parts.push({ type: "input_image", file_path: next.path, mime_type: next.mimeType });
    } else {
      parts.push({ type: "input_file", filename: next.name, file_path: next.path, mime_type: next.mimeType });
    }
  }
  return parts.length > 0 ? parts : sessionDataText({ type: "user", contents });
}

import type { NDXSessionAttachmentReference } from "../../../../../common/protocol/index.js";
import type { NDXSessionDataRow } from "../../../../session/types.js";
import type { NDXFinalMessagePipelineContext } from "./types.js";

export function inlineAttachmentProjectionPolicy(context: NDXFinalMessagePipelineContext): NDXFinalMessagePipelineContext {
  if (!context.inlineAttachmentDataIds.size) {
    return context;
  }
  return {
    ...context,
    inlineAttachmentMessages: context.rows.flatMap((row) => {
      const content = userMessageAttachmentParts(row, context.inlineAttachmentDataIds);
      return content.length > 0 ? [{ role: "user" as const, content }] : [];
    })
  };
}

function userMessageAttachmentParts(row: Pick<NDXSessionDataRow, "contents" | "dataid">, inlineAttachmentDataIds: Set<string>): Array<Record<string, unknown>> {
  const contents = row.contents;
  if (!contents || typeof contents !== "object") {
    return [];
  }
  const payload = contents as { kind?: unknown; attachments?: unknown };
  if ((payload.kind !== "user_message" && payload.kind !== "tool_generated_user_message") || !Array.isArray(payload.attachments)) {
    return [];
  }
  if (!inlineAttachmentDataIds.has(String(row.dataid))) {
    return [];
  }
  const parts: Record<string, unknown>[] = [];
  for (const attachment of payload.attachments) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }
    const next = attachment as NDXSessionAttachmentReference;
    if (next.kind === "image") {
      parts.push({ type: "input_image", file_path: next.path, mime_type: next.mimeType, ndx_dataid: String(row.dataid) });
    } else {
      parts.push({ type: "input_file", filename: next.name, file_path: next.path, mime_type: next.mimeType, ndx_dataid: String(row.dataid) });
    }
  }
  return parts;
}

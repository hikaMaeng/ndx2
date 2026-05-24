import { promises as fs } from "node:fs";
import type { ResponseInputItem } from "ndx/common/responseapi";
import { consumeInlineAttachmentDataIds } from "../../session/runtimeData.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../index.js";

export const inlineInputImagesHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.context.prepared.inline_input_images",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    const inlineAttachmentDataIds = await consumeInlineAttachmentDataIds(context.database, context.session.sessionid);
    if (!inlineAttachmentDataIds.size) {
      return { type: "noeffect" };
    }

    const imagePaths = new Set<string>();
    for (const row of context.sessionDataRows!) {
      if (!inlineAttachmentDataIds.has(String(row.dataid)) || !row.contents || typeof row.contents !== "object") {
        continue;
      }
      const contents = row.contents as { kind?: unknown; attachments?: unknown };
      if ((contents.kind !== "user_message" && contents.kind !== "tool_generated_user_message") || !Array.isArray(contents.attachments)) {
        continue;
      }
      for (const attachment of contents.attachments) {
        if (!attachment || typeof attachment !== "object") {
          continue;
        }
        const next = attachment as { kind?: unknown; path?: unknown };
        if (next.kind === "image" && typeof next.path === "string") {
          imagePaths.add(next.path);
        }
      }
    }
    const target = context.messages!
      .filter(isResponseModelMessage)
      .filter((message): message is { role: string; content: Array<Record<string, unknown>> } => Array.isArray(message.content))
      .flatMap((message) => message.content)
      .filter((part): part is Record<string, unknown> & { type: "input_image"; file_path?: string; mime_type?: string } =>
        part.type === "input_image" && typeof part.file_path === "string" && imagePaths.has(part.file_path)
      );
    await Promise.all(target.map(async (part) => {
      const filePath = part.file_path!;
      const data = await fs.readFile(filePath);
      const mimeType = typeof part.mime_type === "string" && part.mime_type.trim() ? part.mime_type : "application/octet-stream";
      part.image_url = `data:${mimeType};base64,${data.toString("base64")}`;
      delete part.file_path;
      delete part.mime_type;
    }));
    return { type: "noeffect" };
  }
};

function isResponseModelMessage(message: ResponseInputItem): message is { role: string; content: string | Array<Record<string, unknown>> } {
  return Boolean(
    message &&
    typeof message === "object" &&
    typeof (message as { role?: unknown }).role === "string" &&
    (typeof (message as { content?: unknown }).content === "string" || Array.isArray((message as { content?: unknown }).content))
  );
}

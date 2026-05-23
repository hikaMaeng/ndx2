import { promises as fs } from "node:fs";
import type { ResponseInputItem } from "ndx/common/responseapi";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../index.js";

export const inlineInputImagesHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.context.prepared.inline_input_images",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    if (context.iteration !== 1 || !context.input?.contents || typeof context.input.contents !== "object") {
      return { type: "noeffect" };
    }

    const contents = context.input.contents as { kind?: unknown; attachments?: unknown };
    if (contents.kind !== "user_message" || !Array.isArray(contents.attachments)) {
      return { type: "noeffect" };
    }

    const imageAttachments = contents.attachments
      .filter((attachment): attachment is { kind: "image"; path: string; mimeType: string } => {
        if (!attachment || typeof attachment !== "object") {
          return false;
        }
        const next = attachment as { kind?: unknown; path?: unknown; mimeType?: unknown };
        return next.kind === "image" && typeof next.path === "string" && typeof next.mimeType === "string";
      });
    if (imageAttachments.length === 0) {
      return { type: "noeffect" };
    }

    const imageUrls = new Map<string, string>();
    for (const attachment of imageAttachments) {
      const data = await fs.readFile(attachment.path);
      imageUrls.set(attachment.path, `data:${attachment.mimeType};base64,${data.toString("base64")}`);
    }

    let replaced = 0;
    const messages = (context.messages ?? []).map((message) => {
      if (!isResponseModelMessage(message) || !Array.isArray(message.content)) {
        return message;
      }

      let messageReplaced = false;
      const content = message.content.map((part) => {
        if (part.type !== "input_image" || typeof part.file_path !== "string") {
          return part;
        }
        const imageUrl = imageUrls.get(part.file_path);
        if (!imageUrl) {
          return part;
        }
        replaced += 1;
        messageReplaced = true;
        return { type: "input_image", image_url: imageUrl };
      });
      return messageReplaced ? { ...message, content } : message;
    });

    return replaced > 0 ? { type: "noeffect", replaceMessages: messages } : { type: "noeffect" };
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
